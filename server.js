import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3334;

// ── Rutas de carpetas (TODO centralizado bajo DATA_DIR para 1 solo volumen persistente en Railway) ──
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const RECEIPTS_DIR = path.join(UPLOADS_DIR, "receipts");
const TEMPS_DIR = path.join(DATA_DIR, "temps");

for (const dir of [DATA_DIR, UPLOADS_DIR, RECEIPTS_DIR, TEMPS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Sincronizar/copiar assets base (como default_qr.svg) a DATA_DIR/uploads si aún no existen
const PUBLIC_UPLOADS_FALLBACK = path.join(__dirname, "public", "uploads");
if (fs.existsSync(PUBLIC_UPLOADS_FALLBACK)) {
  try {
    const files = fs.readdirSync(PUBLIC_UPLOADS_FALLBACK);
    for (const f of files) {
      const src = path.join(PUBLIC_UPLOADS_FALLBACK, f);
      const dest = path.join(UPLOADS_DIR, f);
      if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }
  } catch (err) {
    console.warn("[Storage] Aviso al inicializar archivos base:", err.message);
  }
}

// ── Middlewares y Seguridad ────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Throttling y Rate Limiting para evitar ataques de fuerza bruta y spam
const requestCounts = new Map();
function rateLimiter(maxRequests = 80, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
    const now = Date.now();
    let record = requestCounts.get(ip);
    if (!record || now - record.startTime > windowMs) {
      record = { count: 1, startTime: now };
    } else {
      record.count++;
    }
    requestCounts.set(ip, record);
    if (record.count > maxRequests) {
      return res.status(429).json({ ok: false, error: "Demasiadas peticiones. Por seguridad, espera 1 minuto." });
    }
    next();
  };
}
app.use(rateLimiter(100, 60000));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Servir uploads prioritariamente desde el volumen persistente (DATA_DIR/uploads)
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/uploads", express.static(PUBLIC_UPLOADS_FALLBACK));
app.use(express.static(path.join(__dirname, "public")));

// ── Multer Storage para Recibos y QR (100% Persistente en DATA_DIR) ──
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
    adminPassword: process.env.ADMIN_PASSWORD || "ortizuwu20",
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
  linkTokens: {},
  staff: {},       // { "username": { role: "admin"|"op_rented"|"moderator", label: "...", assignedAt: "" } }
  opRentals: [],   // [ { id, username, startsAt, expiresAt, active, revokedAt } ]
  ratings: []      // [ { id, targetUser, author, stars, comment, type: "RECOMMEND"|"REPORT", createdAt } ]
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf8");
      db = JSON.parse(data);
    }
    if (db.config) db.config.adminPassword = process.env.ADMIN_PASSWORD || "ortizuwu20";
    if (!db.staff) db.staff = {};
    if (!db.opRentals) db.opRentals = [];
    if (!db.ratings) db.ratings = [];

    // Pre-sembrar staff por defecto si está vacío
    if (Object.keys(db.staff).length === 0) {
      db.staff["slynderly"] = { displayName: "slynderly", role: "admin", label: "[ADMIN]", assignedAt: new Date().toISOString() };
      db.staff["tw3sempai"] = { displayName: "Tw3sempai", role: "admin", label: "[ADMIN]", assignedAt: new Date().toISOString() };
      db.staff["abuelong"] = { displayName: "AbueloNG", role: "admin", label: "[ADMIN]", assignedAt: new Date().toISOString() };
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
      wallet: 0,
      bank: 0,
      linked: false,
      xuid: null,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    saveDb();
  }

  // Sanear saldos para evitar números flotantes con decimales
  db.users[uname].wallet = Math.floor(db.users[uname].wallet || 0);
  db.users[uname].bank = Math.floor(db.users[uname].bank || 0);

  return db.users[uname];
}

function generateReceiptHash(from, to, amount, timestamp) {
  const secret = "nodowa_network_official_key_2026";
  return "NODOWA-HASH-" + crypto.createHmac("sha256", secret).update(`${from}:${to}:${amount}:${timestamp}`).digest("hex").slice(0, 16).toUpperCase();
}

// ── Sistema de Intereses Bancarios Reales (1% Diario) ───────────
function processBankInterest() {
  const INTEREST_RATE = 0.01; // 1% diario
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  let interestApplied = 0;

  for (const uname in db.users) {
    const user = db.users[uname];
    if (!user.bank || user.bank < 100) continue;

    if (!user.lastInterestAt) {
      // Primera vez: registrar hora actual SIN pagar intereses
      user.lastInterestAt = new Date().toISOString();
      continue;
    }

    const lastInterestTime = new Date(user.lastInterestAt).getTime();
    if (now - lastInterestTime >= ONE_DAY_MS) {
      const interestAmount = Math.floor(user.bank * INTEREST_RATE);
      if (interestAmount > 0) {
        user.bank += interestAmount;
        user.lastInterestAt = new Date().toISOString();
        interestApplied++;
        logTransaction("BANCO_CENTRAL", user.displayName || user.username, interestAmount, "BANK_INTEREST", `Interés diario del banco (1%)`);
        broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet, bank: user.bank });
      }
    }
  }

  if (interestApplied > 0) {
    saveDb();
    console.log(`[Banco] Intereses del 1% aplicados a ${interestApplied} cuentas.`);
  } else {
    saveDb(); // Guardar marcas de tiempo iniciales
  }
}

// Revisa intereses bancarios cada hora
setInterval(processBankInterest, 60 * 60 * 1000);

