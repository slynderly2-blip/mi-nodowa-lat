'use strict';
const db      = require('../../config/database');
const manager = require('../deliveries/deliveries.manager');
const { genId } = require('../auth/auth.service');
const { BadRequest, NotFound } = require('../../shared/errors');
const log = require('../../shared/logger');

function listItems(category, search, page = 1, limit = 50) {
  let sql = `SELECT * FROM store_items WHERE enabled = 1`;
  const p = [];
  if (category) { sql += ' AND category = ?'; p.push(category); }
  if (search)   { sql += ' AND (name LIKE ? OR description LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY sort_order ASC, name ASC LIMIT ? OFFSET ?';
  p.push(limit, (page - 1) * limit);
  const items = db.query(sql, p);
  const cats  = db.query(`SELECT category, COUNT(*) as count FROM store_items WHERE enabled = 1 GROUP BY category ORDER BY count DESC`, []);
  return { ok: true, items, categories: cats, page, limit };
}

function getItem(id) {
  const item = db.get('SELECT * FROM store_items WHERE id = ? AND enabled = 1', [id]);
  if (!item) throw new NotFound('Artículo no encontrado');
  return { ok: true, item };
}

function buyWithNC(username, itemId) {
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new NotFound('Usuario no encontrado');

  const item = db.get('SELECT * FROM store_items WHERE id = ? AND enabled = 1', [itemId]);
  if (!item) throw new NotFound('Artículo no encontrado');
  if (!item.price_coins || item.price_coins <= 0) throw new BadRequest('No se puede comprar con NC');
  if (user.wallet < item.price_coins) throw new BadRequest(`Saldo insuficiente. Tienes ${user.wallet} NC.`);

  let deliveryId;
  db.transaction(() => {
    db.run('UPDATE users SET wallet = wallet - ? WHERE id = ?', [item.price_coins, user.id]);

    deliveryId = manager.createDelivery({
      username:      user.username,
      itemTitle:     item.name,
      itemCategory:  item.category,
      command:       item.command || '',
      giveCoins:     0,
      priceCoins:    item.price_coins,
      paymentMethod: 'NC',
      source:        'STORE_NC',
    });

    if (item.give_coins > 0) {
      db.run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [item.give_coins, user.id]);
      db.run(`INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, 'SYSTEM', ?, ?, 'COINS_PURCHASE', ?)`,
        [genId('tx'), username, item.give_coins, `Recarga: ${item.name}`]);
    }

    db.run(`INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, ?, 'STORE', ?, 'PURCHASE', ?)`,
      [genId('tx'), username, item.price_coins, `Compra: ${item.name}`]);

    db.run(`INSERT INTO messages (id, from_user, to_user, subject, body, ref_id, ref_type) VALUES (?, 'SYSTEM', ?, ?, ?, ?, 'DELIVERY')`,
      [genId('msg'), username, `Compra: ${item.name}`, `Tu compra fue procesada.`, deliveryId]);
  });

  log.ok(`[Store] ${username} compró ${item.name}`);
  return { ok: true, deliveryId, itemTitle: item.name };
}

function submitOrder(username, itemId, txid, receiptImage) {
  const user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new NotFound('Usuario no encontrado');
  const item = db.get('SELECT * FROM store_items WHERE id = ? AND enabled = 1', [itemId]);
  if (!item) throw new NotFound('Artículo no encontrado');
  if (!item.price_usdt || item.price_usdt <= 0) throw new BadRequest('No se puede comprar con USDT');

  const orderId = genId('ord');
  db.transaction(() => {
    db.run(`INSERT INTO orders (id, user_id, username, item_id, item_title, price_usdt, give_coins, command, txid, receipt_image, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [orderId, user.id, user.username, item.id, item.name, item.price_usdt, item.give_coins || 0, item.command || '', txid || '', receiptImage || '']);
    db.run(`INSERT INTO messages (id, from_user, to_user, subject, body, ref_id, ref_type) VALUES (?, 'SYSTEM', ?, ?, ?, ?, 'ORDER')`,
      [genId('msg'), username, `Pedido recibido: ${item.name}`, `Tu pedido está en revisión.`, orderId]);
  });

  log.ok(`[Store] Orden USDT: ${username} → ${item.name}`);
  return { ok: true, orderId, status: 'PENDING' };
}

module.exports = { listItems, getItem, buyWithNC, submitOrder };
