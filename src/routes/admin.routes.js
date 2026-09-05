import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { checkAdminAuth } from "../middleware/auth.js";
import { getOrCreateUser, logTransaction } from "../services/economy.js";
import { upload } from "../services/uploader.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Login de Administrador
router.post("/login", (req, res) => {
  const { password } = req.body;
  if (password === db.config.adminPassword) {
    res.json({ ok: true, token: db.config.adminPassword });
  } else {
    res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
  }
});

// Todas las rutas siguientes requieren checkAdminAuth
router.use(checkAdminAuth);

// Estadísticas del Panel Admin
router.get("/stats", (req, res) => {
  const totalUsers = Object.keys(db.users || {}).length;
  const pendingOrders = (db.orders || []).filter(o => o.status === "PENDING").length;
  const approvedOrders = (db.orders || []).filter(o => o.status === "APPROVED");
  const totalSalesUsdt = approvedOrders.reduce((sum, o) => sum + (o.priceUsdt || 0), 0);
  const totalCoins = Object.values(db.users || {}).reduce((sum, u) => sum + (u.wallet || 0) + (u.bank || 0), 0);
  const pendingDeliveryIssues = (db.deliveryIssues || []).filter(i => i.status === "PENDING").length;

  res.json({
    ok: true,
    stats: {
      totalUsers,
      pendingOrders,
      totalSalesUsdt,
      totalCoins,
      activeP2P: (db.p2pMarket || []).length,
      pendingDeliveryIssues
    }
  });
});

// Ver todos los comprobantes y órdenes Binance
router.get("/orders", (req, res) => {
  res.json({ ok: true, orders: db.orders || [] });
});

// Aprobar Orden de Binance
router.post("/orders/approve", (req, res) => {
  const { orderId, note } = req.body;
  const order = (db.orders || []).find(o => o.id === orderId);
  if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada" });
  if (order.status !== "PENDING") return res.status(400).json({ ok: false, error: "La orden ya fue procesada" });

  order.status = "APPROVED";
  order.reviewedAt = new Date().toISOString();
  order.adminNote = note || "Aprobado por el Administrador";

  const user = getOrCreateUser(order.username);

  // Acreditar monedas si aplica
  if (order.giveCoins > 0) {
    user.wallet = (user.wallet || 0) + order.giveCoins;
    logTransaction("BINANCE", user.username, order.giveCoins, "BINANCE_CREDIT", `Acreditación por compra Binance (${order.itemTitle})`);
  }

  // Encolar comando si aplica
  if (order.command) {
    const delivery = {
      id: "del_binance_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      username: user.username,
      itemTitle: order.itemTitle,
      command: order.command.replace(/{player}/g, user.displayName || user.username),
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    db.deliveries.unshift(delivery);
    broadcastWs("NEW_DELIVERY", delivery);
  }

  saveDb();

  broadcastWs("ORDER_APPROVED", order);
  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });

  res.json({ ok: true, message: "Orden aprobada con éxito", order });
});

// Rechazar Orden
router.post("/orders/reject", (req, res) => {
  const { orderId, reason } = req.body;
  const order = (db.orders || []).find(o => o.id === orderId);
  if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada" });

  order.status = "REJECTED";
  order.reviewedAt = new Date().toISOString();
  order.adminNote = reason || "Comprobante no válido";
  saveDb();

  broadcastWs("ORDER_REJECTED", order);
  res.json({ ok: true, message: "Orden rechazada", order });
});

// Reclamos de entregas ("No recibí mi producto")
router.get("/delivery-issues", (req, res) => {
  res.json({ ok: true, issues: db.deliveryIssues || [] });
});