// ── Auto-Expiración de Alquileres OP ──────────────────────────
function checkOpRentalsExpiration() {
  if (!db.opRentals || db.opRentals.length === 0) return;
  const now = Date.now();
  let changed = false;

  for (const rental of db.opRentals) {
    if (!rental.active) continue;
    if (now < new Date(rental.expiresAt).getTime()) continue;

    // Expirado: marcar como inactivo
    rental.active = false;
    rental.revokedAt = new Date().toISOString();
    rental.revokeReason = "expired";
    changed = true;

    // Quitar del staff si aún tiene rol op_rented
    const ukey = rental.username.toLowerCase();
    if (db.staff[ukey] && db.staff[ukey].role === "op_rented") {
      delete db.staff[ukey];
    }

    // Encolar comandos de revocación para que el addon los ejecute
    const displayName = (db.users[ukey] && db.users[ukey].displayName) || rental.username;
    const cmdBase = [
      `deop "${displayName}"`,
      `gamemode s "${displayName}"`,
      `tellraw "${displayName}" {"rawtext":[{"text":"§c[Nodowa] §fTu alquiler de OP de 1 mes ha vencido. Se restablecio el modo supervivencia."}]}`
    ];

    for (const cmd of cmdBase) {
      db.deliveries.unshift({
        id: "op_exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        username: rental.username,
        itemTitle: "OP Expirado - Revocación automática",
        command: cmd,
        giveCoins: 0,
        status: "PENDING",
        createdAt: new Date().toISOString(),
        isOpRevoke: true
      });
    }

    broadcastWs("OP_RENTAL_EXPIRED", { username: rental.username, rentalId: rental.id });
    console.log(`[OP Rental] Alquiler expirado y revocado para: ${rental.username}`);
  }

  if (changed) saveDb();
}

// Verificar expiración de OP cada 60 segundos
setInterval(checkOpRentalsExpiration, 60 * 1000);
checkOpRentalsExpiration(); // Verificar al arrancar el servidor

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

// Consultar saldo de jugador desde el addon (Web = Fuente Única de Verdad)
app.get("/api/addon/get-balance", (req, res) => {
  const player = (req.query.player || "").trim().toLowerCase();
  if (!player) return res.status(400).json({ ok: false, error: "Falta el nombre del jugador" });
  const user = getOrCreateUser(player);
  const safeWallet = Math.floor(user.wallet || 0);
  const safeBank = Math.floor(user.bank || 0);

  // NOTA: 'total' devuelve 'safeWallet' para que cualquier script antiguo de Minecraft lea SIEMPRE el saldo en mano
  res.json({ ok: true, username: user.username, wallet: safeWallet, bank: safeBank, total: safeWallet });
});

// Sincronizar saldo de jugador (Web es la única autoridad, evita duplicaciones de addons antiguos)
app.post("/api/addon/sync-balance", (req, res) => {
  const { player } = req.body;
  if (!player) return res.status(400).json({ ok: false, error: "Parámetros inválidos" });
  const user = getOrCreateUser(player);
  const safeWallet = Math.floor(user.wallet || 0);
  res.json({ ok: true, wallet: safeWallet });
});

// ── Rutas de Autenticación ─────────────────────────────────────

