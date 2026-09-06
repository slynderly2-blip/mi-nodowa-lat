import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser, logTransaction } from "../services/economy.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// 1. Solicitar código temporal de enlace (/link <code>)
router.post("/request-link", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: "Ingresa tu Gamertag de Minecraft" });

  const rawName = username.trim();
  const uname = rawName.toLowerCase();
  const user = getOrCreateUser(uname);
  user.displayName = rawName;

  // Generar código numérico limpio de 6 dígitos
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const sessionToken = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);

  if (!db.sessions) db.sessions = {};
  db.sessions[sessionToken] = {
    username: user.username,
    pending: true,
    code,
    createdAt: new Date().toISOString()
  };

  if (!db.linkTokens) db.linkTokens = {};
  db.linkTokens[code] = {
    username: uname,
    displayName: rawName,
    sessionToken,
    expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutos
  };

  saveDb();

  res.json({
    ok: true,
    code,
    sessionToken,
    command: `/link ${code}`,
    expiresInSeconds: 900,
    expiresAt: db.linkTokens[code].expiresAt,
    instruction: `Entra a Minecraft con "${rawName}" y escribe en el chat: /link ${code}`
  });
});

// 2. Verificar código desde Minecraft (Addon vía HTTP o script)
router.post("/verify-link", (req, res) => {
  const { code, player, xuid } = req.body;
  if (!code || !player) return res.status(400).json({ ok: false, error: "Faltan parámetros requeridos (code, player)" });

  const cleanCode = String(code).trim();
  const tokenData = db.linkTokens ? db.linkTokens[cleanCode] : null;

  if (!tokenData) {
    return res.status(400).json({ ok: false, error: "El código no existe o ya fue utilizado." });
  }

  if (Date.now() > tokenData.expiresAt) {
    delete db.linkTokens[cleanCode];
    saveDb();
    return res.status(400).json({ ok: false, error: "El código expiró (límite de 15 minutos)." });
  }

  const executingPlayer = player.trim().toLowerCase();
  const targetPlayer = tokenData.username.trim().toLowerCase();

  if (executingPlayer !== targetPlayer) {
    return res.status(403).json({
      ok: false,
      error: `Este código pertenece a "${tokenData.displayName || tokenData.username}". Debes vincularlo desde esa cuenta.`
    });
  }

  const user = getOrCreateUser(targetPlayer);
  user.displayName = player.trim();

  // Bono de bienvenida: 500 NC solo la primera vez que se vincula
  const isFirstLink = !user.linked;
  if (isFirstLink) {
    user.wallet = (user.wallet || 0) + 500;
    logTransaction("SYSTEM", user.username, 500, "WELCOME_BONUS", "Bono de bienvenida por primera vinculación");
  }

  user.linked = true;
  user.linkedAt = new Date().toISOString();
  if (xuid && !user.xuid) user.xuid = xuid;

  // Actualizar sesión asociada
  const sessionToken = tokenData.sessionToken;
  if (sessionToken && db.sessions && db.sessions[sessionToken]) {
    db.sessions[sessionToken].pending = false;
    db.sessions[sessionToken].verifiedAt = new Date().toISOString();
  }

  delete db.linkTokens[cleanCode];
  saveDb();

  // Notificar a clientes WebSocket (la web del usuario se autentica en tiempo real)
  broadcastWs("USER_LINKED", {
    username: user.username,
    displayName: user.displayName,
    sessionToken,
    user,
    welcomeBonus: isFirstLink ? 500 : 0
  });

  res.json({
    ok: true,
    message: `¡Cuenta "${user.displayName}" vinculada exitosamente con la web!`,
    user,
    sessionToken
  });
});

// 3. Sondeo del estado de vinculación (para la web del navegador)
router.get("/check-link-status", (req, res) => {
  const { code, sessionToken } = req.query;

  if (sessionToken && db.sessions && db.sessions[sessionToken]) {
    const sess = db.sessions[sessionToken];
    if (!sess.pending) {
      const user = db.users[sess.username] || getOrCreateUser(sess.username);
      return res.json({ ok: true, verified: true, user, sessionToken });
    }
  }

  if (code && db.linkTokens && db.linkTokens[code]) {
    return res.json({ ok: true, verified: false, expiresAt: db.linkTokens[code].expiresAt });
  }

  res.json({ ok: true, verified: false, expired: true });
});

// 4. Validar token de sesión persistente
router.post("/validate-session", (req, res) => {
  const { sessionToken } = req.body;
  if (!sessionToken || !db.sessions || !db.sessions[sessionToken]) {
    return res.status(401).json({ ok: false, error: "Sesión no válida o expirada" });
  }

  const sess = db.sessions[sessionToken];
  if (sess.pending) {
    return res.json({ ok: false, pending: true, username: sess.username });
  }

  const user = db.users[sess.username];
  if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

  user.lastActive = new Date().toISOString();
  saveDb();

  res.json({ ok: true, user, sessionToken });
});

// 5. Cerrar sesión
router.post("/logout", (req, res) => {
  const { sessionToken } = req.body;
  if (sessionToken && db.sessions && db.sessions[sessionToken]) {
    delete db.sessions[sessionToken];
    saveDb();
  }
  res.json({ ok: true });
});

export default router;
