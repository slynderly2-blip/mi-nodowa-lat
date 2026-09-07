import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// ==========================================
// 1. LISTADOS PÚBLICOS DE NC (Filtro global o por vendedor)
// ==========================================
router.get("/listings", (req, res) => {
  try {
    const seller = (req.query.seller || "").trim().toLowerCase();
    const status = req.query.status || "active";

    let listings = db.ncListings || [];
    if (status !== "all") {
      listings = listings.filter(l => l.status === status);
    }
    if (seller) {
      listings = listings.filter(l => (l.seller || "").toLowerCase() === seller);
    }

    // Enriquecer con datos del vendedor
    const enriched = listings.map(l => {
      const u = db.users[l.seller.toLowerCase()] || {};
      return {
        ...l,
        sellerDisplayName: u.displayName || l.seller,
        sellerAvatar: u.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(l.seller)}/64`,
        sellerRank: u.equippedRank || "NOVICIO"
      };
    });

    res.json({ ok: true, listings: enriched });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, listings: [] });
  }
});

// ==========================================
// 2. MI SALDO Y MIS LISTADOS NC
// ==========================================
router.get("/my", (req, res) => {
  const username = (req.query.username || "temp_player").trim();
  const uname = username.toLowerCase();
  const user = db.users[uname] || { username, wallet: 0, displayName: username };

  const activeListings = (db.ncListings || []).filter(l => l.seller.toLowerCase() === uname && l.status === "active");
  const totalInListings = activeListings.reduce((sum, l) => sum + Number(l.amount || 0), 0);

  res.json({
    ok: true,
    user: {
      username: user.displayName || user.username,
      wallet: user.wallet || 0
    },
    listings: activeListings,
    stats: {
      wallet: user.wallet || 0,
      ncInListings: totalInListings,
      totalFortune: (user.wallet || 0) + totalInListings
    }
  });
});

// ==========================================
// 3. CREAR LISTADO (Vender NC de mi saldo)
// ==========================================
router.post("/", (req, res) => {
  const { amount, priceUsd } = req.body;
  const username = (req.query.username || req.body.username || "temp_player").trim();
  const uname = username.toLowerCase();
  const numAmount = Math.floor(Number(amount));

  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Cantidad de NC inválida" });
  }

  const userObj = db.users[uname];
  if (!userObj || (userObj.wallet || 0) < numAmount) {
    return res.status(400).json({
      ok: false,
      error: `Saldo insuficiente. Tienes ${userObj ? userObj.wallet : 0} NC, necesitas ${numAmount}`
    });
  }

  // 1. Restar NC del wallet
  userObj.wallet = (userObj.wallet || 0) - numAmount;

  // 2. Crear listing en ncListings
  const listing = {
    id: "lc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    seller: userObj.displayName || userObj.username,
    amount: numAmount,
    priceUsd: priceUsd ? Number(priceUsd) : null,
    status: "active",
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(db.ncListings)) db.ncListings = [];
  db.ncListings.unshift(listing);
  saveDb();

  // Notificar WebSocket
  broadcastWs("NC_LISTING_CREATED", {
    listing,
    newWallet: userObj.wallet,
    message: `${userObj.displayName || userObj.username} puso a la venta ${numAmount} NC`
  });

  const totalInListings = db.ncListings
    .filter(l => l.seller.toLowerCase() === uname && l.status === "active")
    .reduce((sum, l) => sum + l.amount, 0);

  res.json({
    ok: true,
    listing,
    message: `✅ Has listado ${numAmount} NC a la venta`,
    newWallet: userObj.wallet,
    ncInStore: totalInListings
  });
});

// ==========================================
// 4. COMPRAR NC (Comprador compra un listado)
// ==========================================
router.post("/buy/:listingId", (req, res) => {
  const { listingId } = req.params;
  const buyerUsername = (req.query.username || req.body.username || "temp_buyer").trim();
  const buyerUname = buyerUsername.toLowerCase();

  const listing = (db.ncListings || []).find(l => l.id === listingId);
  if (!listing) {
    return res.status(404).json({ ok: false, error: "Listado no encontrado" });
  }
  if (listing.status !== "active") {
    return res.status(400).json({ ok: false, error: "Este listado ya no está disponible" });
  }
  if (listing.seller.toLowerCase() === buyerUname) {
    return res.status(400).json({ ok: false, error: "No puedes comprar tus propios NC" });
  }

  const sellerUname = listing.seller.toLowerCase();
  const seller = db.users[sellerUname] || (db.users[sellerUname] = {
    username: listing.seller,
    displayName: listing.seller,
    wallet: 0,
    bank: 0,
    linked: false
  });

  const buyer = db.users[buyerUname] || (db.users[buyerUname] = {
    username: buyerUsername,
    displayName: buyerUsername,
    wallet: 0,
    bank: 0,
    linked: false
  });

  // Transferir NC del listing directamente a la wallet del comprador
  buyer.wallet = (buyer.wallet || 0) + listing.amount;

  listing.status = "sold";
  listing.buyer = buyer.displayName || buyer.username;
  listing.soldAt = new Date().toISOString();

  // Registrar en transacciones NC
  if (!Array.isArray(db.ncTransactions)) db.ncTransactions = [];
  const txRecord = {
    id: "tx_nc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    listingId: listing.id,
    seller: listing.seller,
    buyer: buyer.displayName || buyer.username,
    amount: listing.amount,
    priceUsd: listing.priceUsd || null,
    status: "completed",
    completedAt: listing.soldAt
  };
  db.ncTransactions.unshift(txRecord);

  saveDb();

  // Broadcast WebSocket
  broadcastWs("NC_BUY_SUCCESS", {
    listingId: listing.id,
    buyer: buyer.displayName || buyer.username,
    seller: listing.seller,
    amount: listing.amount,
    buyerNewWallet: buyer.wallet
  });

  res.json({
    ok: true,
    message: `¡Compraste exitosamente ${listing.amount} NC de ${listing.seller}!`,
    listing,
    buyerWallet: buyer.wallet
  });
});

// ==========================================
// 5. MIS VENTAS (Historial)
// ==========================================
router.get("/my-sales", (req, res) => {
  const username = (req.query.username || "temp_player").trim().toLowerCase();
  const mySales = (db.ncTransactions || [])
    .filter(t => (t.seller || "").toLowerCase() === username && t.status === "completed")
    .slice(0, 25);

  res.json({ ok: true, sales: mySales });
});

// ==========================================
// 6. CONFIGURACIÓN
// ==========================================
router.get("/config", (req, res) => {
  res.json({
    ok: true,
    minListingAmount: 50,
    maxListingAmount: 50000,
    defaultCurrency: "NC"
  });
});

export default router;