// Solicitar código temporal de enlace (Válido 15 minutos y de un solo uso)
app.post("/api/auth/request-link", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: "Falta el Gamertag / Nick" });

  const rawName = username.trim();
  const uname = rawName.toLowerCase();
  const user = getOrCreateUser(uname);

  // Generar código aleatorio limpio y token de sesión pre-asociado
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  if (!db.sessions) db.sessions = {};
  const sessionToken = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);

  db.sessions[sessionToken] = {
    username: user.username,
    pending: true, // Pendiente hasta que ejecute /link en Minecraft
    createdAt: new Date().toISOString()
  };

  db.linkTokens[code] = {
    username: uname,
    displayName: rawName,
    sessionToken,
    expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutos
  };
  saveDb();

  res.json({ 
    ok: true, 
    code,
    sessionToken,
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

  // ── Bono de Bienvenida Automático de 500 Nodocoins por Primera Vinculación ──
  const WELCOME_BONUS = 500;
  let bonusAwarded = false;
  if (!user.linkedAt) {
    user.linkedAt = new Date().toISOString();
    if (!user.receivedWelcomeBonus) {
      user.receivedWelcomeBonus = true;
      user.wallet = (user.wallet || 0) + WELCOME_BONUS;
      bonusAwarded = true;
    }
  }

  // Activar la sesión pre-generada para este dispositivo/navegador
  const sessionToken = tokenData.sessionToken || ("sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10));
  if (!db.sessions) db.sessions = {};
  db.sessions[sessionToken] = {
    username: user.username,
    pending: false,
    createdAt: new Date().toISOString()
  };

  delete db.linkTokens[code];
  saveDb();

  broadcastWs("USER_LINKED", { username: user.username, user, sessionToken, bonusAwarded, bonusAmount: WELCOME_BONUS });
  res.json({ 
    ok: true, 
    message: `Cuenta "${user.displayName}" vinculada exitosamente.` + (bonusAwarded ? ` ¡Has recibido +${WELCOME_BONUS} Nodocoins de bienvenida!` : ""), 
    user, 
    sessionToken,
    bonusAwarded,
    bonusAmount: WELCOME_BONUS
  });
});

// Endpoint de sondeo (polling) para que la Web sepa cuando Minecraft verificó el código
app.get("/api/auth/check-link-status", (req, res) => {
  const code = req.query.code;
  if (!code) return res.json({ verified: false });

  const tokenData = db.linkTokens[code];
  if (tokenData) {
    return res.json({ verified: false, expiresAt: tokenData.expiresAt });
  }

  res.json({ verified: true });
});

// Validar Token de Sesión Persistente (Identifica el dispositivo tras cerrar navegador)
app.post("/api/auth/validate-session", (req, res) => {
  const { sessionToken } = req.body;
  if (!sessionToken || !db.sessions || !db.sessions[sessionToken]) {
    return res.status(401).json({ ok: false, error: "Sesión no válida o expirada" });
  }

  const sessionData = db.sessions[sessionToken];
  
  // Si la sesión está pendiente de que el jugador ingrese el código en Minecraft
  if (sessionData.pending) {
    return res.json({ ok: false, pending: true, username: sessionData.username, message: "Esperando confirmación /link desde Minecraft" });
  }

  const user = db.users[sessionData.username];
  if (!user) {
    return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
  }

  user.lastActive = new Date().toISOString();
  saveDb();

  res.json({ ok: true, user });
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

// Directorio y Registro de Jugadores con Filtros Avanzados
app.get("/api/players/registry", (req, res) => {
  const search       = (req.query.search       || "").trim().toLowerCase();
  const sortBy       = req.query.sortBy        || "date_desc"; // rich_desc | rich_asc | date_desc | date_asc | name_asc | name_desc
  const staffFilter  = req.query.staffFilter   || "all";       // all | only_staff | hide_staff
  const linkedFilter = req.query.linkedFilter  || "all";       // all | linked | unlinked

  let list = Object.values(db.users).map(u => {
    const ukey = u.username.toLowerCase();
    const staffInfo = db.staff ? db.staff[ukey] : null;
    const reviews = (db.ratings || []).filter(r => r.targetUser.toLowerCase() === ukey);
    const recommendations = reviews.filter(r => r.type === "RECOMMEND").length;
    const reports         = reviews.filter(r => r.type === "REPORT").length;
    const avgStars = reviews.length > 0
      ? (reviews.reduce((s, r) => s + (r.stars || 0), 0) / reviews.length).toFixed(1)
      : null;

    // Alquiler OP activo
    const activeRental = (db.opRentals || []).find(r => r.username.toLowerCase() === ukey && r.active);

    return {
      username:        u.displayName || u.username,
      linked:          !!u.linked,
      xuid:            u.xuid || null,
      wallet:          u.wallet || 0,
      bank:            u.bank  || 0,
      total:           (u.wallet || 0) + (u.bank || 0),
      avatar:          u.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(u.username)}/100`,
      bio:             u.bio || "",
      whatsapp:        u.whatsapp || null,
      discord:         u.discord  || null,
      createdAt:       u.createdAt,
      lastActive:      u.lastActive || u.createdAt,
      isStaff:         !!staffInfo,
      staffRole:       staffInfo ? staffInfo.role : null,
      staffLabel:      staffInfo ? staffInfo.label : null,
      recommendations,
      reports,
      avgStars,
      activeRental:    activeRental ? { expiresAt: activeRental.expiresAt, startsAt: activeRental.startsAt } : null
    };
  });

  // Filtro de búsqueda
  if (search) list = list.filter(p => p.username.toLowerCase().includes(search));

  // Filtro de vinculación
  if (linkedFilter === "linked")   list = list.filter(p => p.linked);
  if (linkedFilter === "unlinked") list = list.filter(p => !p.linked);

  // Filtro de staff
  if (staffFilter === "only_staff") list = list.filter(p => p.isStaff);
  if (staffFilter === "hide_staff") list = list.filter(p => !p.isStaff);

  // Ordenamiento
  const sorts = {
    rich_desc:  (a, b) => b.total - a.total,
    rich_asc:   (a, b) => a.total - b.total,
    date_desc:  (a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0),
    date_asc:   (a, b) => new Date(a.lastActive || 0) - new Date(b.lastActive || 0),
    name_asc:   (a, b) => a.username.localeCompare(b.username),
    name_desc:  (a, b) => b.username.localeCompare(a.username)
  };
  if (sorts[sortBy]) list.sort(sorts[sortBy]);

  res.json({ ok: true, count: list.length, players: list });
});

// Obtener Perfil de Jugador
app.get("/api/user/profile/:username", (req, res) => {
  const uname = req.params.username.trim().toLowerCase();
  const u = db.users[uname];
  if (!u) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

  res.json({
    ok: true,
    user: {
      username: u.displayName || u.username,
      linked: !!u.linked,
      wallet: u.wallet || 0,
      bank: u.bank || 0,
      total: (u.wallet || 0) + (u.bank || 0),
      avatar: u.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(u.username)}/100`,
      bio: u.bio || "",
      whatsapp: u.whatsapp || null,
      discord: u.discord || null,
      createdAt: u.createdAt,
      lastActive: u.lastActive || u.createdAt
    }
  });
});

// Actualizar Perfil de Jugador (Avatar, Bio, WhatsApp, Discord)
app.post("/api/user/update-profile", upload.single("avatar"), (req, res) => {
  const { username, bio, whatsapp, discord } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: "Username requerido" });

  const u = getOrCreateUser(username);

  if (bio !== undefined) u.bio = bio.trim().slice(0, 150);
  if (whatsapp !== undefined) u.whatsapp = whatsapp.trim();
  if (discord !== undefined) u.discord = discord.trim();

  if (req.file) {
    u.avatar = `/uploads/receipts/${req.file.filename}`;
  }

  saveDb();

  broadcastWs("PROFILE_UPDATED", {
    username: u.displayName || u.username,
    avatar: u.avatar,
    bio: u.bio
  });

  res.json({
    ok: true,
    user: {
      username: u.displayName || u.username,
      wallet: u.wallet,
      bank: u.bank,
      avatar: u.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(u.username)}/100`,
      bio: u.bio || "",
      whatsapp: u.whatsapp || null,
      discord: u.discord || null
    }
  });
});


// Transferencias P2P entre usuarios con Comprobante Oficial No Falsificable
app.post("/api/wallet/transfer", (req, res) => {
  const { from, to, amount } = req.body;
  const numAmount = Math.floor(Number(amount));
  if (!from || !to || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Datos de transferencia inválidos" });
  }

  const sender = getOrCreateUser(from);
  const receiver = getOrCreateUser(to);

  if (!sender || !receiver) {
    return res.status(404).json({ ok: false, error: "Usuario de origen o destino no encontrado" });
  }

  if (sender.username === receiver.username) {
    return res.status(400).json({ ok: false, error: "No puedes transferirte a ti mismo" });
  }

  if (sender.wallet < numAmount) {
    return res.status(400).json({ ok: false, error: `Saldo en mano insuficiente. Tienes ${sender.wallet.toLocaleString()} NC en mano.` });
  }

  sender.wallet = Math.floor(sender.wallet - numAmount);
  receiver.wallet = Math.floor(receiver.wallet + numAmount);
  
  const nowIso = new Date().toISOString();
  const receiptId = "REC-" + Date.now().toString().slice(-6) + Math.floor(100 + Math.random() * 900);
  const securityHash = generateReceiptHash(sender.username, receiver.username, numAmount, nowIso);

  const receipt = {
    receiptId,
    securityHash,
    from: sender.displayName || sender.username,
    to: receiver.displayName || receiver.username,
    amount: numAmount,
    timestamp: nowIso,
    status: "VERIFIED"
  };

  if (!db.receipts) db.receipts = [];
  db.receipts.unshift(receipt);
  if (db.receipts.length > 500) db.receipts.pop();

  const tx = logTransaction(sender.displayName || sender.username, receiver.displayName || receiver.username, numAmount, "TRANSFER", `Transferencia P2P [Recibo #${receiptId}]`);
  tx.receipt = receipt;

  saveDb();

  broadcastWs("TRANSACTION", tx);
  broadcastWs("BALANCE_UPDATE", { username: sender.username, wallet: sender.wallet, bank: sender.bank });
  broadcastWs("BALANCE_UPDATE", { username: receiver.username, wallet: receiver.wallet, bank: receiver.bank });

  res.json({ ok: true, tx, receipt, senderWallet: sender.wallet });
});

// Depósito / Retiro en Banco
app.post("/api/wallet/bank-action", (req, res) => {
  const { username, action, amount } = req.body; // action: "deposit" | "withdraw"
  const numAmount = Math.floor(Number(amount));
  if (!username || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Monto inválido" });
  }

  const user = getOrCreateUser(username);

  if (action === "deposit") {
    if (user.wallet < numAmount) return res.status(400).json({ ok: false, error: "Saldo insuficiente en mano" });
    user.wallet = Math.floor(user.wallet - numAmount);
    user.bank = Math.floor(user.bank + numAmount);
    logTransaction(user.username, "BANCO", numAmount, "BANK_DEPOSIT", `Depósito en banco de ${numAmount} ${db.config.currencyName}`);
  } else if (action === "withdraw") {
    if (user.bank < numAmount) return res.status(400).json({ ok: false, error: "Saldo insuficiente en el banco" });
    user.bank = Math.floor(user.bank - numAmount);
    user.wallet = Math.floor(user.wallet + numAmount);
    logTransaction("BANCO", user.username, numAmount, "BANK_WITHDRAW", `Retiro del banco de ${numAmount} ${db.config.currencyName}`);
  } else {
    return res.status(400).json({ ok: false, error: "Acción no válida" });
  }

  saveDb();
  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet, bank: user.bank });
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

  const cleanTxid = (txid || "").trim();
  if (cleanTxid.length < 5) {
    return res.status(400).json({ ok: false, error: "TXID de Binance inválido" });
  }

  // Protección Anti-Replay: Verificar que el TXID no haya sido enviado anteriormente
  const existingOrder = db.orders.find(o => (o.txid || "").toLowerCase() === cleanTxid.toLowerCase());
  if (existingOrder) {
    return res.status(400).json({ ok: false, error: `Este TXID (${cleanTxid}) ya fue registrado en una orden previa (${existingOrder.status === 'APPROVED' ? 'Aprobada' : 'Pendiente'}).` });
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

app.post("/api/market/list", upload.single("image"), (req, res) => {
  const { seller, title, itemType, price, quantity, description, whatsapp, discord } = req.body;
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
    whatsapp: whatsapp ? whatsapp.trim() : null,
    discord: discord ? discord.trim() : null,
    imageUrl: req.file ? `/uploads/receipts/${req.file.filename}` : null,
    createdAt: new Date().toISOString()
  };

  if (!db.p2pMarket) db.p2pMarket = [];
  db.p2pMarket.unshift(listing);
  saveDb();

  broadcastWs("P2P_NEW", listing);
  res.json({ ok: true, listing });
});

// Editar publicación P2P
app.post("/api/market/edit", (req, res) => {
  const { listingId, seller, title, price, quantity, description, whatsapp, discord } = req.body;
  const listing = (db.p2pMarket || []).find(l => l.id === listingId);
  if (!listing) return res.status(404).json({ ok: false, error: "Publicación no encontrada" });

  if (listing.seller.toLowerCase() !== seller.trim().toLowerCase()) {
    return res.status(403).json({ ok: false, error: "No tienes permiso para editar esta publicación" });
  }

  if (title) listing.title = title.trim();
  if (price && Number(price) > 0) listing.price = Number(price);
  if (quantity && Number(quantity) > 0) listing.quantity = Number(quantity);
  if (description !== undefined) listing.description = description.trim();
  if (whatsapp !== undefined) listing.whatsapp = whatsapp.trim();
  if (discord !== undefined) listing.discord = discord.trim();

  saveDb();
  broadcastWs("P2P_UPDATED", listing);
  res.json({ ok: true, listing });
});

// Eliminar publicación P2P
app.post("/api/market/delete", (req, res) => {
  const { listingId, seller } = req.body;
  const idx = (db.p2pMarket || []).findIndex(l => l.id === listingId);
  if (idx < 0) return res.status(404).json({ ok: false, error: "Publicación no encontrada" });

  const listing = db.p2pMarket[idx];
  const isAdmin = req.headers["x-admin-token"] === db.config.adminPassword;
  if (listing.seller.toLowerCase() !== seller.trim().toLowerCase() && !isAdmin) {
    return res.status(403).json({ ok: false, error: "No tienes permiso para eliminar esta publicación" });
  }

  db.p2pMarket.splice(idx, 1);
  saveDb();
  broadcastWs("P2P_DELETED", { listingId });
  res.json({ ok: true, message: "Publicación eliminada correctamente" });
});

// ── Rutas de Reportes Anti-Estafas ──────────────────────────────
app.post("/api/reports/create", (req, res) => {
  const { reporter, targetUser, reason, description, proof } = req.body;
  if (!reporter || !targetUser || !reason) {
    return res.status(400).json({ ok: false, error: "Faltan campos obligatorios para enviar el reporte" });
  }

  const report = {
    id: "rep_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    reporter: reporter.trim(),
    targetUser: targetUser.trim(),
    reason: reason.trim(),
    description: description ? description.trim() : "",
    proof: proof ? proof.trim() : "",
    status: "OPEN",
    createdAt: new Date().toISOString()
  };

  if (!db.reports) db.reports = [];
  db.reports.unshift(report);
  saveDb();

  broadcastWs("NEW_REPORT", report);
  res.json({ ok: true, message: "Reporte enviado al equipo de administración", report });
});

app.get("/api/admin/reports", checkAdminAuth, (req, res) => {
  res.json({ ok: true, reports: db.reports || [] });
});

app.post("/api/admin/reports/resolve", checkAdminAuth, (req, res) => {
  const { reportId, status, note } = req.body;
  const report = (db.reports || []).find(r => r.id === reportId);
  if (!report) return res.status(404).json({ ok: false, error: "Reporte no encontrado" });

  report.status = status || "RESOLVED";
  report.adminNote = note || "Procesado por administración";
  report.resolvedAt = new Date().toISOString();
  saveDb();

  broadcastWs("REPORT_RESOLVED", report);
  res.json({ ok: true, report });
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

// Gestión de Catálogo de Tienda (Con soporte para imágenes)
app.post("/api/admin/store/save-item", checkAdminAuth, upload.single("image"), (req, res) => {
  const { id, name, category, priceCoins, priceUsdt, description, iconType, command, giveCoins, badge, imageUrl } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: "Nombre obligatorio" });

  const itemId = id || "item_" + Date.now();
  const existingIdx = db.storeItems.findIndex(i => i.id === itemId);
  const existingItem = existingIdx >= 0 ? db.storeItems[existingIdx] : null;

  let finalImage = imageUrl ? imageUrl.trim() : null;
  if (req.file) {
    finalImage = `/uploads/receipts/${req.file.filename}`;
  }

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
    badge: badge ? badge.trim() : null,
    imageUrl: finalImage || (existingItem ? existingItem.imageUrl : null)
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

// Carga Masiva de Productos al Catálogo (Por JSON / Texto o Preset Equilibrado)
app.post("/api/admin/store/bulk-import", checkAdminAuth, (req, res) => {
  const { items, mode } = req.body; // mode: "replace" | "append"
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: "Debes enviar un arreglo de productos válido en formato JSON." });
  }

  const validItems = items.map((item, idx) => ({
    id: item.id || `item_bulk_${Date.now()}_${idx}`,
    name: (item.name || "Producto sin nombre").trim(),
    category: (item.category || "items").trim().toLowerCase(),
    priceCoins: Math.max(0, Math.floor(Number(item.priceCoins || 0))),
    priceUsdt: Math.max(0, Number(item.priceUsdt || 0)),
    description: (item.description || "").trim(),
    iconType: (item.iconType || "box").trim(),
    command: item.command ? item.command.trim() : null,
    giveCoins: Math.max(0, Math.floor(Number(item.giveCoins || 0))),
    badge: item.badge ? item.badge.trim() : null,
    imageUrl: item.imageUrl ? item.imageUrl.trim() : null
  }));

  if (mode === "replace") {
    db.storeItems = validItems;
  } else {
    validItems.forEach(newItem => {
      const idx = db.storeItems.findIndex(i => i.id === newItem.id);
      if (idx >= 0) db.storeItems[idx] = newItem;
      else db.storeItems.push(newItem);
    });
  }

  saveDb();
  broadcastWs("STORE_UPDATED", db.storeItems);
  res.json({ ok: true, count: validItems.length, storeItems: db.storeItems });
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

// Lista de todos los jugadores con sus balances
app.get("/api/admin/players", checkAdminAuth, (req, res) => {
  try {
    const usersObj = db.users || {};
    const players = Object.values(usersObj).map(u => ({
      username: u.displayName || u.username || "---",
      wallet: Math.floor(u.wallet || 0),
      bank: Math.floor(u.bank || 0),
      linkedAt: u.linkedAt || u.linked || null,
      createdAt: u.createdAt || null
    })).sort((a, b) => (b.wallet + b.bank) - (a.wallet + a.bank));

    res.json({ ok: true, players });
  } catch (err) {
    console.error("[Admin Players] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message, players: [] });
  }
});

// ── Sistema de Expiración Automática de Rentas OP ─────────────
function checkOpRentalsExpiry() {
  const now = Date.now();
  let updated = false;

  if (!db.opRentals) db.opRentals = [];
  if (!db.staff) db.staff = {};

  for (const rental of db.opRentals) {
    if (rental.active && rental.expiresAt && rental.expiresAt < now) {
      rental.active = false;
      rental.expiredAt = new Date().toISOString();
      updated = true;

      const uname = (rental.username || "").toLowerCase();
      if (db.staff[uname] && db.staff[uname].role === "op_rented") {
        delete db.staff[uname];
      }

      if (!db.deliveries) db.deliveries = [];
      db.deliveries.push({
        id: "del_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        targetGamertag: rental.username,
        command: `deop "${rental.username}"`,
        status: "PENDING",
        createdAt: new Date().toISOString()
      });
      db.deliveries.push({
        id: "del_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        targetGamertag: rental.username,
        command: `gamemode s "${rental.username}"`,
        status: "PENDING",
        createdAt: new Date().toISOString()
      });
      db.deliveries.push({
        id: "del_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        targetGamertag: rental.username,
        command: `tellraw "${rental.username}" {"rawtext":[{"text":"§c[Nodowa] Tu tiempo de Renta OP ha finalizado. Rango removido."}]}`,
        status: "PENDING",
        createdAt: new Date().toISOString()
      });

      console.log(`[OP Rental Expiry] Expiró renta OP de ${rental.username}. Comandos deop/gamemode s encolados.`);
    }
  }

  if (updated) saveDb();
}
setInterval(checkOpRentalsExpiry, 60000);

// ── API Jugadores Registro Público y Compatibilidad con Filtros ───
const getPublicPlayersHandler = (req, res) => {
  try {
    const search = (req.query.search || "").trim().toLowerCase();
    const status = req.query.status || "all";
    const role = req.query.role || "all";
    const sortBy = req.query.sortBy || "fortune";

    if (!db.staff) db.staff = {};
    if (!db.opRentals) db.opRentals = [];
    if (!db.ratings) db.ratings = [];

    let users = Object.values(db.users || {}).map(u => {
      const uname = (u.username || u.displayName || "").toLowerCase();
      const staffInfo = db.staff[uname] || null;

      const userRatings = db.ratings.filter(r => (r.targetUser || "").toLowerCase() === uname);
      const reviews = userRatings.filter(r => r.type === "REVIEW");
      const avgStars = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + Number(r.stars), 0) / reviews.length).toFixed(1) : null;
      const activeRental = db.opRentals.find(r => r.active && (r.username || "").toLowerCase() === uname);

      const totalVal = Math.floor((u.wallet || 0) + (u.bank || 0));

      return {
        username: u.displayName || u.username,
        cleanUsername: uname,
        wallet: Math.floor(u.wallet || 0),
        bank: Math.floor(u.bank || 0),
        total: totalVal,
        totalFortune: totalVal,
        linked: !!(u.linked || u.linkedAt),
        xuid: u.xuid || null,
        avatar: `https://mc-heads.net/avatar/${encodeURIComponent(u.displayName || u.username)}/32`,
        lastActive: u.updatedAt || u.linkedAt || u.createdAt || null,
        lastSeen: u.updatedAt || u.linkedAt || u.createdAt || null,
        staff: staffInfo,
        activeRental: activeRental ? {
          expiresAt: activeRental.expiresAt,
          daysLeft: Math.max(0, Math.ceil((activeRental.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
        } : null,
        rating: {
          avgStars: avgStars ? Number(avgStars) : null,
          totalReviews: reviews.length,
          totalReports: userRatings.filter(r => r.type === "REPORT").length
        }
      };
    });

    if (search) users = users.filter(u => u.username.toLowerCase().includes(search));
    if (status === "linked") users = users.filter(u => u.linked);
    else if (status === "unlinked") users = users.filter(u => !u.linked);

    if (role === "staff") users = users.filter(u => u.staff);
    else if (role === "admin") users = users.filter(u => u.staff && u.staff.role === "admin");
    else if (role === "op") users = users.filter(u => u.staff && (u.staff.role === "op_rented" || u.staff.role === "op"));

    if (sortBy === "wallet") users.sort((a, b) => b.wallet - a.wallet);
    else if (sortBy === "bank") users.sort((a, b) => b.bank - a.bank);
    else if (sortBy === "lastSeen") users.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    else users.sort((a, b) => b.total - a.total);

    res.json({ ok: true, players: users, total: users.length });
  } catch (err) {
    console.error("[Public Players] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message, players: [] });
  }
};

app.get("/api/players/public", getPublicPlayersHandler);
app.get("/api/players/registry", getPublicPlayersHandler);

// ── Endpoints Especiales para el Addon In-Game (/admins, /adminadd, /admindel) ──
app.get("/api/addon/staff/list", (req, res) => {
  if (!db.staff) db.staff = {};
  if (!db.opRentals) db.opRentals = [];

  const list = Object.keys(db.staff).map(uname => {
    const s = db.staff[uname];
    const rental = db.opRentals.find(r => r.active && (r.username || "").toLowerCase() === uname);
    return {
      username: s.displayName || uname,
      role: s.role,
      label: s.label || s.role.toUpperCase(),
      daysLeft: rental ? Math.max(0, Math.ceil((rental.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))) : null
    };
  });

  res.json({ ok: true, staff: list });
});

app.post("/api/addon/staff/manage", (req, res) => {
  const { action, username, days, role } = req.body;
  const uname = (username || "").trim().toLowerCase();
  if (!uname) return res.status(400).json({ ok: false, error: "Gamertag invalido" });

  if (!db.staff) db.staff = {};
  if (!db.opRentals) db.opRentals = [];
  if (!db.deliveries) db.deliveries = [];

  if (action === "revoke" || action === "del") {
    delete db.staff[uname];
    db.opRentals.forEach(r => {
      if ((r.username || "").toLowerCase() === uname) r.active = false;
    });

    db.deliveries.push({
      id: "del_" + Date.now() + "_1",
      targetGamertag: username,
      command: `deop "${username}"`,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });
    db.deliveries.push({
      id: "del_" + Date.now() + "_2",
      targetGamertag: username,
      command: `gamemode s "${username}"`,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });

    saveDb();
    return res.json({ ok: true, message: `Permisos de OP/Admin revocados de ${username}` });
  }

  // Add or update staff
  const targetRole = role || (days ? "op_rented" : "admin");
  const roleLabels = {
    admin: "[ADMIN]",
    op_rented: "[OP RENTA]",
    moderator: "[MODERADOR]"
  };

  db.staff[uname] = {
    displayName: username.trim(),
    role: targetRole,
    label: roleLabels[targetRole] || "[STAFF]",
    assignedAt: new Date().toISOString()
  };

  const rentalDays = Number(days) || 30;
  const expiresMs = Date.now() + (rentalDays * 24 * 60 * 60 * 1000);

  db.opRentals.forEach(r => {
    if ((r.username || "").toLowerCase() === uname) r.active = false;
  });

  db.opRentals.push({
    id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    username: username.trim(),
    startsAt: Date.now(),
    expiresAt: expiresMs,
    days: rentalDays,
    active: true,
    createdAt: new Date().toISOString()
  });

  db.deliveries.push({
    id: "del_" + Date.now() + "_op",
    targetGamertag: username,
    command: `op "${username}"`,
    status: "PENDING",
    createdAt: new Date().toISOString()
  });

  saveDb();
  res.json({ ok: true, message: `Staff/OP ${username} registrado por ${rentalDays} dias.` });
});

// Consulta de estado de Renta OP (Para Addon o UI)
app.get("/api/staff/my-status/:username", (req, res) => {
  const uname = (req.params.username || "").trim().toLowerCase();
  if (!db.staff) db.staff = {};
  if (!db.opRentals) db.opRentals = [];

  const staff = db.staff[uname] || null;
  const activeRental = db.opRentals.find(r => r.active && (r.username || "").toLowerCase() === uname);

  if (!staff && !activeRental) {
    return res.json({ ok: true, isOp: false, isStaff: false });
  }

  let daysLeft = 0;
  let hoursLeft = 0;
  if (activeRental && activeRental.expiresAt) {
    const diff = activeRental.expiresAt - Date.now();
    if (diff > 0) {
      daysLeft = Math.floor(diff / (1000 * 60 * 60 * 24));
      hoursLeft = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    }
  }

  res.json({
    ok: true,
    isStaff: true,
    role: staff ? staff.role : "op_rented",
    roleLabel: staff ? staff.label : "OP Alquilado",
    activeRental: activeRental ? {
      expiresAt: activeRental.expiresAt,
      daysLeft,
      hoursLeft,
      expiresDateStr: new Date(activeRental.expiresAt).toLocaleDateString("es-ES")
    } : null
  });
});

// ── Limpieza y Sanitización de Reseñas Duplicadas / Auto-reseñas ──
function sanitizeRatings() {
  if (!db.ratings) db.ratings = [];
  const seen = new Set();
  const clean = [];

  // Recorrer de más reciente a más antiguo
  const sorted = [...db.ratings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  for (const r of sorted) {
    if (!r.targetUser || !r.author) continue;
    const tUname = r.targetUser.trim().toLowerCase();
    const aUname = r.author.trim().toLowerCase();

    // Bloquear auto-reseñas
    if (tUname === aUname) continue;

    if (r.type === "REVIEW") {
      const key = `${aUname}->${tUname}`;
      if (seen.has(key)) continue; // Eliminar duplicados, mantener solo la más reciente
      seen.add(key);
    }
    clean.push(r);
  }

  db.ratings = clean.reverse();
}

// Enviar o Editar Reseña / Reporte a Jugador
app.post("/api/ratings/submit", (req, res) => {
  const { targetUser, author, stars, comment, type } = req.body;
  if (!targetUser || !author || !comment) {
    return res.status(400).json({ ok: false, error: "Datos requeridos faltantes." });
  }

  const tUname = targetUser.trim().toLowerCase();
  const aUname = author.trim().toLowerCase();

  // 1. Bloquear auto-reseñas
  if (tUname === aUname) {
    return res.status(400).json({ ok: false, error: "No puedes escribirte una reseña o reporte a ti mismo." });
  }

  if (!db.ratings) db.ratings = [];
  sanitizeRatings();

  // 2. Si es REVIEW, verificar si el autor ya había calificado al jugador
  if (type !== "REPORT") {
    const existingIndex = db.ratings.findIndex(r => r.type === "REVIEW" && r.targetUser.trim().toLowerCase() === tUname && r.author.trim().toLowerCase() === aUname);
    if (existingIndex !== -1) {
      // Actualizar reseña existente
      db.ratings[existingIndex].stars = Math.min(5, Math.max(1, Number(stars) || 5));
      db.ratings[existingIndex].comment = comment.trim();
      db.ratings[existingIndex].updatedAt = new Date().toISOString();
      saveDb();

      return res.json({
        ok: true,
        message: "Tu reseña existente ha sido actualizada con éxito.",
        rating: db.ratings[existingIndex]
      });
    }
  }

  // 3. Crear nueva entrada
  const ratingEntry = {
    id: "rat_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    targetUser: targetUser.trim(),
    author: author.trim(),
    stars: Math.min(5, Math.max(1, Number(stars) || 5)),
    comment: comment.trim(),
    type: type === "REPORT" ? "REPORT" : "REVIEW",
    status: "PENDING",
    createdAt: new Date().toISOString()
  };

  db.ratings.push(ratingEntry);
  saveDb();

  res.json({
    ok: true,
    message: type === "REPORT" ? "Reporte enviado a los administradores." : "Reseña publicada con éxito.",
    rating: ratingEntry
  });
});

// Eliminar mi propia Reseña
app.post("/api/ratings/delete", (req, res) => {
  const { ratingId, author } = req.body;
  if (!ratingId || !author) return res.status(400).json({ ok: false, error: "Datos faltantes." });

  if (!db.ratings) db.ratings = [];
  const index = db.ratings.findIndex(r => r.id === ratingId);
  if (index === -1) return res.status(404).json({ ok: false, error: "Reseña no encontrada." });

  const rating = db.ratings[index];
  const aUname = author.trim().toLowerCase();
  const ratingAuthor = (rating.author || "").trim().toLowerCase();

  if (ratingAuthor !== aUname) {
    return res.status(403).json({ ok: false, error: "No tienes permiso para borrar esta reseña." });
  }

  db.ratings.splice(index, 1);
  saveDb();

  res.json({ ok: true, message: "Reseña eliminada correctamente." });
});

// Obtener Reseñas de un Jugador
app.get("/api/ratings/user/:username", (req, res) => {
  const uname = (req.params.username || "").trim().toLowerCase();
  if (!db.ratings) db.ratings = [];
  sanitizeRatings();

  const userRatings = db.ratings.filter(r => (r.targetUser || "").toLowerCase() === uname);
  const reviews = userRatings.filter(r => r.type === "REVIEW");
  const reports = userRatings.filter(r => r.type === "REPORT");
  const avgStars = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + Number(r.stars), 0) / reviews.length).toFixed(1) : null;

  res.json({
    ok: true,
    targetUser: req.params.username,
    avgStars: avgStars ? Number(avgStars) : null,
    totalReviews: reviews.length,
    reviews,
    reportsCount: reports.length
  });
});

// ── Rutas de Administración de Staff y Rentas OP ────────────────
app.get("/api/admin/staff", checkAdminAuth, (req, res) => {
  if (!db.staff) db.staff = {};
  if (!db.opRentals) db.opRentals = [];

  const staffList = Object.keys(db.staff).map(uname => {
    const s = db.staff[uname];
    const rental = db.opRentals.find(r => r.active && (r.username || "").toLowerCase() === uname);
    return {
      username: s.displayName || uname,
      role: s.role,
      label: s.label,
      assignedAt: s.assignedAt,
      rental: rental ? {
        id: rental.id,
        expiresAt: rental.expiresAt,
        daysLeft: Math.max(0, Math.ceil((rental.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
      } : null
    };
  });

  const activeRentals = db.opRentals.filter(r => r.active);

  res.json({ ok: true, staff: staffList, rentals: activeRentals });
});

// Asignar o Editar Rol de Staff / Renta OP por el Admin
app.post("/api/admin/staff/manage", checkAdminAuth, (req, res) => {
  const { username, role, days, label, action } = req.body; // action: "assign" | "revoke"
  const uname = (username || "").trim().toLowerCase();

  if (!uname) return res.status(400).json({ ok: false, error: "Gamertag requerido." });

  if (!db.staff) db.staff = {};
  if (!db.opRentals) db.opRentals = [];
  if (!db.deliveries) db.deliveries = [];

  if (action === "revoke") {
    delete db.staff[uname];
    // Desactivar rentas activas
    db.opRentals.forEach(r => {
      if ((r.username || "").toLowerCase() === uname) {
        r.active = false;
        r.revokedAt = new Date().toISOString();
      }
    });

    // Encolar comandos de deop y gamemode s
    db.deliveries.push({
      id: "del_" + Date.now() + "_1",
      targetGamertag: username,
      command: `deop "${username}"`,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });
    db.deliveries.push({
      id: "del_" + Date.now() + "_2",
      targetGamertag: username,
      command: `gamemode s "${username}"`,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });

    saveDb();
    return res.json({ ok: true, message: `Rol y permisos revocado de ${username}.` });
  }

  // Asignar o actualizar rol
  const targetRole = role || "op_rented"; // admin, op_rented, moderator
  const roleLabels = {
    admin: "👑 Administrador Principal",
    op_rented: "⚡ OP (Renta)",
    moderator: "🛡️ Moderador"
  };

  db.staff[uname] = {
    displayName: username.trim(),
    role: targetRole,
    label: label || roleLabels[targetRole] || "Staff",
    assignedAt: new Date().toISOString()
  };

  // Manejar tiempo de OP si aplica
  let expiresAt = null;
  const rentalDays = Number(days);
  if (rentalDays && rentalDays > 0) {
    const expiresMs = Date.now() + (rentalDays * 24 * 60 * 60 * 1000);
    expiresAt = expiresMs;

    // Desactivar rentas previas
    db.opRentals.forEach(r => {
      if ((r.username || "").toLowerCase() === uname) r.active = false;
    });

    const rentalRecord = {
      id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      username: username.trim(),
      startsAt: Date.now(),
      expiresAt: expiresMs,
      days: rentalDays,
      active: true,
      createdAt: new Date().toISOString()
    };
    db.opRentals.push(rentalRecord);

    // Encolar comando OP en Minecraft
    db.deliveries.push({
      id: "del_" + Date.now() + "_op",
      targetGamertag: username,
      command: `op "${username}"`,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });
    db.deliveries.push({
      id: "del_" + Date.now() + "_msg",
      targetGamertag: username,
      command: `tellraw "${username}" {"rawtext":[{"text":"§a[Nodowa] Se te ha asignado Rango OP por ${rentalDays} días. ¡Disfrútalo!"}]}`,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });
  }

  saveDb();
  res.json({
    ok: true,
    message: `Staff ${username} actualizado como ${roleLabels[targetRole]}.`,
    staff: db.staff[uname],
    expiresAt
  });
});

// Ver Reportes de Jugadores en Admin
app.get("/api/admin/reports", checkAdminAuth, (req, res) => {
  if (!db.ratings) db.ratings = [];
  const reports = db.ratings.filter(r => r.type === "REPORT").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, reports });
});

// Resolver/Desestimar Reporte
app.post("/api/admin/reports/resolve", checkAdminAuth, (req, res) => {
  const { reportId, status } = req.body; // status: "RESOLVED" | "DISMISSED"
  if (!db.ratings) db.ratings = [];

  const report = db.ratings.find(r => r.id === reportId);
  if (!report) return res.status(404).json({ ok: false, error: "Reporte no encontrado." });

  report.status = status || "RESOLVED";
  report.resolvedAt = new Date().toISOString();
  saveDb();

  res.json({ ok: true, message: `Reporte marcado como ${report.status}.`, report });
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

// ── STAFF & OP RENTALS ────────────────────────────────────────

// GET /api/admin/staff — lista todo el staff + rentals activos
app.get("/api/admin/staff", checkAdminAuth, (req, res) => {
  try {
    const now = Date.now();

    // Calcular días restantes para op_rented y marcar como expirado si corresponde
    let changed = false;
    for (const uname in db.staff) {
      const s = db.staff[uname];
      if (s.role === "op_rented" && s.expiresAt) {
        const msLeft = new Date(s.expiresAt).getTime() - now;
        s.daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
        if (msLeft <= 0) {
          s.expired = true;
        }
        changed = true;
      }
    }
    if (changed) saveDb();

    const staffList = Object.entries(db.staff).map(([uname, s]) => ({
      username: uname,
      displayName: s.displayName || uname,
      role: s.role,
      label: s.label || "",
      assignedAt: s.assignedAt || null,
      rental: (s.role === "op_rented" && s.expiresAt) ? {
        expiresAt: s.expiresAt,
        daysLeft: s.daysLeft || 0,
        expired: s.expired || false
      } : null
    }));

    res.json({ ok: true, staff: staffList });
  } catch (err) {
    console.error("[Staff] Error al listar staff:", err);
    res.status(500).json({ ok: false, error: "Error interno al cargar staff" });
  }
});

// POST /api/admin/staff/manage — crear o editar un miembro de staff
app.post("/api/admin/staff/manage", checkAdminAuth, (req, res) => {
  try {
    const { username, role, days, label } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ ok: false, error: "Gamertag requerido" });
    if (!["admin", "op_rented", "moderator"].includes(role)) return res.status(400).json({ ok: false, error: "Rol inválido" });

    const uname = username.trim().toLowerCase();
    const displayName = username.trim();
    const now = new Date();

    const entry = {
      displayName,
      role,
      label: label ? label.trim() : (role === "admin" ? "[ADMIN]" : role === "op_rented" ? "[OP RENTA]" : "[MOD]"),
      assignedAt: db.staff[uname]?.assignedAt || now.toISOString()
    };

    if (role === "op_rented") {
      const numDays = Math.max(1, parseInt(days) || 30);
      const expiresAt = new Date(now.getTime() + numDays * 24 * 60 * 60 * 1000);
      entry.expiresAt = expiresAt.toISOString();
      entry.daysLeft = numDays;
      entry.expired = false;
    } else {
      delete entry.expiresAt;
      delete entry.daysLeft;
      delete entry.expired;
    }

    db.staff[uname] = entry;
    saveDb();

    broadcastToAll({ type: "STAFF_UPDATE", username: uname, role, label: entry.label });
    res.json({ ok: true, message: `Staff actualizado: ${displayName} como ${role}` });
  } catch (err) {
    console.error("[Staff] Error al gestionar staff:", err);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
});

// DELETE /api/admin/staff/:username — revocar a un miembro de staff
app.delete("/api/admin/staff/:username", checkAdminAuth, (req, res) => {
  try {
    const uname = req.params.username.toLowerCase();
    if (!db.staff[uname]) return res.status(404).json({ ok: false, error: "Miembro de staff no encontrado" });
    const name = db.staff[uname].displayName || uname;
    delete db.staff[uname];
    saveDb();
    res.json({ ok: true, message: `${name} eliminado del staff` });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error interno" });
  }
});

// GET /api/addon/staff/list — para el addon de Minecraft (sin auth admin, usa ADDON_TOKEN)
app.get("/api/addon/staff/list", (req, res) => {
  try {
    const admins = Object.entries(db.staff)
      .filter(([, s]) => s.role === "admin")
      .map(([uname, s]) => s.displayName || uname);
    const ops = Object.entries(db.staff)
      .filter(([, s]) => s.role === "op_rented" && !s.expired)
      .map(([uname, s]) => ({ name: s.displayName || uname, daysLeft: s.daysLeft || 0 }));
    res.json({ ok: true, admins, ops });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error interno" });
  }
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
