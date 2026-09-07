import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Consultar buzón de entregas y compras de un jugador
router.get("/", (req, res) => {
  try {
    const uname = (req.query.username || "").trim().toLowerCase();
    
    // 1. Entregas en servidor
    let list = uname
      ? (db.deliveries || []).filter(d => (d.username || d.targetGamertag || "").toLowerCase() === uname)
      : (db.deliveries || []);

    // 2. Órdenes Binance del usuario (recargas USDT / packs)
    const userOrders = (db.orders || [])
      .filter(o => !uname || (o.username || "").toLowerCase() === uname)
      .map(o => ({
        id: o.id,
        username: o.username,
        itemTitle: o.itemTitle || (o.giveCoins ? `${o.giveCoins.toLocaleString()} NC` : "Recarga Binance"),
        command: o.command || null,
        giveCoins: o.giveCoins || 0,
        priceUsdt: o.priceUsdt || 0,
        status: o.status === "APPROVED" ? "DELIVERED" : (o.status === "REJECTED" ? "REJECTED" : "PENDING"),
        reportedIssue: !!o.reportedIssue,
        isBinanceOrder: true,
        receiptImage: o.receiptImage,
        txid: o.txid,
        createdAt: o.createdAt || new Date().toISOString()
      }));

    // 3. Compras en tienda desde transacciones
    const userPurchases = (db.transactions || [])
      .filter(t => t.type === "STORE_PURCHASE" && (!uname || (t.from || "").toLowerCase() === uname))
      .map(t => ({
        id: t.id,
        username: t.from,
        itemTitle: t.note ? t.note.replace(/^Compra de /i, "") : "Artículo de Tienda",
        command: null,
        priceCoins: t.amount,
        status: "DELIVERED",
        isStorePurchase: true,
        createdAt: t.createdAt || new Date().toISOString()
      }));

    // Combinar sin duplicados
    const combined = [...list];
    const existingIds = new Set(combined.map(d => d.id));

    for (const ord of userOrders) {
      if (!existingIds.has(ord.id)) {
        combined.push(ord);
        existingIds.add(ord.id);
      }
    }
    for (const pur of userPurchases) {
      if (!existingIds.has(pur.id)) {
        combined.push(pur);
        existingIds.add(pur.id);
      }
    }

    // Ordenar por fecha descendente
    combined.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({ ok: true, deliveries: combined.slice(0, 50) });
  } catch (err) {
    console.error("[Deliveries] Error al obtener buzón:", err);
    res.status(500).json({ ok: false, error: err.message, deliveries: [] });
  }
});

// Reportar "No recibí mi producto"
router.post("/report-issue", (req, res) => {
  try {
    const { deliveryId, username, note } = req.body;
    if (!deliveryId) return res.status(400).json({ ok: false, error: "Identificador de entrega requerido" });

    let delivery = (db.deliveries || []).find(d => d.id === deliveryId);
    if (!delivery) {
      // Buscar en órdenes Binance
      delivery = (db.orders || []).find(o => o.id === deliveryId);
    }

    const player = (username || (delivery && delivery.username) || "Desconocido").trim();
    const cleanNote = (note || "").trim();

    if (delivery) {
      delivery.reportedIssue = true;
      delivery.issueReportedAt = new Date().toISOString();
      delivery.issueNote = cleanNote;
    }

    const issue = {
      id: "diss_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      deliveryId: delivery ? delivery.id : deliveryId,
      player,
      itemTitle: (delivery && delivery.itemTitle) || "Artículo / Orden",
      command: (delivery && delivery.command) || "",
      note: cleanNote || "El jugador reportó que no recibió su producto o recarga.",
      status: "PENDING",
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(db.deliveryIssues)) db.deliveryIssues = [];
    db.deliveryIssues.unshift(issue);
    saveDb();

    broadcastWs("NEW_DELIVERY_ISSUE", issue);
    console.log(`[Reclamo] Jugador ${player} reportó no haber recibido: ${issue.itemTitle}`);

    res.json({ ok: true, message: "Reporte enviado al administrador exitosamente.", issue });
  } catch (err) {
    console.error("[Deliveries] Error al procesar reporte:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