router.post("/delivery-issues/action", (req, res) => {
  const { issueId, action, adminNote } = req.body; // "redeliver" | "resolve" | "dismiss"
  if (!issueId || !action) return res.status(400).json({ ok: false, error: "Parámetros incompletos" });

  const issue = (db.deliveryIssues || []).find(i => i.id === issueId);
  if (!issue) return res.status(404).json({ ok: false, error: "Reclamo no encontrado" });

  const delivery = (db.deliveries || []).find(d => d.id === issue.deliveryId);

  if (action === "redeliver") {
    if (delivery) {
      delivery.status = "PENDING";
      delivery.deliveredAt = null;
      delivery.reportedIssue = false;
      delivery.redeliveredAt = new Date().toISOString();
      broadcastWs("NEW_DELIVERY", delivery);
    }
    issue.status = "REDELIVERED";
    issue.adminNote = adminNote || "Comando re-encolado en Minecraft para entrega inmediata.";
  } else if (action === "resolve") {
    issue.status = "RESOLVED";
    issue.adminNote = adminNote || "Resuelto por el Administrador.";
  } else if (action === "dismiss") {
    issue.status = "DISMISSED";
    issue.adminNote = adminNote || "Desestimado.";
  }

  issue.resolvedAt = new Date().toISOString();
  saveDb();

  broadcastWs("DELIVERY_ISSUE_UPDATED", issue);
  res.json({ ok: true, message: `Reclamo actualizado a ${issue.status}.`, issue });
});

// Gestión de Catálogo de Tienda
router.post("/store/save-item", (req, res) => {
  const { id, name, category, priceCoins, priceUsdt, description, iconType, command, giveCoins, badge } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: "Nombre obligatorio" });

  const itemId = id || "item_" + Date.now();
  const existingIdx = (db.storeItems || []).findIndex(i => i.id === itemId);

  const itemObj = {
    id: itemId,
    name: name.trim(),
    category: category || "items",
    priceCoins: Math.floor(Number(priceCoins || 0)),
    priceUsdt: Number(priceUsdt || 0),
    description: (description || "").trim(),
    iconType: iconType || "box",
    command: command ? command.trim() : null,
    giveCoins: Math.floor(Number(giveCoins || 0)),
    badge: badge ? badge.trim() : null
  };

  if (existingIdx >= 0) {
    db.storeItems[existingIdx] = itemObj;
  } else {
    db.storeItems.push(itemObj);
  }

  saveDb();
  broadcastWs("STORE_UPDATED", db.storeItems);
  res.json({ ok: true, item: itemObj });
});

router.post("/store/delete-item", (req, res) => {
  const { itemId } = req.body;
  db.storeItems = (db.storeItems || []).filter(i => i.id !== itemId);
  saveDb();
  broadcastWs("STORE_UPDATED", db.storeItems);
  res.json({ ok: true, message: "Artículo eliminado" });
});

// Ajuste administrativo de saldo
router.post("/player/adjust-balance", (req, res) => {
  const { username, amount, action } = req.body; // "add" | "sub" | "set"
  const numAmount = Math.floor(Number(amount));
  if (!username || isNaN(numAmount)) return res.status(400).json({ ok: false, error: "Datos inválidos" });

  const user = getOrCreateUser(username);
  if (action === "set") user.wallet = Math.max(0, numAmount);
  else if (action === "add") user.wallet += numAmount;
  else if (action === "sub") user.wallet = Math.max(0, user.wallet - numAmount);

  logTransaction("ADMIN", user.username, numAmount, "ADMIN_ADJUST", `Ajuste manual (${action})`);
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });
  res.json({ ok: true, user });
});

// Configuración de Binance Pay
router.post("/qr/update", upload.single("qrImage"), (req, res) => {
  const { payId, walletAddress, instruction } = req.body;
  if (!db.config) db.config = {};
  if (!db.config.binance) db.config.binance = {};

  if (payId) db.config.binance.payId = payId.trim();
  if (walletAddress) db.config.binance.walletAddress = walletAddress.trim();
  if (instruction) db.config.binance.instruction = instruction.trim();
  if (req.file) db.config.binance.qrImage = `/uploads/${req.file.filename}`;

  saveDb();
  broadcastWs("CONFIG_UPDATED", db.config);
  res.json({ ok: true, message: "Datos de Binance actualizados", binance: db.config.binance });
});

// Reportes anti-estafas de jugadores
router.get("/reports", (req, res) => {
  const reports = (db.ratings || []).filter(r => r.type === "REPORT");
  res.json({ ok: true, reports });
});

router.post("/reports/resolve", (req, res) => {
  const { reportId, status } = req.body;
  const report = (db.ratings || []).find(r => r.id === reportId);
  if (!report) return res.status(404).json({ ok: false, error: "Reporte no encontrado" });

  report.status = status || "RESOLVED";
  report.resolvedAt = new Date().toISOString();
  saveDb();

  res.json({ ok: true, message: `Reporte actualizado a ${report.status}`, report });
});

export default router;
