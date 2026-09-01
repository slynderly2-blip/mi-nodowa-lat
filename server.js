import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3334;

// ── Rutas de carpetas ─────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(__dirname, "public", "uploads");
const RECEIPTS_DIR = path.join(UPLOADS_DIR, "receipts");

for (const dir of [DATA_DIR, UPLOADS_DIR, RECEIPTS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Middlewares ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ── Multer Storage para Recibos y QR ─────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "qrImage") cb(null, UPLOADS_DIR);
    else cb(null, RECEIPTS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    const unique = `${file.fieldname}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    cb(null, unique);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máx
});

// ── Base de Datos en Memoria con Auto-guardado ─────────────────
let db = {
  config: {
    currencyName: "Nodocoins",
    currencySymbol: "NC",
    adminPassword: process.env.ADMIN_PASSWORD || "admin_nodowa_2026",
    binance: {
      payId: "847291039",
      walletAddress: "0x71C...b84F (USDT TRC20 / BEP20)",
      qrImage: "/uploads/default_qr.svg",
      instruction: "Transfiere el monto exacto vía Binance Pay ID o USDT. Luego sube la captura del comprobante con el TXID."
    }
  },
  users: {},
  storeItems: [],
  p2pMarket: [],
  orders: [],
  deliveries: [],
  transactions: [],
  linkTokens: {}
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf8");
      db = JSON.parse(data);
    }
  } catch (err) {
    console.error("Error al cargar db.json:", err);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (err) {
    console.error("Error al guardar db.json:", err);
  }
}

loadDb();

// ── Helper de Usuarios ─────────────────────────────────────────
function getOrCreateUser(username) {
  const uname = (username || "").trim().toLowerCase();
  if (!uname) return null;
  if (!db.users[uname]) {
    db.users[uname] = {
      username: uname,
      displayName: username.trim(),
      pin: null,
      wallet: 500, // Bono de bienvenida
      bank: 0,
      linked: false,
      xuid: null,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    saveDb();
  }
  return db.users[uname];
}

function logTransaction(from, to, amount, type, description) {
  const tx = {
    id: "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    from: from || "SISTEMA",
    to: to || "SISTEMA",
    amount: Number(amount),
    type,
    description,
    createdAt: new Date().toISOString()
  };
  db.transactions.unshift(tx);
  if (db.transactions.length > 500) db.transactions.pop();
  saveDb();
  return tx;
}

// ── WebSockets para Minecraft Bedrock & Live Updates ───────────
const connectedClients = new Set();
const minecraftServerClients = new Set();

wss.on("connection", (ws, req) => {
  connectedClients.add(ws);
  
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      handleWsMessage(ws, data);
    } catch (e) {
      console.error("Mensaje WS inválido:", e);
    }
  });

  ws.on("close", () => {
    connectedClients.delete(ws);
    minecraftServerClients.delete(ws);
  });
});

function broadcastWs(event, payload) {
  const message = JSON.stringify({ event, payload, timestamp: Date.now() });
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function handleWsMessage(ws, data) {
  if (data.type === "REGISTER_SERVER") {
    minecraftServerClients.add(ws);
    ws.send(JSON.stringify({ type: "REGISTERED", message: "Conectado al backend de Nodowa Economy" }));
  } else if (data.type === "LINK_VERIFY") {
    // Addon en Minecraft ejecuta /link <code>
    const { code, player, xuid } = data;
    const tokenData = db.linkTokens[code];

    if (!tokenData) {
      ws.send(JSON.stringify({ type: "LINK_FAILED", player, error: "El código no existe o ya fue utilizado." }));
      return;
    }

    if (Date.now() > tokenData.expiresAt) {
      delete db.linkTokens[code];
      saveDb();
      ws.send(JSON.stringify({ type: "LINK_FAILED", player, error: "El código expiró (límite de 15 minutos)." }));
      return;
    }

    const executingPlayer = (player || "").trim().toLowerCase();
    const targetPlayer = (tokenData.username || "").trim().toLowerCase();

    // ── Validación estricta de identidad: Solo el dueño de la cuenta puede ejecutarlo ──
    if (executingPlayer !== targetPlayer) {
      ws.send(JSON.stringify({ 
        type: "LINK_FAILED", 
        player, 
        error: `Este código fue generado para el usuario "${tokenData.displayName || tokenData.username}". No puedes reclamarlo desde otra cuenta.` 
      }));
      return;
    }

    const user = getOrCreateUser(targetPlayer);
    user.linked = true;
    user.xuid = xuid || user.xuid || null;
    user.displayName = player || user.displayName;
    user.lastActive = new Date().toISOString();

    // Generar Token de Sesión Persistente y eliminar código (Single-Use)
    if (!db.sessions) db.sessions = {};
    const sessionToken = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    db.sessions[sessionToken] = {
      username: user.username,
      createdAt: new Date().toISOString()
    };

    delete db.linkTokens[code];
    saveDb();

    ws.send(JSON.stringify({ type: "LINK_SUCCESS", player, username: user.username }));
    broadcastWs("USER_LINKED", { username: user.username, sessionToken, user });
  } else if (data.type === "POLL_DELIVERIES") {
    // Servidor pide entregas pendientes para un jugador que acaba de entrar
    const uname = (data.player || "").trim().toLowerCase();
    const pendings = db.deliveries.filter(d => d.username.toLowerCase() === uname && d.status === "PENDING");
    ws.send(JSON.stringify({ type: "DELIVERIES_RESULT", player: data.player, deliveries: pendings }));
  } else if (data.type === "SYNC_PLAYERS") {
    // Sincronizar lista de jugadores desde el servidor de Minecraft
    const { players } = data;
    if (Array.isArray(players)) {
      let added = 0;
      for (const p of players) {
        const name = typeof p === "string" ? p : p.name;
        if (name) {
          const user = getOrCreateUser(name);
          if (p.xuid) user.xuid = p.xuid;
          if (p.seen) user.lastActive = new Date(p.seen).toISOString();
          added++;
        }
      }
      saveDb();
      ws.send(JSON.stringify({ type: "SYNC_SUCCESS", count: added }));
      broadcastWs("PLAYERS_SYNCED", { count: added });
    }
  } else if (data.type === "ACK_DELIVERY") {
    const { deliveryId } = data;
    const item = db.deliveries.find(d => d.id === deliveryId);
    if (item) {
      item.status = "DELIVERED";
      item.deliveredAt = new Date().toISOString();
      saveDb();
      broadcastWs("DELIVERY_UPDATED", item);
    }
  }
}

// Endpoint REST para sincronizar jugadores del servidor
app.post("/api/addon/sync-players", (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players)) return res.status(400).json({ ok: false, error: "Formato inválido" });

  let synced = 0;
  for (const p of players) {
    const name = typeof p === "string" ? p : p.name;
    if (name) {
      const user = getOrCreateUser(name);
      if (p.xuid) user.xuid = p.xuid;
      if (p.seen) user.lastActive = new Date(p.seen).toISOString();
      synced++;
    }
  }
  saveDb();
  broadcastWs("PLAYERS_SYNCED", { count: synced });
  res.json({ ok: true, synced });
});

// ── REST API Endpoints para Addon Bedrock (@minecraft/server-net) ──

// Obtener entregas pendientes para un jugador o globales
app.get("/api/addon/pending-deliveries", (req, res) => {
  const player = (req.query.player || "").trim().toLowerCase();
  const pendings = player
    ? db.deliveries.filter(d => d.username.toLowerCase() === player && d.status === "PENDING")
    : db.deliveries.filter(d => d.status === "PENDING");
  res.json({ ok: true, deliveries: pendings });
});

// Confirmar entrega ejecutada exitosamente en Minecraft
app.post("/api/addon/ack-delivery", (req, res) => {
  const { deliveryId } = req.body;
  if (!deliveryId) return res.status(400).json({ ok: false, error: "Falta deliveryId" });

  const item = db.deliveries.find(d => d.id === deliveryId);
  if (item) {
    item.status = "DELIVERED";
    item.deliveredAt = new Date().toISOString();
    saveDb();
    broadcastWs("DELIVERY_UPDATED", item);
    return res.json({ ok: true, delivery: item });
  }
  res.status(404).json({ ok: false, error: "Entrega no encontrada" });
});

// Consultar saldo de jugador desde el addon
app.get("/api/addon/get-balance", (req, res) => {
  const player = (req.query.player || "").trim().toLowerCase();
  if (!player) return res.status(400).json({ ok: false, error: "Falta el nombre del jugador" });
  const user = getOrCreateUser(player);
  res.json({ ok: true, username: user.username, wallet: user.wallet, bank: user.bank, total: user.wallet + user.bank });
});

// Sincronizar saldo de jugador (Scoreboard -> Web)
app.post("/api/addon/sync-balance", (req, res) => {
  const { player, balance } = req.body;
  if (!player || balance === undefined) return res.status(400).json({ ok: false, error: "Parámetros inválidos" });
  const user = getOrCreateUser(player);
  user.wallet = Math.max(0, Number(balance));
  saveDb();
  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });
  res.json({ ok: true, wallet: user.wallet });
});

// ── Rutas de Autenticación ─────────────────────────────────────

// Solicitar código temporal de enlace (Válido 15 minutos y de un solo uso)
app.post("/api/auth/request-link", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: "Falta el Gamertag / Nick" });

  const rawName = username.trim();
  const uname = rawName.toLowerCase();
  const user = getOrCreateUser(uname);

  // Generar código aleatorio limpio (ej: 428173 o letras/números)
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  db.linkTokens[code] = {
    username: uname,
    displayName: rawName,
    expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutos exactos
  };
  saveDb();

  res.json({ 
    ok: true, 
    code, 
    expiresInMinutes: 15,
    expiresAt: db.linkTokens[code].expiresAt,
    instruction: `Entra al servidor de Minecraft con la cuenta "${rawName}" y escribe: /link ${code}`
  });
});

// Endpoint REST para que el addon de Minecraft o la Web confirmen la vinculación /link <code>
app.post("/api/auth/verify-link", (req, res) => {
  const { code, player, xuid } = req.body;
  if (!code || !player) return res.status(400).json({ ok: false, error: "Faltan parámetros" });

  const tokenData = db.linkTokens[code];
  if (!tokenData) {
    return res.status(400).json({ ok: false, error: "El código no existe o ya fue utilizado." });
  }

  if (Date.now() > tokenData.expiresAt) {
    delete db.linkTokens[code];
    saveDb();
    return res.status(400).json({ ok: false, error: "El código expiró (límite de 15 minutos)." });
  }

  const executingPlayer = player.trim().toLowerCase();
  const targetPlayer = tokenData.username.trim().toLowerCase();

  // Validación estricta de identidad: Solo el dueño de la cuenta puede ejecutarlo
  if (executingPlayer !== targetPlayer) {
    return res.status(403).json({
      ok: false,
      error: `Este código fue generado para el usuario "${tokenData.displayName || tokenData.username}". No puedes reclamarlo desde otra cuenta.`
    });
  }

  const user = getOrCreateUser(targetPlayer);
  user.linked = true;
  user.xuid = xuid || user.xuid || null;
  user.displayName = player || user.displayName;
  user.lastActive = new Date().toISOString();

  // Generar Token de Sesión Persistente
  if (!db.sessions) db.sessions = {};
  const sessionToken = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  db.sessions[sessionToken] = {
    username: user.username,
    createdAt: new Date().toISOString()
  };

  delete db.linkTokens[code];
  saveDb();

  // Transmitir evento en tiempo real a la Web
  broadcastWs("USER_LINKED", { username: user.username, sessionToken, user });

  res.json({ ok: true, username: user.username, sessionToken, user });
});

// Endpoint de sondeo (polling) para que la Web sepa cuando Minecraft verificó el código
app.get("/api/auth/check-link-status", (req, res) => {
  const code = req.query.code;
  if (!code) return res.json({ verified: false });

  // Si el código ya no está en linkTokens pero hay una sesión reciente creada para esa cuenta
  const tokenData = db.linkTokens[code];
  if (tokenData) {
    return res.json({ verified: false, expiresAt: tokenData.expiresAt });
  }

  // El código ya no existe en linkTokens (fue consumido y verificado)
  res.json({ verified: true });
});





// Login con PIN directo (si el usuario ya configuró un PIN)
app.post("/api/auth/login-pin", (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ ok: false, error: "Faltan credenciales" });

  const uname = username.trim().toLowerCase();
  const user = db.users[uname];
  if (!user) return res.status(404).json({ ok: false, error: "Usuario no registrado" });

  if (user.pin && user.pin !== pin.trim()) {
    return res.status(401).json({ ok: false, error: "PIN incorrecto" });
  }

  // Si no tiene PIN, lo asignamos
  if (!user.pin) {
    user.pin = pin.trim();
    saveDb();
  }

  user.lastActive = new Date().toISOString();
  saveDb();

  res.json({ ok: true, user });
});

// ── Rutas de Usuario y Billetera ───────────────────────────────

app.get("/api/user/profile", (req, res) => {
  const uname = (req.query.username || "").trim().toLowerCase();
  if (!uname) return res.status(400).json({ ok: false, error: "Falta username" });
  const user = getOrCreateUser(uname);
  res.json({ ok: true, user });
});

// Directorio y Registro de Jugadores (Todos los usuarios registrados en cache/db)
app.get("/api/players/registry", (req, res) => {
  const search = (req.query.search || "").trim().toLowerCase();
  let list = Object.values(db.users).map(u => ({
    username: u.displayName || u.username,
    linked: !!u.linked,
    xuid: u.xuid || null,
    wallet: u.wallet || 0,
    bank: u.bank || 0,
    total: (u.wallet || 0) + (u.bank || 0),
    createdAt: u.createdAt,
    lastActive: u.lastActive || u.createdAt
  }));

  if (search) {
    list = list.filter(p => p.username.toLowerCase().includes(search));
  }

  list.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));
  res.json({ ok: true, count: list.length, players: list });
});


// Transferencias P2P entre usuarios
app.post("/api/wallet/transfer", (req, res) => {
  const { from, to, amount } = req.body;
  const numAmount = Number(amount);
  if (!from || !to || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Datos de transferencia inválidos" });
  }

  const sender = getOrCreateUser(from);
  const receiver = getOrCreateUser(to);

  if (sender.username === receiver.username) {
    return res.status(400).json({ ok: false, error: "No puedes transferirte a ti mismo" });
  }

  if (sender.wallet < numAmount) {
    return res.status(400).json({ ok: false, error: "Saldo insuficiente en billetera" });
  }

  sender.wallet -= numAmount;
  receiver.wallet += numAmount;
  
  const tx = logTransaction(sender.displayName || sender.username, receiver.displayName || receiver.username, numAmount, "TRANSFER", `Transferencia P2P de ${numAmount} ${db.config.currencyName}`);
  saveDb();

  broadcastWs("TRANSACTION", tx);
  broadcastWs("BALANCE_UPDATE", { username: sender.username, wallet: sender.wallet });
  broadcastWs("BALANCE_UPDATE", { username: receiver.username, wallet: receiver.wallet });

  res.json({ ok: true, tx, senderWallet: sender.wallet });
});

// Depósito / Retiro en Banco
app.post("/api/wallet/bank-action", (req, res) => {
  const { username, action, amount } = req.body; // action: "deposit" | "withdraw"
  const numAmount = Number(amount);
  if (!username || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Monto inválido" });
  }

  const user = getOrCreateUser(username);

  if (action === "deposit") {
    if (user.wallet < numAmount) return res.status(400).json({ ok: false, error: "Saldo insuficiente en mano" });
    user.wallet -= numAmount;
    user.bank += numAmount;
    logTransaction(user.username, "BANCO", numAmount, "BANK_DEPOSIT", `Depósito en banco de ${numAmount} ${db.config.currencyName}`);
  } else if (action === "withdraw") {
    if (user.bank < numAmount) return res.status(400).json({ ok: false, error: "Saldo insuficiente en el banco" });
    user.bank -= numAmount;
    user.wallet += numAmount;
    logTransaction("BANCO", user.username, numAmount, "BANK_WITHDRAW", `Retiro del banco de ${numAmount} ${db.config.currencyName}`);
  } else {
    return res.status(400).json({ ok: false, error: "Acción no válida" });
  }

  saveDb();
  res.json({ ok: true, wallet: user.wallet, bank: user.bank });
});

// Historial de Transacciones
app.get("/api/wallet/transactions", (req, res) => {
  const uname = (req.query.username || "").trim().toLowerCase();
  const txs = uname 
    ? db.transactions.filter(t => (t.from && t.from.toLowerCase() === uname) || (t.to && t.to.toLowerCase() === uname))
    : db.transactions;
  res.json({ ok: true, transactions: txs.slice(0, 50) });
});

// Leaderboard / Top Millonarios
app.get("/api/leaderboard", (req, res) => {
  const list = Object.values(db.users).map(u => ({
    username: u.displayName || u.username,
    wallet: u.wallet,
    bank: u.bank,
    total: (u.wallet || 0) + (u.bank || 0)
  })).sort((a, b) => b.total - a.total).slice(0, 20);

  res.json({ ok: true, leaderboard: list });
});

// ── Rutas de la Tienda ─────────────────────────────────────────

app.get("/api/store/items", (req, res) => {
  res.json({ ok: true, items: db.storeItems, config: db.config });
});

// Comprar con Monedas del Juego (Nodocoins)
app.post("/api/store/buy-coins", (req, res) => {
  const { username, itemId } = req.body;
  if (!username || !itemId) return res.status(400).json({ ok: false, error: "Datos incompletos" });

  const user = getOrCreateUser(username);
  const item = db.storeItems.find(i => i.id === itemId);

  if (!item) return res.status(404).json({ ok: false, error: "Artículo no encontrado" });
  if (item.priceCoins <= 0) return res.status(400).json({ ok: false, error: "Este artículo solo se adquiere mediante Binance Pay" });

  if (user.wallet < item.priceCoins) {
    return res.status(400).json({ ok: false, error: `Saldo insuficiente. Necesitas ${item.priceCoins} ${db.config.currencyName}` });
  }

  user.wallet -= item.priceCoins;
  logTransaction(user.username, "TIENDA", item.priceCoins, "STORE_BUY", `Compra de ${item.name}`);

  // Registrar en Cola de Entregas
  const delivery = {
    id: "del_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    username: user.username,
    itemTitle: item.name,
    command: item.command ? item.command.replace("{player}", user.displayName || user.username) : null,
    giveCoins: item.giveCoins || 0,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };

  if (item.giveCoins) {
    user.wallet += item.giveCoins;
    delivery.status = "DELIVERED";
    delivery.deliveredAt = new Date().toISOString();
  }

  db.deliveries.unshift(delivery);
  saveDb();

  broadcastWs("NEW_DELIVERY", delivery);
  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });

  res.json({ ok: true, message: "¡Compra realizada con éxito!", delivery, newWallet: user.wallet });
});

// Enviar comprobante de Binance Pay / USDT
app.post("/api/payments/binance/submit", upload.single("receipt"), (req, res) => {
  const { username, itemId, txid } = req.body;
  if (!username || !itemId || !txid) {
    return res.status(400).json({ ok: false, error: "Faltan campos obligatorios (Usuario, Producto o TXID)" });
  }

  if (!req.file) {
    return res.status(400).json({ ok: false, error: "Debes adjuntar la captura del comprobante de pago" });
  }

  const item = db.storeItems.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ ok: false, error: "Producto no encontrado" });

  const order = {
    id: "ord_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    username: username.trim(),
    itemId: item.id,
    itemTitle: item.name,
    priceUsdt: item.priceUsdt,
    giveCoins: item.giveCoins || 0,
    command: item.command || null,
    txid: txid.trim(),
    receiptUrl: `/uploads/receipts/${req.file.filename}`,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    adminNote: null
  };

  db.orders.unshift(order);
  saveDb();

  broadcastWs("NEW_ORDER", order);

  res.json({ ok: true, message: "Comprobante recibido. El equipo revisará tu pago en breve.", order });
});

// ── Rutas de Mercado P2P ───────────────────────────────────────

app.get("/api/market/listings", (req, res) => {
  res.json({ ok: true, listings: db.p2pMarket });
});

app.post("/api/market/list", (req, res) => {
  const { seller, title, itemType, price, quantity, description } = req.body;
  const numPrice = Number(price);
  const numQty = Number(quantity || 1);

  if (!seller || !title || isNaN(numPrice) || numPrice <= 0) {
    return res.status(400).json({ ok: false, error: "Datos de publicación inválidos" });
  }

  const listing = {
    id: "p2p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    seller: seller.trim(),
    title: title.trim(),
    itemType: itemType || "generic_item",
    price: numPrice,
    quantity: numQty,
    description: description ? description.trim() : "",
    createdAt: new Date().toISOString()
  };

  db.p2pMarket.unshift(listing);
  saveDb();

  broadcastWs("P2P_NEW", listing);
  res.json({ ok: true, listing });
});

app.post("/api/market/buy", (req, res) => {
  const { buyer, listingId } = req.body;
  if (!buyer || !listingId) return res.status(400).json({ ok: false, error: "Datos incompletos" });

  const idx = db.p2pMarket.findIndex(l => l.id === listingId);
  if (idx < 0) return res.status(404).json({ ok: false, error: "La publicación ya no está disponible" });

  const listing = db.p2pMarket[idx];
  const buyerUser = getOrCreateUser(buyer);
  const sellerUser = getOrCreateUser(listing.seller);

  if (buyerUser.username === sellerUser.username) {
    return res.status(400).json({ ok: false, error: "No puedes comprar tu propia publicación" });
  }

  if (buyerUser.wallet < listing.price) {
    return res.status(400).json({ ok: false, error: `Saldo insuficiente. Necesitas ${listing.price} ${db.config.currencyName}` });
  }

  // Transferencia de dinero atómica
  buyerUser.wallet -= listing.price;
  sellerUser.wallet += listing.price;

  // Remover del mercado
  db.p2pMarket.splice(idx, 1);

  logTransaction(buyerUser.username, sellerUser.username, listing.price, "P2P_MARKET", `Compra de "${listing.title}" en mercado P2P`);

  // Crear entrega para el comprador
  const delivery = {
    id: "del_p2p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    username: buyerUser.username,
    itemTitle: listing.title,
    command: `give {player} ${listing.itemType} ${listing.quantity || 1}`,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };
  db.deliveries.unshift(delivery);
  saveDb();

  broadcastWs("P2P_BOUGHT", { listingId, buyer: buyerUser.username });
  broadcastWs("NEW_DELIVERY", delivery);
  broadcastWs("BALANCE_UPDATE", { username: buyerUser.username, wallet: buyerUser.wallet });
  broadcastWs("BALANCE_UPDATE", { username: sellerUser.username, wallet: sellerUser.wallet });

  res.json({ ok: true, message: "¡Compra P2P completada con éxito!", delivery, newWallet: buyerUser.wallet });
});

// ── Rutas de Entregas / Buzón ──────────────────────────────────

app.get("/api/deliveries", (req, res) => {
  const uname = (req.query.username || "").trim().toLowerCase();
  const list = uname
    ? db.deliveries.filter(d => d.username.toLowerCase() === uname)
    : db.deliveries;
  res.json({ ok: true, deliveries: list.slice(0, 50) });
});

// ── Rutas del Panel de Administración (/admin) ─────────────────

function checkAdminAuth(req, res, next) {
  const auth = req.headers["x-admin-token"] || req.query.adminPassword || req.body.adminPassword;
  if (!auth || auth !== db.config.adminPassword) {
    return res.status(401).json({ ok: false, error: "Acceso no autorizado al panel de administración" });
  }
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === db.config.adminPassword) {
    res.json({ ok: true, token: db.config.adminPassword });
  } else {
    res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
  }
});

// Ver todos los comprobantes y órdenes
app.get("/api/admin/orders", checkAdminAuth, (req, res) => {
  res.json({ ok: true, orders: db.orders });
});

// Aprobar Orden de Binance
app.post("/api/admin/orders/approve", checkAdminAuth, (req, res) => {
  const { orderId, note } = req.body;
  const order = db.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada" });
  if (order.status !== "PENDING") return res.status(400).json({ ok: false, error: "La orden ya fue procesada" });

  order.status = "APPROVED";
  order.reviewedAt = new Date().toISOString();
  order.adminNote = note || "Aprobado por el Administrador";

  const user = getOrCreateUser(order.username);

  // Si da monedas
  if (order.giveCoins > 0) {
    user.wallet += order.giveCoins;
    logTransaction("BINANCE", user.username, order.giveCoins, "BINANCE_CREDIT", `Acreditación de ${order.giveCoins} ${db.config.currencyName} por compra Binance (${order.itemTitle})`);
  }

  // Si tiene comando asociado (ej. rango o ítem), agregar a entregas pendientes
  if (order.command) {
    const delivery = {
      id: "del_binance_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      username: user.username,
      itemTitle: order.itemTitle,
      command: order.command.replace("{player}", user.displayName || user.username),
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    db.deliveries.unshift(delivery);
    broadcastWs("NEW_DELIVERY", delivery);
  }

  saveDb();

  broadcastWs("ORDER_APPROVED", order);
  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });

  res.json({ ok: true, message: "Orden aprobada exitosamente", order });
});

// Rechazar Orden
app.post("/api/admin/orders/reject", checkAdminAuth, (req, res) => {
  const { orderId, reason } = req.body;
  const order = db.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ ok: false, error: "Orden no encontrada" });

  order.status = "REJECTED";
  order.reviewedAt = new Date().toISOString();
  order.adminNote = reason || "Comprobante o TXID no válido";

  saveDb();
  broadcastWs("ORDER_REJECTED", order);

  res.json({ ok: true, message: "Orden rechazada", order });
});

// Cambiar QR de Binance y datos de pago
app.post("/api/admin/qr/update", checkAdminAuth, upload.single("qrImage"), (req, res) => {
  const { payId, walletAddress, instruction } = req.body;

  if (payId) db.config.binance.payId = payId.trim();
  if (walletAddress) db.config.binance.walletAddress = walletAddress.trim();
  if (instruction) db.config.binance.instruction = instruction.trim();

  if (req.file) {
    db.config.binance.qrImage = `/uploads/${req.file.filename}`;
  }

  saveDb();
  broadcastWs("CONFIG_UPDATED", db.config);

  res.json({ ok: true, message: "Configuración de Binance actualizada", binance: db.config.binance });
});

// Gestión de Catálogo de Tienda
app.post("/api/admin/store/save-item", checkAdminAuth, (req, res) => {
  const { id, name, category, priceCoins, priceUsdt, description, iconType, command, giveCoins, badge } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: "Nombre obligatorio" });

  const itemId = id || "item_" + Date.now();
  const existingIdx = db.storeItems.findIndex(i => i.id === itemId);

  const itemObj = {
    id: itemId,
    name: name.trim(),
    category: category || "items",
    priceCoins: Number(priceCoins || 0),
    priceUsdt: Number(priceUsdt || 0),
    description: description ? description.trim() : "",
    iconType: iconType || "box",
    command: command ? command.trim() : null,
    giveCoins: Number(giveCoins || 0),
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

app.post("/api/admin/store/delete-item", checkAdminAuth, (req, res) => {
  const { itemId } = req.body;
  db.storeItems = db.storeItems.filter(i => i.id !== itemId);
  saveDb();
  broadcastWs("STORE_UPDATED", db.storeItems);
  res.json({ ok: true, message: "Artículo eliminado" });
});

// Ajuste de Saldo de Jugador por el Administrador
app.post("/api/admin/player/adjust-balance", checkAdminAuth, (req, res) => {
  const { username, amount, action } = req.body; // action: "set" | "add" | "sub"
  const numAmount = Number(amount);
  if (!username || isNaN(numAmount)) return res.status(400).json({ ok: false, error: "Datos inválidos" });

  const user = getOrCreateUser(username);
  if (action === "set") user.wallet = numAmount;
  else if (action === "add") user.wallet += numAmount;
  else if (action === "sub") user.wallet = Math.max(0, user.wallet - numAmount);

  logTransaction("ADMIN", user.username, numAmount, "ADMIN_ADJUST", `Ajuste administrativo (${action}) de saldo`);
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });
  res.json({ ok: true, user });
});

// Estadísticas del Panel Admin
app.get("/api/admin/stats", checkAdminAuth, (req, res) => {
  const totalUsers = Object.keys(db.users).length;
  const pendingOrders = db.orders.filter(o => o.status === "PENDING").length;
  const approvedOrders = db.orders.filter(o => o.status === "APPROVED");
  const totalSalesUsdt = approvedOrders.reduce((sum, o) => sum + (o.priceUsdt || 0), 0);
  const totalCoins = Object.values(db.users).reduce((sum, u) => sum + (u.wallet || 0) + (u.bank || 0), 0);

  res.json({
    ok: true,
    stats: {
      totalUsers,
      pendingOrders,
      totalSalesUsdt,
      totalCoins,
      activeP2P: db.p2pMarket.length
    }
  });
});

// ── Rutas HTML ────────────────────────────────────────────────
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Iniciar Servidor ──────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  console.log(`====================================================`);
  console.log(`🚀 Nodowa Economy & Web Store iniciada`);
  console.log(`🌐 Servidor Web: http://localhost:${PORT}`);
  console.log(`👑 Panel Admin:  http://localhost:${PORT}/admin`);
  console.log(`🔌 WebSocket:    ws://localhost:${PORT}`);
  console.log(`====================================================`);
});
