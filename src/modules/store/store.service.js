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

  // PROTECCIÓN ANTI-DUPLICADO: Verificar si ya existe una compra reciente del mismo item
  const recentPurchase = db.get(
    `SELECT id FROM deliveries 
     WHERE username = ? AND item_title = ? AND status = 'PENDING'
     AND created_at > datetime('now', '-30 seconds')`,
    [user.username, item.name]
  );
  
  if (recentPurchase) {
    log.warn(`[Store] ⚠️ BLOQUEO ANTI-DUPLICADO: ${username} intentó comprar ${item.name} dos veces en 30s`);
    throw new BadRequest('Ya tienes una compra reciente de este artículo en proceso. Espera unos segundos.');
  }

  const deliveryId = genId('del');
  const txId       = genId('tx');
  const msgId      = genId('msg');

  db.transaction(() => {
    // Descontar NC
    db.run('UPDATE users SET wallet = wallet - ? WHERE id = ?', [item.price_coins, user.id]);

    // Crear delivery YA MARCADA COMO PENDING (el addon la recogerá)
    // NO dar coins aquí - el addon los dará cuando confirme
    db.run(
      `INSERT INTO deliveries (id, user_id, username, item_title, item_category, command, give_coins, price_coins, payment_method, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Nodocoins (NC)', 'STORE_NC', 'PENDING')`,
      [deliveryId, user.id, user.username, item.name, item.category, item.command || '', 0, item.price_coins]
    );

    // SI el item da coins (recarga de NC), darlos INMEDIATAMENTE aquí (no esperar al addon)
    if (item.give_coins > 0) {
      db.run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [item.give_coins, user.id]);
      db.run(
        `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, 'SYSTEM', ?, ?, 'COINS_PURCHASE', ?)`,
        [genId('tx2'), username, item.give_coins, `Recarga: ${item.name}`]
      );
      log.info(`[Store] Coins otorgados inmediatamente: ${item.give_coins} NC a ${username}`);
    }

    // Registrar transacción de compra
    db.run(
      `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, ?, 'STORE', ?, 'PURCHASE', ?)`,
      [txId, username, item.price_coins, `Compra: ${item.name}`]
    );
    
    // Crear mensaje de notificación en el buzón
    db.run(
      `INSERT INTO messages (id, from_user, to_user, subject, body, action, ref_id, ref_type)
       VALUES (?, 'SYSTEM', ?, ?, ?, 'VIEW_DELIVERY', ?, 'DELIVERY')`,
      [
        msgId, 
        username, 
        `Compra confirmada: ${item.name}`,
        `Tu compra de "${item.name}" por ${item.price_coins} NC ha sido procesada. ${item.give_coins > 0 ? `Recibiste ${item.give_coins} NC. ` : ''}${item.command ? 'Recibirás el item en el juego.' : ''}`,
        deliveryId,
      ]
    );
  });

  log.ok(`[Store] ✅ Compra NC: ${username} compró ${item.name} x ${item.price_coins} NC (ID: ${deliveryId})`);
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
  const msgId   = genId('msg');
  
  db.transaction(() => {
    db.run(
      `INSERT INTO orders (id, user_id, username, item_id, item_title, price_usdt, give_coins, command, txid, receipt_image, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [orderId, user.id, user.username, item.id, item.name, item.price_usdt, item.give_coins || 0, item.command || '', txid || '', receiptImage || '']
    );
    
    // Crear mensaje de notificación
    db.run(
      `INSERT INTO messages (id, from_user, to_user, subject, body, action, ref_id, ref_type)
       VALUES (?, 'SYSTEM', ?, ?, ?, 'VIEW_ORDER', ?, 'ORDER')`,
      [
        msgId,
        username,
        `Pedido recibido: ${item.name}`,
        `Tu pedido de "${item.name}" por $${item.price_usdt} USDT ha sido recibido y está en revisión. Te notificaremos cuando sea aprobado.`,
        orderId,
      ]
    );
  });

  log.ok(`[Store] Orden USDT: ${username} → ${item.name} = $${item.price_usdt}`);
  return { ok: true, orderId, status: 'PENDING', message: 'Tu pedido fue recibido y está en revisión.' };
}

module.exports = { listItems, getItem, buyWithNC, submitOrder };
