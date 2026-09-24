'use strict';
/**
 * src/modules/auth/auth.service.js
 * Login, registro, JWT, generación de código de vinculación
 */

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cfg      = require('../../config');
const db       = require('../../config/database');
const { BadRequest, Unauthorized, Conflict, NotFound } = require('../../shared/errors');
const log      = require('../../shared/logger');

// Genera id de transacción/sesión estilo nodowa
function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Genera código numérico de 6 dígitos único
function genLinkCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, isAdmin: !!user.is_admin },
    cfg.jwt.secret,
    { expiresIn: user.is_admin ? cfg.jwt.adminExpires : cfg.jwt.expiresIn }
  );
}

// ── Registro ──────────────────────────────────────────────────────────────────
async function register(username, password) {
  if (!username || !password) throw new BadRequest('Usuario y contraseña requeridos');
  if (username.length < 2 || username.length > 32)
    throw new BadRequest('El nombre de usuario debe tener entre 2 y 32 caracteres');

  const existing = db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) throw new Conflict('Ese nombre de usuario ya está registrado');

  const hash = await bcrypt.hash(password, 10);
  db.run(
    `INSERT INTO users (username, display_name, password_hash, wallet, bank, linked, is_admin, created_at, last_active)
     VALUES (?, ?, ?, 0, 0, 0, 0, datetime('now'), datetime('now'))`,
    [username, username, hash]
  );

  const user = db.get('SELECT * FROM users WHERE username = ?', [username]);
  const token = makeToken(user);
  log.ok(`[Auth] Nuevo usuario: ${username}`);
  return { ok: true, token, user: safeUser(user) };
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(username, password) {
  if (!username || !password) throw new BadRequest('Usuario y contraseña requeridos');

  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new Unauthorized('Usuario o contraseña incorrectos');

  // Soporte legacy: si no tiene password_hash, no puede iniciar sesión normal
  if (!user.password_hash) throw new Unauthorized('Esta cuenta requiere configurar contraseña');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new Unauthorized('Usuario o contraseña incorrectos');

  db.run(`UPDATE users SET last_active = datetime('now') WHERE id = ?`, [user.id]);
  const token = makeToken(user);
  log.ok(`[Auth] Login: ${username}`);
  return { ok: true, token, user: safeUser(user) };
}

// ── Login Admin ───────────────────────────────────────────────────────────────
async function adminLogin(username, password) {
  // NUEVO: Primero verificar si coincide con variables de entorno
  const envAdminUser = process.env.ADMIN_USERNAME;
  const envAdminPass = process.env.ADMIN_PASSWORD;
  
  if (envAdminUser && envAdminPass && username === envAdminUser && password === envAdminPass) {
    // Admin desde variables de entorno - acceso directo sin DB
    log.ok(`[Auth] Admin login via ENV: ${username}`);
    
    // Buscar o crear usuario admin en DB
    let user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
    if (!user) {
      const hash = await bcrypt.hash(password, 10);
      db.run(
        `INSERT INTO users (username, display_name, password_hash, wallet, bank, linked, is_admin, created_at, last_active)
         VALUES (?, ?, ?, 0, 0, 1, 1, datetime('now'), datetime('now'))`,
        [username, username, hash]
      );
      user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
      log.ok(`[Auth] Admin user created from ENV: ${username}`);
    } else if (!user.is_admin) {
      // Actualizar a admin si no lo era
      db.run(`UPDATE users SET is_admin = 1 WHERE id = ?`, [user.id]);
      user.is_admin = 1;
      log.ok(`[Auth] User promoted to admin: ${username}`);
    }
    
    db.run(`UPDATE users SET last_active = datetime('now') WHERE id = ?`, [user.id]);
    const token = jwt.sign(
      { id: user.id, username: user.username, isAdmin: true },
      cfg.jwt.secret,
      { expiresIn: cfg.jwt.adminExpires }
    );
    return { ok: true, token, user: safeUser(user) };
  }
  
  // Fallback: verificar contra BD (admins existentes)
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_admin = 1', [username]);
  if (!user) throw new Unauthorized('Credenciales de administrador inválidas');

  const ok = await bcrypt.compare(password, user.password_hash || '');
  if (!ok) throw new Unauthorized('Credenciales de administrador inválidas');

  db.run(`UPDATE users SET last_active = datetime('now') WHERE id = ?`, [user.id]);
  const token = jwt.sign(
    { id: user.id, username: user.username, isAdmin: true },
    cfg.jwt.secret,
    { expiresIn: cfg.jwt.adminExpires }
  );
  return { ok: true, token, user: safeUser(user) };
}

// ── Me ────────────────────────────────────────────────────────────────────────
function me(username) {
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new NotFound('Usuario no encontrado');
  return { ok: true, user: safeUser(user) };
}

