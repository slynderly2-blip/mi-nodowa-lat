import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { checkAdminAuth } from "../middleware/auth.js";
import { getOrCreateUser, logTransaction } from "../services/economy.js";
import { upload } from "../services/uploader.js";
import { broadcastWs } from "../services/websocket.js";
import { buildUserInbox } from "./deliveries.routes.js";

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

// Guardar Catálogo Completo directamente en Formato Código JSON
router.post("/store/raw-json", (req, res) => {
  const { jsonContent } = req.body;
  if (!jsonContent) return res.status(400).json({ ok: false, error: "Contenido JSON requerido" });

  let parsed;
  try {
    parsed = typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;
  } catch (err) {
    return res.status(400).json({ ok: false, error: "Sintaxis JSON inválida: " + err.message });
  }

  if (!Array.isArray(parsed)) {
    return res.status(400).json({ ok: false, error: "El catálogo debe ser un arreglo [ ... ] de productos." });
  }

  // Validar y sanear cada producto
  const cleanItems = parsed.map((item, idx) => ({
    id: item.id || `item_${Date.now()}_${idx}`,
    name: (item.name || "Producto").trim(),
    category: item.category || "items",
    priceCoins: Math.floor(Number(item.priceCoins || 0)),
    priceUsdt: Number(item.priceUsdt || 0),
    description: (item.description || "").trim(),
    iconType: item.iconType || "box",
    command: item.command ? item.command.trim() : null,
    giveCoins: Math.floor(Number(item.giveCoins || 0)),
    badge: item.badge ? item.badge.trim() : null
  }));

  db.storeItems = cleanItems;
  saveDb();
  broadcastWs("STORE_UPDATED", db.storeItems);

  res.json({ ok: true, message: `Catálogo actualizado con éxito (${cleanItems.length} artículos).`, items: cleanItems });
});

