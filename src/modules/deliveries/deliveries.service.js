'use strict';
const db = require('../../config/database');

function listDeliveries(username, status, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  let sql = `SELECT * FROM deliveries WHERE username = ? COLLATE NOCASE`;
  const params = [username];
  if (status) { sql += ' AND status = ?'; params.push(status.toUpperCase()); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows  = db.query(sql, params);
  const count = db.get(`SELECT COUNT(*) as c FROM deliveries WHERE username = ? COLLATE NOCASE${status ? ' AND status = ?' : ''}`, status ? [username, status.toUpperCase()] : [username]);
  return { ok: true, deliveries: rows, total: count?.c || 0 };
}

module.exports = { listDeliveries };
