import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { broadcastWs } from "../services/websocket.js";
import { upload } from "../services/uploader.js";

const router = Router();

// ==========================================
// 1. CONFIGURACIÓN DE MÉTODOS DE COBRO DEL JUGADOR
// ==========================================
router.get("/seller-config/:username", (req, res) => {
  const username = (req.params.username || "").trim().toLowerCase();
  const user = db.users[username];
  if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
  res.json({
    ok: true,
    config: user.sellerConfig || {
      binanceId: "",
      whatsapp: "",
      countryCode: "+591",
      qrImage: "",
      instructions: ""
    }
  });
});

router.post("/seller-config", upload.single("qrImage"), (req, res) => {
  try {
    const { username, binanceId, whatsapp, countryCode, instructions } = req.body;
    if (!username) return res.status(400).json({ ok: false, error: "Usuario requerido" });

    const uname = username.trim().toLowerCase();
    const user = db.users[uname] || (db.users[uname] = { username, displayName: username, wallet: 0 });

    if (!user.sellerConfig) user.sellerConfig = {};
    if (binanceId !== undefined) user.sellerConfig.binanceId = (binanceId || "").trim();
    if (whatsapp !== undefined) user.sellerConfig.whatsapp = (whatsapp || "").trim();
    if (countryCode !== undefined) user.sellerConfig.countryCode = (countryCode || "+591").trim();
    if (instructions !== undefined) user.sellerConfig.instructions = (instructions || "").trim();
    if (req.file) {
      user.sellerConfig.qrImage = `/uploads/${req.file.filename}`;
    }

    saveDb();
    res.json({ ok: true, message: "Métodos de cobro guardados correctamente", config: user.sellerConfig });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// 2. LISTADOS PÚBLICOS DE NC (Con datos de cobro del vendedor)
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

    const enriched = listings.map(l => {
      const u = db.users[l.seller.toLowerCase()] || {};
      const sellerConfig = u.sellerConfig || {};
      return {
        ...l,
        sellerDisplayName: u.displayName || l.seller,
        sellerAvatar: u.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(l.seller)}/64`,
        sellerRank: u.equippedRank || "NOVICIO",
        sellerBinanceId: sellerConfig.binanceId || "",
        sellerWhatsapp: sellerConfig.whatsapp || "",
        sellerCountryCode: sellerConfig.countryCode || "+591",
        sellerQrImage: sellerConfig.qrImage || "",
        sellerInstructions: sellerConfig.instructions || ""
      };
    });

    res.json({ ok: true, listings: enriched });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, listings: [] });
  }
});

// ==========================================
// 3. MI SALDO Y MIS LISTADOS NC
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
      wallet: user.wallet || 0,
      sellerConfig: user.sellerConfig || {}
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
// 4. CREAR LISTADO (Vender NC con fondos en custodia)
// ==========================================
router.post("/", (req, res) => {
  const { amount, priceUsd, binanceId, whatsapp, countryCode, instructions } = req.body;
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

  // Guardar métodos de cobro en el perfil si se enviaron
  if (!userObj.sellerConfig) userObj.sellerConfig = {};
  if (binanceId) userObj.sellerConfig.binanceId = binanceId.trim();
  if (whatsapp) userObj.sellerConfig.whatsapp = whatsapp.trim();
  if (countryCode) userObj.sellerConfig.countryCode = countryCode.trim();
  if (instructions) userObj.sellerConfig.instructions = instructions.trim();

  // 1. Restar NC del wallet (entran en custodia para la venta)
  userObj.wallet = (userObj.wallet || 0) - numAmount;

  // 2. Crear listing en ncListings
  const listing = {
    id: "lc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    seller: userObj.displayName || userObj.username,
    amount: numAmount,
    priceUsd: priceUsd ? Number(priceUsd) : null,
    binanceId: userObj.sellerConfig.binanceId || "",
    whatsapp: userObj.sellerConfig.whatsapp || "",
    countryCode: userObj.sellerConfig.countryCode || "+591",
    qrImage: userObj.sellerConfig.qrImage || "",
    instructions: userObj.sellerConfig.instructions || "",
    status: "active",
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(db.ncListings)) db.ncListings = [];
  db.ncListings.unshift(listing);
  saveDb();

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
// 5. CANCELAR LISTADO Y RECUPERAR MONEDAS
// ==========================================
router.post("/cancel/:listingId", (req, res) => {
  const { listingId } = req.params;
  const username = (req.body.username || "").trim().toLowerCase();

  const listingIndex = (db.ncListings || []).findIndex(l => l.id === listingId);
  if (listingIndex === -1) {
    return res.status(404).json({ ok: false, error: "Listado no encontrado" });
  }

  const listing = db.ncListings[listingIndex];
  if (listing.seller.toLowerCase() !== username) {
    return res.status(403).json({ ok: false, error: "No eres el dueño de esta oferta" });
  }

  if (listing.status !== "active") {
    return res.status(400).json({ ok: false, error: "Solo puedes cancelar ofertas activas" });
  }

  // Devolver las monedas al saldo del vendedor
  const userObj = db.users[username];
  if (userObj) {
    userObj.wallet = (userObj.wallet || 0) + listing.amount;
  }

  listing.status = "cancelled";
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: userObj.username, wallet: userObj.wallet });

  res.json({
    ok: true,
    message: `Oferta cancelada. Se han devuelto +${listing.amount} NC a tu saldo.`,
    newWallet: userObj?.wallet || 0
  });
});

// ==========================================
// 6. COMPRADOR INICIA ORDEN DE COMPRA P2P (Envía TXID/Comprobante al vendedor)
// ==========================================
router.post("/order/create", upload.single("receiptImage"), (req, res) => {
  try {
    const { listingId, buyerUsername, txid, note } = req.body;
    if (!listingId || !buyerUsername) {
      return res.status(400).json({ ok: false, error: "Faltan datos de la orden" });
    }

    const listing = (db.ncListings || []).find(l => l.id === listingId);
    if (!listing || listing.status !== "active") {
      return res.status(404).json({ ok: false, error: "La oferta ya no está disponible" });
    }

    const buyerUname = buyerUsername.trim().toLowerCase();
    if (listing.seller.toLowerCase() === buyerUname) {
      return res.status(400).json({ ok: false, error: "No puedes comprar tu propia oferta" });
    }

    const order = {
      id: "p2p_ord_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      listingId: listing.id,
      seller: listing.seller,
      buyer: buyerUsername.trim(),
      amount: listing.amount,
      priceUsd: listing.priceUsd || null,
      txid: (txid || "").trim(),
      note: (note || "").trim(),
      receiptImage: req.file ? `/uploads/${req.file.filename}` : null,
      status: "PENDING_SELLER_APPROVAL",
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(db.ncOrders)) db.ncOrders = [];
    db.ncOrders.unshift(order);

    // Marcar el listing como en proceso
    listing.status = "in_escrow";
    listing.activeOrderId = order.id;

    saveDb();

    broadcastWs("P2P_ORDER_CREATED", {
      order,
      seller: listing.seller,
      message: `¡${order.buyer} ha enviado un comprobante para comprar tus ${order.amount} NC!`
    });

    res.json({
      ok: true,
      message: `Orden enviada al vendedor ${listing.seller}. Una vez verifique el pago, te liberará las monedas.`,
      order
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// 7. CONSULTAR ÓRDENES RECIBIDAS (Panel de Vendedor del Jugador)
// ==========================================
router.get("/orders/seller/:username", (req, res) => {
  const username = (req.params.username || "").trim().toLowerCase();
  const orders = (db.ncOrders || []).filter(o => (o.seller || "").toLowerCase() === username);
  res.json({ ok: true, orders });
});

// ==========================================
// 8. VENDEDOR APRUEBA LA ORDEN Y LIBERA LAS MONEDAS AL COMPRADOR
// ==========================================
router.post("/orders/approve", (req, res) => {
  const { orderId, username } = req.body;
  if (!orderId || !username) {
    return res.status(400).json({ ok: false, error: "Faltan datos de aprobación" });
  }

  const order = (db.ncOrders || []).find(o => o.id === orderId);
  if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada" });

  const sellerUname = username.trim().toLowerCase();
  if (order.seller.toLowerCase() !== sellerUname) {
    return res.status(403).json({ ok: false, error: "No eres el vendedor de esta orden" });
  }

  if (order.status !== "PENDING_SELLER_APPROVAL") {
    return res.status(400).json({ ok: false, error: "Esta orden ya fue procesada" });
  }

  // Acreditar las monedas en custodia al comprador
  const buyerUname = order.buyer.toLowerCase();
  const buyer = db.users[buyerUname] || (db.users[buyerUname] = { username: order.buyer, displayName: order.buyer, wallet: 0 });
  buyer.wallet = (buyer.wallet || 0) + order.amount;

  order.status = "COMPLETED";
  order.approvedAt = new Date().toISOString();

  // Actualizar estado del listing
  const listing = (db.ncListings || []).find(l => l.id === order.listingId);
  if (listing) {
    listing.status = "sold";
    listing.buyer = order.buyer;
    listing.soldAt = order.approvedAt;
  }

  // Registrar en transacciones
  if (!Array.isArray(db.ncTransactions)) db.ncTransactions = [];
  db.ncTransactions.unshift({
    id: "tx_nc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    orderId: order.id,
    seller: order.seller,
    buyer: order.buyer,
    amount: order.amount,
    priceUsd: order.priceUsd,
    txid: order.txid,
    status: "completed",
    completedAt: order.approvedAt
  });

  saveDb();

  // Notificar por WebSocket
  broadcastWs("BALANCE_UPDATE", { username: buyer.username, wallet: buyer.wallet });
  broadcastWs("P2P_ORDER_APPROVED", {
    order,
    buyer: buyer.displayName || buyer.username,
    amount: order.amount,
    message: `¡${order.seller} aprobó tu pago! Recibiste +${order.amount} NC.`
  });

  res.json({
    ok: true,
    message: `¡Has aprobado la orden! Se han liberado +${order.amount.toLocaleString()} NC a ${order.buyer}.`,
    order
  });
});

// ==========================================
// 9. VENDEDOR RECHAZA LA ORDEN (Devuelve monedas al vendedor o reabre oferta)
// ==========================================
router.post("/orders/reject", (req, res) => {
  const { orderId, username, reason } = req.body;
  if (!orderId || !username) {
    return res.status(400).json({ ok: false, error: "Faltan datos de rechazo" });
  }

  const order = (db.ncOrders || []).find(o => o.id === orderId);
  if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada" });

  const sellerUname = username.trim().toLowerCase();
  if (order.seller.toLowerCase() !== sellerUname) {
    return res.status(403).json({ ok: false, error: "No eres el vendedor de esta orden" });
  }

  if (order.status !== "PENDING_SELLER_APPROVAL") {
    return res.status(400).json({ ok: false, error: "Esta orden ya fue procesada" });
  }

  order.status = "REJECTED";
  order.rejectedAt = new Date().toISOString();
  order.rejectionReason = (reason || "Comprobante no válido o pago no recibido").trim();

  // Reabrir el listing para que otros compradores puedan ofertar
  const listing = (db.ncListings || []).find(l => l.id === order.listingId);
  if (listing) {
    listing.status = "active";
    delete listing.activeOrderId;
  }

  saveDb();

  broadcastWs("P2P_ORDER_REJECTED", {
    order,
    buyer: order.buyer,
    message: `Tu orden de ${order.amount} NC fue rechazada por ${order.seller}: ${order.rejectionReason}`
  });

  res.json({
    ok: true,
    message: "Orden rechazada. Tu oferta de monedas vuelve a estar activa.",
    order
  });
});

// ==========================================
// 10. HISTORIAL DE VENTAS
// ==========================================
router.get("/my-sales", (req, res) => {
  const username = (req.query.username || "temp_player").trim().toLowerCase();
  const mySales = (db.ncTransactions || [])
    .filter(t => (t.seller || "").toLowerCase() === username && t.status === "completed")
    .slice(0, 25);

  res.json({ ok: true, sales: mySales });
});

export default router;