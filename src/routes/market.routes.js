import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser, logTransaction } from "../services/economy.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Obtener todas las publicaciones activas del mercado P2P
router.get("/listings", (req, res) => {
  res.json({ ok: true, market: db.p2pMarket || [] });
});

// Publicar un artículo en el mercado P2P
router.post("/publish", (req, res) => {
  const { seller, title, itemType, quantity, price, description } = req.body;
  const numPrice = Math.floor(Number(price));
  const numQty = Math.max(1, Math.floor(Number(quantity) || 1));

  if (!seller || !title || !itemType || isNaN(numPrice) || numPrice <= 0) {
    return res.status(400).json({ ok: false, error: "Completa todos los campos obligatorios del artículo." });
  }

  const user = getOrCreateUser(seller);
  if (!user.linked) {
    return res.status(403).json({ ok: false, error: "Debes vincular tu cuenta con Minecraft para vender en el mercado." });
  }

  const listing = {
    id: "p2p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    seller: user.displayName || user.username,
    title: title.trim(),
    itemType: itemType.trim().toLowerCase(),
    quantity: numQty,
    price: numPrice,
    description: (description || "").trim(),
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(db.p2pMarket)) db.p2pMarket = [];
  db.p2pMarket.unshift(listing);
  saveDb();

  broadcastWs("P2P_NEW_LISTING", listing);
  res.json({ ok: true, message: "Artículo publicado en el mercado P2P", listing });
});

// Comprar artículo de otro jugador en el mercado P2P
router.post("/buy", (req, res) => {
  const { buyer, listingId } = req.body;
  if (!buyer || !listingId) return res.status(400).json({ ok: false, error: "Datos de compra incompletos" });

  const idx = (db.p2pMarket || []).findIndex(l => l.id === listingId);
  if (idx < 0) return res.status(404).json({ ok: false, error: "La publicación ya no está disponible." });

  const listing = db.p2pMarket[idx];
  const buyerUser = getOrCreateUser(buyer);
  const sellerUser = getOrCreateUser(listing.seller);

  if (buyerUser.username === sellerUser.username) {
    return res.status(400).json({ ok: false, error: "No puedes comprar tu propia publicación." });
  }

  if (buyerUser.wallet < listing.price) {
    return res.status(400).json({ ok: false, error: `Saldo insuficiente. Necesitas ${listing.price.toLocaleString()} NC.` });
  }

  // Transferencia de saldo
  buyerUser.wallet -= listing.price;
  sellerUser.wallet += listing.price;

  // Remover publicación
  db.p2pMarket.splice(idx, 1);

  logTransaction(buyerUser.username, sellerUser.username, listing.price, "P2P_PURCHASE", `Compra P2P de "${listing.title}"`);

  // Encolar comando de entrega
  const delivery = {
    id: "del_p2p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    username: buyerUser.username,
    itemTitle: listing.title,
    command: `give "${buyerUser.displayName || buyerUser.username}" ${listing.itemType} ${listing.quantity || 1}`,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };
  db.deliveries.unshift(delivery);
  saveDb();

  broadcastWs("P2P_BOUGHT", { listingId, buyer: buyerUser.username });
  broadcastWs("NEW_DELIVERY", delivery);
  broadcastWs("BALANCE_UPDATE", { username: buyerUser.username, wallet: buyerUser.wallet });
  broadcastWs("BALANCE_UPDATE", { username: sellerUser.username, wallet: sellerUser.wallet });

  res.json({ ok: true, message: `¡Compraste ${listing.title} con éxito!`, delivery, newWallet: buyerUser.wallet });
});

// Eliminar publicación propia
router.post("/delete", (req, res) => {
  const { username, listingId } = req.body;
  const idx = (db.p2pMarket || []).findIndex(l => l.id === listingId);
  if (idx < 0) return res.status(404).json({ ok: false, error: "Publicación no encontrada" });

  const listing = db.p2pMarket[idx];
  if (listing.seller.toLowerCase() !== username.toLowerCase()) {
    return res.status(403).json({ ok: false, error: "No tienes permiso para retirar esta publicación." });
  }

  db.p2pMarket.splice(idx, 1);
  saveDb();

  broadcastWs("P2P_DELETED", { listingId });
  res.json({ ok: true, message: "Publicación retirada correctamente." });
});

export default router;
