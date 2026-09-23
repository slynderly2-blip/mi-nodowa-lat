'use strict';
/** src/modules/deliveries/deliveries.service.js */

const db  = require('../../config/database');
const { NotFound, BadRequest } = require('../../shared/errors');

function listDeliveries(username, status, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  let sql = `SELECT * FROM deliveries WHERE username = ? COLLATE NOCASE`;
  const params = [username];
  if (status) { sql += ' AND status = ?'; params.push(status.toUpperCase()); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.query(sql, params);
  const count = db.get(
    `SELECT COUNT(*) as c FROM deliveries WHERE username = ? COLLATE NOCASE${status ? ' AND status = ?' : ''}`,
    status ? [username, status.toUpperCase()] : [username]
  );
  return { ok: true, deliveries: rows, total: count?.c || 0, page, limit };
}

function claimDelivery(username, deliveryId) {
  const delivery = db.get(
    `SELECT * FROM deliveries WHERE id = ? AND username = ? COLLATE NOCASE`,
    [deliveryId, username]
  );
  if (!delivery) throw new NotFound('Entrega no encontrada');
  if (delivery.status === 'DELIVERED') return { ok: true, already: true, message: 'Ya fue reclamada' };

  // El addon es quien ejecuta el comando; aquí solo marcamos como entregada
  return require('../addon/addon.service').ackDelivery(deliveryId);
}

module.exports = { listDeliveries, claimDelivery };
