import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Helper: construye el buzón completo de un usuario (reutilizable por la ruta pública y la de admin)
function buildUserInbox(uname, limit = 100) {
  // 1. Entregas en servidor (db.deliveries) — tienen command, itemTitle, status real
  const rawDeliveries = uname
    ? (db.deliveries || []).filter(d => (d.username || d.targetGamertag || "").toLowerCase() === uname)
    : (db.deliveries || []);

  const list = rawDeliveries.map(d => {
    // Buscar el ítem de catálogo para rellenar precio si falta
    const catalogItem = d.itemId
      ? (db.storeItems || []).find(i => i.id === d.itemId)
      : null;

    return {
      id: d.id,
      username: d.username || d.targetGamertag || "",
      itemTitle: d.itemTitle || "Artículo",
      itemId: d.itemId || null,
      itemCategory: catalogItem?.category || null,
      itemDescription: catalogItem?.description || null,
      command: d.command || null,           // comando real ejecutado en el servidor
      commandStatus: d.status === "DELIVERED" ? "Ejecutado en servidor" : "En cola",
      giveCoins: d.giveCoins || 0,
      priceCoins: d.priceCoins || catalogItem?.priceCoins || 0,
      priceUsdt: d.priceUsdt || catalogItem?.priceUsdt || 0,
      paymentMethod: d.isBinanceOrder ? "Binance USDT" : (d.priceCoins || catalogItem?.priceCoins ? "Nodocoins (NC)" : "Gratuito / Comando Directo"),
      status: d.status || "PENDING",
      reportedIssue: !!d.reportedIssue,
      issueNote: d.issueNote || null,
      redeliveredAt: d.redeliveredAt || null,
      deliveredAt: d.deliveredAt || null,
      createdAt: d.createdAt || new Date().toISOString(),
      source: "SERVER_DELIVERY"
    };
  });

  // 2. Órdenes Binance (db.orders)
  const userOrders = (db.orders || [])
    .filter(o => !uname || (o.username || "").toLowerCase() === uname)
    .map(o => {
      const catalogItem = o.itemId
        ? (db.storeItems || []).find(i => i.id === o.itemId)
        : null;
      return {
        id: o.id,
        username: o.username,
        itemTitle: o.itemTitle || (o.giveCoins ? `${Number(o.giveCoins).toLocaleString()} NC` : "Recarga Binance"),
        itemId: o.itemId || null,
        itemCategory: catalogItem?.category || "coins",
        itemDescription: catalogItem?.description || null,
        command: o.command || catalogItem?.command || null,
        commandStatus: o.status === "APPROVED"
          ? (o.command ? "Ejecutado en servidor" : "Monedas acreditadas")
          : (o.status === "REJECTED" ? "Rechazado" : "Pendiente de aprobación"),
        giveCoins: o.giveCoins || 0,
        priceCoins: 0,
        priceUsdt: o.priceUsdt || 0,
        paymentMethod: "Binance USDT",
        status: o.status === "APPROVED" ? "DELIVERED" : (o.status === "REJECTED" ? "REJECTED" : "PENDING"),
        reportedIssue: !!o.reportedIssue,
        issueNote: o.issueNote || null,
        txid: o.txid || null,
        receiptImage: o.receiptImage || null,
        reviewedAt: o.reviewedAt || null,
        adminNote: o.adminNote || null,
        createdAt: o.createdAt || new Date().toISOString(),
        source: "BINANCE_ORDER"
      };
    });

  // 3. Compras directas con NC desde la tienda (db.transactions STORE_PURCHASE)
  const userPurchases = (db.transactions || [])
    .filter(t => t.type === "STORE_PURCHASE" && (!uname || (t.from || "").toLowerCase() === uname))
    .map(t => {
      const itemName = t.note ? t.note.replace(/^Compra de /i, "") : "Artículo de Tienda";
      // Intentar encontrar el ítem por nombre para obtener el comando
      const catalogItem = (db.storeItems || []).find(
        i => i.name && i.name.toLowerCase() === itemName.toLowerCase()
      );
      return {
        id: t.id,
        username: t.from,
        itemTitle: itemName,
        itemId: catalogItem?.id || null,
        itemCategory: catalogItem?.category || "items",
        itemDescription: catalogItem?.description || null,
        command: catalogItem?.command || null,
        commandStatus: catalogItem?.command ? "Ejecutado en servidor" : "Entregado automáticamente",
        giveCoins: catalogItem?.giveCoins || 0,
        priceCoins: t.amount || 0,
        priceUsdt: catalogItem?.priceUsdt || 0,
        paymentMethod: "Nodocoins (NC)",
        status: "DELIVERED",
        reportedIssue: false,
        issueNote: null,
        createdAt: t.createdAt || new Date().toISOString(),
        source: "STORE_PURCHASE"
      };
    });

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
  return combined.slice(0, limit);
}

// Consultar buzón de entregas y compras de un jugador
router.get("/", (req, res) => {
  try {
    const uname = (req.query.username || "").trim().toLowerCase();
    const inbox = buildUserInbox(uname, 50);
    res.json({ ok: true, deliveries: inbox });
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

export { buildUserInbox };
export default router;
