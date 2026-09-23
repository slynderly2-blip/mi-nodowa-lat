'use strict';
/** src/modules/users/users.service.js */

const db  = require('../../config/database');
const { NotFound } = require('../../shared/errors');

function getProfile(username) {
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new NotFound('Usuario no encontrado');
  const { password_hash, pin, ...safe } = user;
  return { ok: true, user: safe };
}

function getLeaderboard(limit = 20) {
  const rows = db.query(
    'SELECT username, display_name, wallet, bank, linked FROM users ORDER BY wallet DESC LIMIT ?',
    [limit]
  );
  return { ok: true, leaderboard: rows };
}

function searchUser(q) {
  const rows = db.query(
    `SELECT username, display_name, linked FROM users WHERE username LIKE ? COLLATE NOCASE LIMIT 10`,
    [`%${q}%`]
  );
  return { ok: true, users: rows };
}

module.exports = { getProfile, getLeaderboard, searchUser };