// ── Solicitar código de vinculación (sin auth — flujo web→MC) ─────────────────
async function requestLinkCode(username) {
  if (!username || username.trim().length < 2)
    throw new BadRequest('Nickname de Minecraft requerido (mínimo 2 caracteres)');

  const nick = username.trim();

  // Crear usuario si no existe (cuenta base, sin contraseña)
  let user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [nick]);
  if (!user) {
    db.run(
      `INSERT INTO users (username, display_name, wallet, bank, linked, is_admin, created_at, last_active)
       VALUES (?, ?, 0, 0, 0, 0, datetime('now'), datetime('now'))`,
      [nick, nick]
    );
    user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [nick]);
  }

  // Limpiar tokens anteriores del usuario
  db.run(`DELETE FROM link_tokens WHERE username = ? OR expires_at < datetime('now')`, [nick]);

  const code      = genLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  db.run(
    `INSERT INTO link_tokens (code, username, session_token, expires_at, used) VALUES (?, ?, NULL, ?, 0)`,
    [code, nick, expiresAt]
  );

  log.info(`[Auth] Código de vinculación generado para: ${nick} → ${code}`);
  return { ok: true, code, expiresAt, username: nick };
}

// ── Verificar vinculación (llamado desde addon) ───────────────────────────────
async function verifyLink(code, playerName, xuid) {
  if (!code || !playerName) throw new BadRequest('Código y nombre de jugador requeridos');

  const linkToken = db.get(
    `SELECT * FROM link_tokens WHERE code = ? AND used = 0 AND expires_at > datetime('now')`,
    [String(code)]
  );
  if (!linkToken) return { ok: false, error: 'Código inválido o expirado' };

  const { username } = linkToken;

  // ✅ Verificar que quien usa el código es el jugador que lo generó
  if (username && username.toLowerCase() !== playerName.trim().toLowerCase()) {
    return { ok: false, error: 'Este código no pertenece a tu cuenta de Minecraft' };
  }

  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) return { ok: false, error: 'Usuario no encontrado' };

  const alreadyLinked = !!user.linked;
  const bonusNc       = alreadyLinked ? 0 : 500;
  const jwtToken      = makeToken(user);

  db.transaction(() => {
    if (!alreadyLinked) {
      // Primera vinculación: actualizar datos y dar bono
      db.run(
        `UPDATE users SET linked = 1, xuid = ?, display_name = ?, last_active = datetime('now') WHERE id = ?`,
        [xuid || null, playerName, user.id]
      );
      db.run(`UPDATE users SET wallet = wallet + ? WHERE id = ?`, [bonusNc, user.id]);
      db.run(
        `INSERT INTO transactions (id, from_user, to_user, amount, type, note)
         VALUES (?, 'SYSTEM', ?, ?, 'BONUS', 'Bono de vinculación Minecraft')`,
        [genId('tx'), username, bonusNc]
      );
    } else {
      // Relogin: solo actualizar last_active
      db.run(`UPDATE users SET last_active = datetime('now') WHERE id = ?`, [user.id]);
    }

    // Guardar JWT en session_token para que el polling lo recoja
    db.run(
      `UPDATE link_tokens SET used = 1, session_token = ? WHERE code = ?`,
      [jwtToken, code]
    );
  });

  log.ok(`[Auth] ${alreadyLinked ? 'Relogin' : 'Vinculación'}: ${username} ↔ ${playerName}`);
  return { ok: true, bonusAmount: bonusNc, bonusAwarded: !alreadyLinked };
}

// ── Verificar si el código ya fue usado (polling desde el frontend) ────────────
function checkLinkStatus(code) {
  const linkToken = db.get(
    `SELECT * FROM link_tokens WHERE code = ?`,
    [code]
  );

  if (!linkToken) return { ok: false, status: 'expired' };

  // Código todavía pendiente
  if (!linkToken.used) {
    // Verificar expiración
    if (new Date(linkToken.expires_at) < new Date()) {
      db.run(`DELETE FROM link_tokens WHERE code = ?`, [code]);
      return { ok: false, status: 'expired' };
    }
    return { ok: false, status: 'pending' };
  }

  // Ya fue usado — devolver JWT guardado
  if (!linkToken.session_token) return { ok: false, status: 'error' };

  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [linkToken.username]);
  if (!user) return { ok: false, status: 'error' };

  // Limpiar token
  db.run(`DELETE FROM link_tokens WHERE code = ?`, [code]);

  return { ok: true, status: 'linked', token: linkToken.session_token, user: safeUser(user) };
}

// ── Helper: datos seguros del usuario ────────────────────────────────────────
function safeUser(u) {
  const { password_hash, pin, ...safe } = u;
  return safe;
}

module.exports = { register, login, adminLogin, me, requestLinkCode, checkLinkStatus, generateLinkCode: requestLinkCode, verifyLink, makeToken, safeUser, genId };
