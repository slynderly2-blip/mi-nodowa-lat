import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser, logTransaction } from "../services/economy.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Obtener catálogo público de artículos
router.get("/items", (req, res) => {
  res.json({ ok: true, items: db.storeItems || [] });
});

// Comprar artículo con Nodocoins
router.post("/buy", (req, res) => {
  const { username, itemId } = req.body;
  if (!username || !itemId) return res.status(400).json({ ok: false, error: "Datos incompletos para la compra" });

  const item = (db.storeItems || []).find(i => i.id === itemId);
  if (!item) return res.status(404).json({ ok: false, error: "Artículo no encontrado en el catálogo" });

  const price = Math.floor(Number(item.priceCoins || 0));
  if (price <= 0) return res.status(400).json({ ok: false, error: "Artículo no disponible para compra con monedas." });

  const user = getOrCreateUser(username);
  if (user.wallet < price) {
    return res.status(400).json({ ok: false, error: `Saldo insuficiente. Necesitas ${price.toLocaleString()} NC.` });
  }

  // Cobrar saldo
  user.wallet -= price;
  logTransaction(user.username, "STORE", price, "STORE_PURCHASE", `Compra de ${item.name}`);

  // Encolar entrega si tiene comando o monedas
  let delivery = null;
  if (item.command || item.giveCoins > 0) {
    delivery = {
      id: "del_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      username: user.username,
      itemTitle: item.name,
      command: item.command ? item.command.replace(/{player}/g, user.displayName || user.username) : null,
      giveCoins: item.giveCoins || 0,
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    db.deliveries.unshift(delivery);
    broadcastWs("NEW_DELIVERY", delivery);
  }

  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });
  res.json({
    ok: true,
    message: `¡Compraste ${item.name}! Revisa tu buzón o ingresa al juego.`,
    user,
    delivery
  });
});

export default router;
