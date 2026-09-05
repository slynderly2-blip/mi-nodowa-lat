import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { upload } from "../services/uploader.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Consultar datos públicos de Binance Pay
router.get("/binance-info", (req, res) => {
  res.json({ ok: true, binance: db.config?.binance || {} });
});

// Crear orden de compra Binance y subir comprobante
router.post("/create", upload.single("receiptImage"), (req, res) => {
  try {
    const { username, itemId, txid } = req.body;
    if (!username || !itemId) {
      return res.status(400).json({ ok: false, error: "Faltan datos obligatorios de la orden" });
    }

    const item = (db.storeItems || []).find(i => i.id === itemId);
    if (!item) return res.status(404).json({ ok: false, error: "Artículo no encontrado" });

    const order = {
      id: "ord_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      username: username.trim(),
      itemId: item.id,
      itemTitle: item.name,
      priceUsdt: Number(item.priceUsdt || 0),
      giveCoins: Number(item.giveCoins || 0),
      command: item.command || null,
      txid: (txid || "").trim(),
      receiptImage: req.file ? `/uploads/${req.file.filename}` : null,
      status: "PENDING",
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(db.orders)) db.orders = [];
    db.orders.unshift(order);
    saveDb();

    broadcastWs("NEW_ORDER", order);
    console.log(`[Binance] Nueva orden ${order.id} creada por ${order.username} para ${order.itemTitle}`);

    res.json({
      ok: true,
      message: "Comprobante recibido. El administrador verificará y aprobará tu compra.",
      order
    });
  } catch (err) {
    console.error("Error al crear orden:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Ver órdenes de un jugador
router.get("/my-orders/:username", (req, res) => {
  const uname = req.params.username.trim().toLowerCase();
  const orders = (db.orders || []).filter(o => (o.username || "").toLowerCase() === uname);
  res.json({ ok: true, orders });
});

export default router;
