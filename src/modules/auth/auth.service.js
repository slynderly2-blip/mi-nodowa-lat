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

// ── Generar código de vinculación ─────────────────────────────────────────────
function generateLinkCode(username) {
  // Limpiar tokens expirados o previos del usuario
  db.run(`DELETE FROM link_tokens WHERE username = ? OR expires_at < datetime('now')`, [username]);

  const code = genLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutos

  db.run(
    `INSERT OR REPLACE INTO link_tokens (code, username, expires_at, used)
     VALUES (?, ?, ?, 0)`,
    [code, username, expiresAt]
  );

  return { ok: true, code, expiresAt };
}

// ── Verificar vinculación (llamado desde addon) ───────────────────────────────
async function verifyLink(code, playerName, xuid) {
  if (!code || !playerName) throw new BadRequest('Código y nombre de jugador requeridos');

  const token = db.get(
    `SELECT * FROM link_tokens WHERE code = ? AND used = 0 AND expires_at > datetime('now')`,
    [String(code)]
  );
  if (!token) return { ok: false, error: 'Código inválido o expirado' };

  const { username } = token;

  // Verificar que el username del token coincida con playerName o actualizarlo
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) return { ok: false, error: 'Usuario no encontrado' };

  // Ya vinculado?
  if (user.linked) {
    db.run('DELETE FROM link_tokens WHERE code = ?', [code]);
    return { ok: false, error: 'Tu cuenta ya está vinculada' };
  }

  // Dar bono
  const bonusNc = 500;
  db.transaction(() => {
    db.run(
      `UPDATE users SET linked = 1, xuid = ?, display_name = ?, last_active = datetime('now') WHERE id = ?`,
      [xuid || null, playerName, user.id]
    );
    db.run(
      `UPDATE users SET wallet = wallet + ? WHERE id = ?`,
      [bonusNc, user.id]
    );
    db.run(
      `INSERT INTO transactions (id, from_user, to_user, amount, type, note)
       VALUES (?, 'SYSTEM', ?, ?, 'BONUS', 'Bono de vinculación Minecraft')`,
      [genId('tx'), username, bonusNc]
    );
    db.run(`UPDATE link_tokens SET used = 1 WHERE code = ?`, [code]);
  });

  log.ok(`[Auth] Cuenta vinculada: ${username} ↔ ${playerName}`);
  return { ok: true, bonusAmount: bonusNc, bonusAwarded: true };
}

// ── Helper: datos seguros del usuario ────────────────────────────────────────
function safeUser(u) {
  const { password_hash, pin, ...safe } = u;
  return safe;
}

module.exports = { register, login, adminLogin, me, generateLinkCode, verifyLink, makeToken, safeUser, genId };
