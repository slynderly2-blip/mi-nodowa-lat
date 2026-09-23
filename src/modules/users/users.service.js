'use strict';
/** src/modules/users/users.service.js */

const db  = require('../../config/database');
const { NotFound, BadRequest } = require('../../shared/errors');

function getProfile(username) {
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new NotFound('Usuario no encontrado');
  const { password_hash, pin, ...safe } = user;
  return { ok: true, user: safe };
}

function updateProfile(username, { display_name, avatar }) {
  const user = db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new NotFound('Usuario no encontrado');

  const sets   = [];
  const params = [];

  if (display_name !== undefined) {
    const dn = String(display_name).trim();
    if (dn.length < 2 || dn.length > 32)
      throw new BadRequest('El nombre debe tener entre 2 y 32 caracteres');
    sets.push('display_name = ?');
    params.push(dn);
  }

  if (avatar !== undefined) {
    // Solo se acepta una URL HTTPS o una letra (inicial)
    const av = String(avatar).trim().slice(0, 255);
    sets.push('avatar = ?');
    params.push(av);
  }

  if (!sets.length) throw new BadRequest('Nada que actualizar');

  params.push(username);
  db.run(`UPDATE users SET ${sets.join(', ')} WHERE username = ? COLLATE NOCASE`, params);

  const updated = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  const { password_hash, pin, ...safe } = updated;
  return { ok: true, user: safe };
}

function getLeaderboard(limit = 20) {
  const rows = db.query(
    `SELECT username, display_name, avatar, wallet, bank, linked
     FROM users ORDER BY (wallet + bank) DESC LIMIT ?`,
    [limit]
  );
  return { ok: true, leaderboard: rows };
}

function searchUser(q) {
  if (!q || q.trim().length < 2) return { ok: true, users: [] };
  const rows = db.query(
    `SELECT username, display_name, avatar, wallet, bank, linked, last_active
     FROM users WHERE username LIKE ? COLLATE NOCASE OR display_name LIKE ? LIMIT 20`,
    [`%${q.trim()}%`, `%${q.trim()}%`]
  );
  return { ok: true, users: rows };
}

// ── Mensajes / Buzón ──────────────────────────────────────────────────────────
function getInbox(username, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const rows = db.query(
    `SELECT * FROM messages WHERE to_user = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [username, limit, offset]
  );
  const total = db.get('SELECT COUNT(*) as c FROM messages WHERE to_user = ?', [username]);
  const unread = db.get(
    'SELECT COUNT(*) as c FROM messages WHERE to_user = ? AND read_at IS NULL', [username]
  );
  return { ok: true, messages: rows, total: total?.c || 0, unread: unread?.c || 0 };
}

function markRead(username, messageId) {
  db.run(
    `UPDATE messages SET read_at = datetime('now') WHERE id = ? AND to_user = ?`,
    [messageId, username]
  );
  return { ok: true };
}

function markAllRead(username) {
  db.run(
    `UPDATE messages SET read_at = datetime('now') WHERE to_user = ? AND read_at IS NULL`,
    [username]
  );
  return { ok: true };
}

function getUnreadCount(username) {
  const row = db.get(
    'SELECT COUNT(*) as c FROM messages WHERE to_user = ? AND read_at IS NULL', [username]
  );
  return { ok: true, unread: row?.c || 0 };
}

module.exports = {
  getProfile, updateProfile,
  getLeaderboard, searchUser,
  getInbox, markRead, markAllRead, getUnreadCount,
};
