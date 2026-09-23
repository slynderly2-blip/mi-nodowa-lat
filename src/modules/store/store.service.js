'use strict';
/** src/modules/store/store.service.js */

const db  = require('../../config/database');
const { genId } = require('../auth/auth.service');
const { BadRequest, NotFound } = require('../../shared/errors');
const log = require('../../shared/logger');

function listItems(category, search, page = 1, limit = 50) {
  let sql = `SELECT * FROM store_items WHERE enabled = 1`;
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (search)   { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY sort_order ASC, name ASC';
  const offset = (page - 1) * limit;
  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const items = db.query(sql, params);

  // Conteo de categorías
  const categories = db.query(
    `SELECT category, COUNT(*) as count FROM store_items WHERE enabled = 1 GROUP BY category ORDER BY count DESC`,
    []
  );

  return { ok: true, items, categories, page, limit };
}

function getItem(id) {
  const item = db.get('SELECT * FROM store_items WHERE id = ? AND enabled = 1', [id]);
  if (!item) throw new NotFound('Artículo no encontrado');
  return { ok: true, item };
}

// Compra con Nodocoins
function buyWithNC(username, itemId) {
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new NotFound('Usuario no encontrado');

  const item = db.get('SELECT * FROM store_items WHERE id = ? AND enabled = 1', [itemId]);
  if (!item) throw new NotFound('Artículo no encontrado');
  if (!item.price_coins || item.price_coins <= 0) throw new BadRequest('Este artículo no se puede comprar con Nodocoins');
  if (user.wallet < item.price_coins) throw new BadRequest(`Saldo insuficiente. Necesitas ${item.price_coins} NC, tienes ${user.wallet} NC.`);

  const deliveryId = genId('del');
  const txId       = genId('tx');

  db.transaction(() => {
    // Descontar NC
    db.run('UPDATE users SET wallet = wallet - ? WHERE id = ?', [item.price_coins, user.id]);

    // Crear delivery
    db.run(
      `INSERT INTO deliveries (id, user_id, username, item_title, item_category, command, give_coins, price_coins, payment_method, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Nodocoins (NC)', 'STORE_NC', 'PENDING')`,
      [deliveryId, user.id, user.username, item.name, item.category, item.command || '', item.give_coins || 0, item.price_coins]
    );

    // Registrar transacción
    db.run(
      `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, ?, 'STORE', ?, 'PURCHASE', ?)`,
      [txId, username, item.price_coins, `Compra: ${item.name}`]
    );
  });

  log.ok(`[Store] Compra NC: ${username} compró ${item.name} x ${item.price_coins} NC`);
  return { ok: true, deliveryId, itemTitle: item.name, priceCoins: item.price_coins };
}

// Enviar pedido con comprobante USDT
function submitOrder(username, itemId, txid, receiptImage) {
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new NotFound('Usuario no encontrado');

  const item = db.get('SELECT * FROM store_items WHERE id = ? AND enabled = 1', [itemId]);
  if (!item) throw new NotFound('Artículo no encontrado');
  if (!item.price_usdt || item.price_usdt <= 0) throw new BadRequest('Este artículo no se puede comprar con USDT');

  const orderId = genId('ord');
  db.run(
    `INSERT INTO orders (id, user_id, username, item_id, item_title, price_usdt, give_coins, command, txid, receipt_image, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [orderId, user.id, user.username, item.id, item.name, item.price_usdt, item.give_coins || 0, item.command || '', txid || '', receiptImage || '']
  );

  log.ok(`[Store] Orden USDT: ${username} → ${item.name} = $${item.price_usdt}`);
  return { ok: true, orderId, status: 'PENDING', message: 'Tu pedido fue recibido y está en revisión.' };
}

module.exports = { listItems, getItem, buyWithNC, submitOrder };