// Listar todos los jugadores para el panel admin
router.get("/players", (req, res) => {
  const list = Object.values(db.users || {})
    .filter(u => u && u.username && u.username !== "null")
    .map(u => {
      // Limpiar displayName corrupto (puede tener JSON crudo si hubo un bug)
      let displayName = u.displayName || u.username;
      if (typeof displayName !== "string" || displayName.startsWith("{") || displayName.length > 60) {
        displayName = u.username;
      }
      return {
        username: u.username,
        displayName,
        avatarUrl: u.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(displayName)}/64`,
        wallet: Math.floor(u.wallet || 0),
        bank: Math.floor(u.bank || 0),
        linked: !!(u.linked || u.linkedAt),
        bio: u.bio || "",
        selectedTitle: u.selectedTitle || (u.stats && u.stats.activeTitle) || "Novato",
        equippedRank: u.equippedRank || (u.stats && (u.stats.equippedRank || u.stats.tier)) || "NOVICIO",
        lastActive: u.lastActive || u.createdAt || null
      };
    });

  res.json({ ok: true, players: list });
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

// ─── AUDITORÍA DE USUARIOS ────────────────────────────────────────────────────

// Buzón completo de un usuario específico (vista admin)
router.get("/user-inbox/:username", (req, res) => {
  try {
    const uname = (req.params.username || "").trim().toLowerCase();
    if (!uname) return res.status(400).json({ ok: false, error: "Usuario requerido" });

    const user = db.users[uname];
    if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const inbox = buildUserInbox(uname, 200);

    // Enriquecer con reclamos asociados
    const issuesByDeliveryId = {};
    for (const issue of (db.deliveryIssues || [])) {
      if (!issuesByDeliveryId[issue.deliveryId]) {
        issuesByDeliveryId[issue.deliveryId] = issue;
      }
    }

    // Enriquecer con mensajes admin asociados a la entrega/orden
    const messagesByRef = {};
    for (const msg of (db.messages || [])) {
      if (msg.refId) {
        if (!messagesByRef[msg.refId]) messagesByRef[msg.refId] = [];
        messagesByRef[msg.refId].push(msg);
      }
    }

    const enriched = inbox.map(entry => ({
      ...entry,
      relatedIssue:    issuesByDeliveryId[entry.id] || null,
      adminMessages:   messagesByRef[entry.id]      || []
    }));

    res.json({
      ok: true,
      username: uname,
      displayName: user.displayName || user.username,
      totalEntries: enriched.length,
      inbox: enriched
    });
  } catch (err) {
    console.error("[Admin] Error en user-inbox:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Perfil completo de un usuario para auditoría
router.get("/user-profile/:username", (req, res) => {
  try {
    const uname = (req.params.username || "").trim().toLowerCase();
    if (!uname) return res.status(400).json({ ok: false, error: "Usuario requerido" });

    const user = db.users[uname];
    if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const userTx = (db.transactions || [])
      .filter(tx => (tx.from || "").toLowerCase() === uname || (tx.to || "").toLowerCase() === uname)
      .slice(0, 100);

    const userIssues = (db.deliveryIssues || [])
      .filter(i => (i.player || "").toLowerCase() === uname);

    const userOrders = (db.orders || [])
      .filter(o => (o.username || "").toLowerCase() === uname)
      .map(o => ({
        id: o.id,
        itemTitle: o.itemTitle,
        priceUsdt: o.priceUsdt || 0,
        giveCoins: o.giveCoins || 0,
        command: o.command || null,
        txid: o.txid || null,
        receiptImage: o.receiptImage || null,
        status: o.status,
        adminNote: o.adminNote || null,
        reviewedAt: o.reviewedAt || null,
        createdAt: o.createdAt
      }));

    const userMessages = (db.messages || [])
      .filter(m => (m.to || "").toLowerCase() === uname)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);

    const totalSpentUsdt    = userOrders.filter(o => o.status === "APPROVED").reduce((s, o) => s + (o.priceUsdt || 0), 0);
    const totalSpentCoins   = userTx.filter(tx => tx.type === "STORE_PURCHASE" && (tx.from || "").toLowerCase() === uname).reduce((s, tx) => s + (tx.amount || 0), 0);
    const totalReceivedCoins= userTx.filter(tx => ["BINANCE_CREDIT","ADMIN_ADJUST","ADDON_REWARD","INTEREST"].includes(tx.type) && (tx.to || "").toLowerCase() === uname).reduce((s, tx) => s + (tx.amount || 0), 0);

    res.json({
      ok: true,
      user: {
        username: user.username,
        displayName: user.displayName || user.username,
        avatarUrl: user.avatarUrl || `https://mc-heads.net/avatar/${user.displayName || user.username}/64`,
        bio: user.bio || "",
        wallet: Math.floor(user.wallet || 0),
        bank: Math.floor(user.bank || 0),
        linked: !!(user.linked || user.linkedAt),
        linkedAt: user.linkedAt || null,
        equippedRank: user.equippedRank || "NOVICIO",
        selectedTitle: user.selectedTitle || "Novato",
        socialLinks: user.socialLinks || {},
        createdAt: user.createdAt || null,
        lastActive: user.lastActive || null,
        totalInterestEarned: Math.floor(user.totalInterestEarned || 0),
        stats: user.stats || {}
      },
      summary: {
        totalSpentUsdt: parseFloat(totalSpentUsdt.toFixed(2)),
        totalSpentCoins,
        totalReceivedCoins,
        totalOrders: userOrders.length,
        pendingOrders: userOrders.filter(o => o.status === "PENDING").length,
        totalIssues: userIssues.length,
        pendingIssues: userIssues.filter(i => i.status === "PENDING").length,
        totalTransactions: userTx.length,
        unreadMessages: userMessages.filter(m => !m.readAt).length
      },
      transactions: userTx,
      orders: userOrders,
      issues: userIssues,
      messages: userMessages
    });
  } catch (err) {
    console.error("[Admin] Error en user-profile:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Re-encolar entrega directamente sin reclamo previo (desde panel auditoría)
router.post("/delivery-issues/redeliver-direct", (req, res) => {
  try {
    const { deliveryId } = req.body;
    if (!deliveryId) return res.status(400).json({ ok: false, error: "deliveryId requerido" });

    const delivery = (db.deliveries || []).find(d => d.id === deliveryId);
    if (!delivery) return res.status(404).json({ ok: false, error: "Entrega no encontrada" });
    if (!delivery.command) return res.status(400).json({ ok: false, error: "Esta entrega no tiene comando para re-encolar" });

    delivery.status       = "PENDING";
    delivery.deliveredAt  = null;
    delivery.redeliveredAt = new Date().toISOString();
    saveDb();

    broadcastWs("NEW_DELIVERY", delivery);
    res.json({ ok: true, message: "Entrega re-encolada correctamente", delivery });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/send-message", (req, res) => {
  try {
    const { to, subject, body, refId, refType, action } = req.body;
    // refId: id de la entrega/orden/reclamo relacionado (opcional)
    // refType: "delivery" | "order" | "issue" (opcional)
    // action: acción que el admin ejecutó junto al mensaje (opcional, solo informativo)
    if (!to || !body) return res.status(400).json({ ok: false, error: "Destinatario y cuerpo son requeridos" });

    const uname = to.trim().toLowerCase();
    if (!db.users[uname]) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    if (!Array.isArray(db.messages)) db.messages = [];

    const msg = {
      id:        "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      to:        uname,
      from:      "Admin",
      subject:   (subject || "Mensaje del Administrador").trim(),
      body:      body.trim(),
      refId:     refId  || null,
      refType:   refType || null,
      action:    action  || null,
      readAt:    null,
      createdAt: new Date().toISOString()
    };

    db.messages.unshift(msg);
    saveDb();

    broadcastWs("ADMIN_MESSAGE", { username: uname, message: msg });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── EDICIÓN DE ÓRDENES Y RECLAMOS YA PROCESADOS ─────────────────────────────

// Editar nota/estado de una orden Binance ya procesada
router.post("/orders/edit", (req, res) => {
  try {
    const { orderId, adminNote, status } = req.body;
    if (!orderId) return res.status(400).json({ ok: false, error: "orderId requerido" });

    const order = (db.orders || []).find(o => o.id === orderId);
    if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada" });

    if (adminNote !== undefined) order.adminNote = adminNote.trim();
    if (status && ["PENDING","APPROVED","REJECTED"].includes(status)) {
      order.status = status;
      order.reviewedAt = new Date().toISOString();
    }
    order.editedAt = new Date().toISOString();

    saveDb();
    res.json({ ok: true, order });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Editar nota/estado de un reclamo ya resuelto
router.post("/delivery-issues/edit", (req, res) => {
  try {
    const { issueId, adminNote, status } = req.body;
    if (!issueId) return res.status(400).json({ ok: false, error: "issueId requerido" });

    const issue = (db.deliveryIssues || []).find(i => i.id === issueId);
    if (!issue) return res.status(404).json({ ok: false, error: "Reclamo no encontrado" });

    if (adminNote !== undefined) issue.adminNote = adminNote.trim();
    if (status && ["PENDING","REDELIVERED","RESOLVED","DISMISSED"].includes(status)) {
      issue.status    = status;
      issue.resolvedAt = new Date().toISOString();
    }
    issue.editedAt = new Date().toISOString();

    // Si se cambia de vuelta a PENDING, re-habilitar entrega
    if (status === "PENDING") {
      const delivery = (db.deliveries || []).find(d => d.id === issue.deliveryId);
      if (delivery) {
        delivery.reportedIssue = true;
      }
    }

    saveDb();
    broadcastWs("DELIVERY_ISSUE_UPDATED", issue);
    res.json({ ok: true, issue });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reembolso desde auditoría: devuelve las NC al jugador y marca la entrega
router.post("/refund", (req, res) => {
  try {
    const { username, refId, refType, amount, reason } = req.body;
    if (!username || !refId) return res.status(400).json({ ok: false, error: "username y refId requeridos" });

    const uname = username.trim().toLowerCase();
    const user  = db.users[uname];
    if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const numAmount = Math.floor(Number(amount || 0));
    if (numAmount > 0) {
      user.wallet = (user.wallet || 0) + numAmount;
      logTransaction("ADMIN", user.username, numAmount, "ADMIN_ADJUST", `Reembolso: ${reason || "Reembolso administrativo"}`);
    }

    // Marcar la entrega u orden como reembolsada
    if (refType === "order") {
      const order = (db.orders || []).find(o => o.id === refId);
      if (order) {
        order.status      = "REFUNDED";
        order.adminNote   = reason || "Reembolso administrativo";
        order.reviewedAt  = new Date().toISOString();
      }
    } else {
      const delivery = (db.deliveries || []).find(d => d.id === refId);
      if (delivery) {
        delivery.status    = "REFUNDED";
        delivery.adminNote = reason || "Reembolso administrativo";
      }
    }

    saveDb();
    broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });
    res.json({ ok: true, newWallet: user.wallet });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
