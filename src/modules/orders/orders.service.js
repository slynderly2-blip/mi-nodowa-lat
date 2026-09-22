'use strict';
/** src/modules/orders/orders.service.js */

const db  = require('../../config/database');
const { genId } = require('../auth/auth.service');
const { NotFound, BadRequest } = require('../../shared/errors');
const log = require('../../shared/logger');

function listOrders(username, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const rows = db.query(
    `SELECT * FROM orders WHERE username = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [username, limit, offset]
  );
  const count = db.get('SELECT COUNT(*) as c FROM orders WHERE username = ? COLLATE NOCASE', [username]);
  return { ok: true, orders: rows, total: count?.c || 0, page };
}

function getOrder(username, orderId) {
  const order = db.get(
    'SELECT * FROM orders WHERE id = ? AND username = ? COLLATE NOCASE',
    [orderId, username]
  );
  if (!order) throw new NotFound('Pedido no encontrado');
  return { ok: true, order };
}

module.exports = { listOrders, getOrder };
