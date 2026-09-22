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

// ── Generar código de vinculación / login ────────────────────────────────────
function generateLinkCode(username = null) {
  // Limpiar tokens expirados
  db.run(`DELETE FROM link_tokens WHERE expires_at < datetime('now')`);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutos

  db.run(
    `INSERT INTO link_tokens (code, username, expires_at, used)
     VALUES (?, ?, ?, 0)`,
    [code, username || '', expiresAt]
  );

  return { ok: true, code, expiresAt };
}

// ── Verificar vinculación (llamado desde addon con /link <codigo>) ─────────────
async function verifyLink(code, playerName, xuid) {
  if (!code || !playerName) throw new BadRequest('Código y nombre de jugador requeridos');

  const cleanCode = String(code).trim();
  const token = db.get(
    `SELECT * FROM link_tokens WHERE code = ? AND used = 0 AND expires_at > datetime('now')`,
    [cleanCode]
  );
  if (!token) return { ok: false, error: 'Código inválido o expirado' };

  // Buscar o auto-crear usuario en la base de datos
  let user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [playerName]);
  let bonusAwarded = false;
  const bonusNc = 500;

  db.transaction(() => {
    if (!user) {
      db.run(
        `INSERT INTO users (username, display_name, wallet, bank, linked, xuid, is_admin)
         VALUES (?, ?, ?, 0, 1, ?, 0)`,
        [playerName, playerName, bonusNc, xuid ? String(xuid) : null]
      );
      user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [playerName]);
      bonusAwarded = true;
      db.run(
        `INSERT INTO transactions (id, from_user, to_user, amount, type, note)
         VALUES (?, 'SYSTEM', ?, ?, 'BONUS', 'Bono de bienvenida')`,
        [genId('tx'), playerName, bonusNc]
      );
    } else {
      if (!user.linked) {
        db.run(
          `UPDATE users SET linked = 1, xuid = ?, last_active = datetime('now'), wallet = wallet + ? WHERE id = ?`,
          [xuid ? String(xuid) : user.xuid, bonusNc, user.id]
        );
        bonusAwarded = true;
        db.run(
          `INSERT INTO transactions (id, from_user, to_user, amount, type, note)
           VALUES (?, 'SYSTEM', ?, ?, 'BONUS', 'Bono de vinculación')`,
          [genId('tx'), user.username, bonusNc]
        );
      } else {
        db.run(
          `UPDATE users SET last_active = datetime('now'), xuid = COALESCE(?, xuid) WHERE id = ?`,
          [xuid ? String(xuid) : null, user.id]
        );
      }
      user = db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    }

    const sessionJwt = makeToken(user);

    db.run(
      `UPDATE link_tokens SET used = 1, username = ?, session_token = ? WHERE code = ?`,
      [user.username, sessionJwt, cleanCode]
    );
  });

  log.ok(`[Auth] /link exitoso: ${playerName} con código ${cleanCode}`);
  return { ok: true, bonusAmount: bonusNc, bonusAwarded };
}

// ── Polling de la web para saber si el jugador ya usó /link en Minecraft ───────
function pollLink(code) {
  if (!code) throw new BadRequest('Código requerido');
  const token = db.get('SELECT * FROM link_tokens WHERE code = ?', [String(code).trim()]);
  if (!token) return { ok: false, error: 'Código no encontrado' };

  if (token.used === 1 && token.session_token) {
    const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [token.username]);
    return {
      ok: true,
      linked: true,
      token: token.session_token,
      user: user ? safeUser(user) : null
    };
  }

  // Verificar si expiró
  const isExpired = new Date(token.expires_at) < new Date();
  if (isExpired) return { ok: false, error: 'Código expirado' };

  return { ok: true, linked: false };
}

// ── Helper: datos seguros del usuario ────────────────────────────────────────
function safeUser(u) {
  const { password_hash, pin, ...safe } = u;
  return safe;
}

module.exports = { register, login, adminLogin, me, generateLinkCode, verifyLink, pollLink, makeToken, safeUser, genId };
