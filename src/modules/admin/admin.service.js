'use strict';
const bcrypt  = require('bcryptjs');
const db      = require('../../config/database');
const manager = require('../deliveries/deliveries.manager');
const { genId } = require('../auth/auth.service');
const { NotFound, BadRequest } = require('../../shared/errors');
const log = require('../../shared/logger');

function getStats() {
  const users      = db.get('SELECT COUNT(*) as c FROM users');
  const linked     = db.get("SELECT COUNT(*) as c FROM users WHERE linked = 1");
  const items      = db.get("SELECT COUNT(*) as c FROM store_items WHERE enabled = 1");
  const orders     = db.get("SELECT COUNT(*) as c FROM orders WHERE status = 'PENDING'");
  const deliveries = db.get("SELECT COUNT(*) as c FROM deliveries WHERE status = 'PENDING'");
  const totalTx    = db.get('SELECT COUNT(*) as c, SUM(amount) as total FROM transactions');
  const wallets    = db.get('SELECT SUM(wallet) as w, SUM(bank) as b FROM users');
  return { ok: true, stats: {
    totalUsers: users?.c || 0, linkedUsers: linked?.c || 0, storeItems: items?.c || 0,
    pendingOrders: orders?.c || 0, pendingDeliveries: deliveries?.c || 0,
    totalTransactions: totalTx?.c || 0, ncCirculating: (wallets?.w || 0) + (wallets?.b || 0),
  }};
}

function listOrders(status = 'PENDING', page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const where  = status !== 'ALL' ? 'WHERE status = ?' : '';
  const params = status !== 'ALL' ? [status, limit, offset] : [limit, offset];
  const rows   = db.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, params);
  const count  = db.get(`SELECT COUNT(*) as c FROM orders ${where}`, status !== 'ALL' ? [status] : []);
  return { ok: true, orders: rows, total: count?.c || 0 };
}

function approveOrder(orderId, adminUsername) {
  const order = db.get("SELECT * FROM orders WHERE id = ? AND status = 'PENDING'", [orderId]);
  if (!order) throw new NotFound('Pedido no encontrado');

  // ── Detectar si es entrega de solo-NC (sin comando) ──────────────────────
  // En ese caso, acreditar los NC AHORA directamente sin dejar delivery PENDING.
  // El jugador no necesita entrar al juego para recibir monedas web.
  const isCoinsOnly = (order.give_coins > 0) && !order.command?.trim();

  let delId;
  db.transaction(() => {
    db.run(`UPDATE orders SET status = 'APPROVED', reviewed_at = datetime('now') WHERE id = ?`, [orderId]);

    delId = manager.createDelivery({
      username:      order.username,
      itemTitle:     order.item_title,
      itemCategory:  'store',
      command:       order.command || '',
      giveCoins:     order.give_coins || 0,
      priceCoins:    0,
      paymentMethod: 'USDT',
      source:        isCoinsOnly ? 'STORE_USDT_AUTO' : 'STORE_USDT',
    });

    if (isCoinsOnly) {
      // Entrega automática: marcar DELIVERED inmediatamente y acreditar wallet
      db.run(
        `UPDATE deliveries SET status = 'DELIVERED', delivered_at = datetime('now') WHERE id = ?`,
        [delId]
      );
      db.run(
        'UPDATE users SET wallet = wallet + ? WHERE username = ? COLLATE NOCASE',
        [order.give_coins, order.username]
      );
      db.run(
        `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, 'SYSTEM', ?, ?, 'COINS_PURCHASE', ?)`,
        [genId('tx'), order.username, order.give_coins, `Recarga USDT: ${order.item_title}`]
      );
      db.run(
        `INSERT INTO messages (id, from_user, to_user, subject, body, ref_id, ref_type) VALUES (?, 'SYSTEM', ?, ?, ?, ?, 'DELIVERY')`,
        [genId('msg'), order.username,
         `¡Recarga procesada! ${order.item_title}`,
         `Se acreditaron ${order.give_coins} Nodocoins a tu billetera automáticamente.`,
         delId]
      );
      log.ok(`[Admin] Orden NC auto-entregada: ${orderId} → +${order.give_coins} NC a ${order.username}`);
    } else {
      // Entrega normal: queda PENDING, el jugador la reclama en /buzon
      db.run(
        `INSERT INTO messages (id, from_user, to_user, subject, body, ref_id, ref_type) VALUES (?, 'SYSTEM', ?, ?, ?, ?, 'DELIVERY')`,
        [genId('msg'), order.username,
         `Pedido aprobado: ${order.item_title}`,
         `Tu pedido fue aprobado. Reclámalo en el servidor con /tienda.`,
         delId]
      );
      log.ok(`[Admin] Orden aprobada (delivery PENDING): ${orderId} por ${adminUsername}`);
    }
  });

  return { ok: true, deliveryId: delId, autoDelivered: isCoinsOnly };
}

function rejectOrder(orderId, note, adminUsername) {
  const order = db.get("SELECT * FROM orders WHERE id = ? AND status = 'PENDING'", [orderId]);
  if (!order) throw new NotFound('Pedido no encontrado');
  db.transaction(() => {
    db.run(`UPDATE orders SET status = 'REJECTED', admin_note = ?, reviewed_at = datetime('now') WHERE id = ?`, [note || 'Rechazado', orderId]);
    db.run(`INSERT INTO messages (id, from_user, to_user, subject, body, ref_id, ref_type) VALUES (?, 'SYSTEM', ?, ?, ?, ?, 'ORDER')`,
      [genId('msg'), order.username, `Pedido rechazado: ${order.item_title}`, `Motivo: ${note || 'No especificado'}`, orderId]);
  });
  log.warn(`[Admin] Orden rechazada: ${orderId} por ${adminUsername}`);
  return { ok: true };
}

function listUsers(search, page = 1, limit = 30) {
  const offset = (page - 1) * limit;
  let sql = 'SELECT id, username, display_name, wallet, bank, linked, is_admin, created_at FROM users';
  const p = [];
  if (search) { sql += ' WHERE username LIKE ? OR display_name LIKE ?'; p.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY wallet DESC LIMIT ? OFFSET ?';
  p.push(limit, offset);
  const rows  = db.query(sql, p);
  const count = db.get(`SELECT COUNT(*) as c FROM users${search ? ' WHERE username LIKE ? OR display_name LIKE ?' : ''}`, search ? [`%${search}%`, `%${search}%`] : []);
  return { ok: true, users: rows, total: count?.c || 0 };
}

function setWallet(userId, wallet, bank) {
  const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw new NotFound('Usuario no encontrado');
  const sets = []; const p = [];
  if (wallet !== undefined) { sets.push('wallet = ?'); p.push(parseInt(wallet)); }
  if (bank   !== undefined) { sets.push('bank = ?');   p.push(parseInt(bank)); }
  if (!sets.length) throw new BadRequest('Nada que actualizar');
  p.push(userId);
  db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, p);
  return { ok: true, user: db.get('SELECT id, username, wallet, bank FROM users WHERE id = ?', [userId]) };
}

async function createAdminUser(username, password) {
  const hash = await bcrypt.hash(password, 10);
  const existing = db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (existing) {
    db.run('UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?', [hash, existing.id]);
  } else {
    db.run(`INSERT INTO users (username, display_name, password_hash, wallet, bank, linked, is_admin) VALUES (?, ?, ?, 0, 0, 0, 1)`, [username, username, hash]);
  }
  return { ok: true };
}

function listAllItems(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const items = db.query('SELECT * FROM store_items ORDER BY sort_order ASC, name ASC LIMIT ? OFFSET ?', [limit, offset]);
  const total = db.get('SELECT COUNT(*) as c FROM store_items');
  return { ok: true, items, total: total?.c || 0 };
}

function createItem(data) {
  const { id, name, category, price_coins, price_usdt, description, icon_type, command, give_coins, badge, sort_order } = data;
  if (!id || !name || !category) throw new BadRequest('id, name y category requeridos');
  db.run(`INSERT INTO store_items (id, name, category, price_coins, price_usdt, description, icon_type, command, give_coins, badge, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, name, category, price_coins||0, price_usdt||0, description||'', icon_type||'gem', command||'', give_coins||0, badge||'', sort_order||0]);
  return { ok: true, id };
}

function updateItem(id, data) {
  const item = db.get('SELECT * FROM store_items WHERE id = ?', [id]);
  if (!item) throw new NotFound('Item no encontrado');
  const fields = ['name','category','price_coins','price_usdt','description','icon_type','command','give_coins','badge','enabled','sort_order'];
  const sets = []; const p = [];
  for (const f of fields) { if (data[f] !== undefined) { sets.push(`${f} = ?`); p.push(data[f]); } }
  if (!sets.length) throw new BadRequest('Nada que actualizar');
  p.push(id);
  db.run(`UPDATE store_items SET ${sets.join(', ')} WHERE id = ?`, p);
  return { ok: true };
}

function deleteItem(id) {
  db.run('UPDATE store_items SET enabled = 0 WHERE id = ?', [id]);
  return { ok: true };
}

function listDeliveries(status = 'PENDING', page = 1, limit = 30) {
  const offset = (page - 1) * limit;
  const where  = status !== 'ALL' ? 'WHERE status = ?' : '';
  const rows   = db.query(`SELECT * FROM deliveries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, status !== 'ALL' ? [status, limit, offset] : [limit, offset]);
  return { ok: true, deliveries: rows };
}

// ── Zona de reclamos (delivery_issues) ───────────────────────────────────────

function listIssues(status = 'pending', page = 1, limit = 30) {
  const offset = (page - 1) * limit;
  const where  = status !== 'ALL' ? 'WHERE di.status = ?' : '';
  const params = status !== 'ALL' ? [status, limit, offset] : [limit, offset];
  const rows = db.query(
    `SELECT di.*, d.give_coins, d.command, d.payment_method, d.source
     FROM delivery_issues di
     LEFT JOIN deliveries d ON d.id = di.delivery_id
     ${where} ORDER BY di.created_at DESC LIMIT ? OFFSET ?`,
    params
  );
  const count = db.get(
    `SELECT COUNT(*) as c FROM delivery_issues${status !== 'ALL' ? ' WHERE status = ?' : ''}`,
    status !== 'ALL' ? [status] : []
  );
  return { ok: true, issues: rows, total: count?.c || 0 };
}

function requeueIssue(issueId, adminUsername) {
  const issue = db.get('SELECT * FROM delivery_issues WHERE id = ?', [issueId]);
  if (!issue) throw new NotFound('Reclamo no encontrado');

  // Crear una nueva delivery PENDING para reenviar
  const delId = manager.createDelivery({
    username:      issue.player,
    itemTitle:     issue.item_title,
    itemCategory:  'requeue',
    command:       issue.command || '',
    giveCoins:     0,
    priceCoins:    0,
    paymentMethod: 'REQUEUE',
    source:        'ADMIN_REQUEUE',
  });

  db.transaction(() => {
    db.run(`UPDATE delivery_issues SET status = 'resolved', note = ? WHERE id = ?`,
      [`Reencolado por ${adminUsername}. Nueva delivery: ${delId}`, issueId]);
    db.run(`INSERT INTO messages (id, from_user, to_user, subject, body, ref_id, ref_type) VALUES (?, 'SYSTEM', ?, ?, ?, ?, 'DELIVERY')`,
      [genId('msg'), issue.player, `Reclamo procesado: ${issue.item_title}`, `Tu reclamo fue revisado. Se te reenviará el artículo. Reclámalo con /tienda.`, delId]);
  });

  log.ok(`[Admin] Reencolar reclamo ${issueId} → nueva delivery ${delId} (por ${adminUsername})`);
  return { ok: true, deliveryId: delId };
}

function refundIssue(issueId, refundAmount, adminUsername) {
  const issue = db.get('SELECT * FROM delivery_issues WHERE id = ?', [issueId]);
  if (!issue) throw new NotFound('Reclamo no encontrado');
  const amt = parseInt(refundAmount, 10);
  if (isNaN(amt) || amt < 0) throw new BadRequest('Monto de reembolso inválido');

  db.transaction(() => {
    if (amt > 0) {
      db.run('UPDATE users SET wallet = wallet + ? WHERE username = ? COLLATE NOCASE', [amt, issue.player]);
      db.run(`INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, 'SYSTEM', ?, ?, 'REFUND', ?)`,
        [genId('tx'), issue.player, amt, `Reembolso: ${issue.item_title}`]);
    }
    db.run(`UPDATE delivery_issues SET status = 'resolved', note = ? WHERE id = ?`,
      [`Reembolsado ${amt} NC por ${adminUsername}`, issueId]);
    db.run(`INSERT INTO messages (id, from_user, to_user, subject, body, ref_id, ref_type) VALUES (?, 'SYSTEM', ?, ?, ?, ?, 'DELIVERY')`,
      [genId('msg'), issue.player,
       `Reembolso: ${issue.item_title}`,
       amt > 0 ? `Se te reembolsaron ${amt} NC por tu reclamo.` : `Tu reclamo fue procesado por el administrador.`,
       issue.id]);
  });

  log.ok(`[Admin] Reembolso reclamo ${issueId} → ${amt} NC a ${issue.player} (por ${adminUsername})`);
  return { ok: true };
}

function ignoreIssue(issueId, adminNote, adminUsername) {
  const issue = db.get('SELECT * FROM delivery_issues WHERE id = ?', [issueId]);
  if (!issue) throw new NotFound('Reclamo no encontrado');
  db.run(`UPDATE delivery_issues SET status = 'ignored', note = ? WHERE id = ?`,
    [adminNote || `Ignorado por ${adminUsername}`, issueId]);
  log.warn(`[Admin] Ignorar reclamo ${issueId} (por ${adminUsername})`);
  return { ok: true };
}

function createIssue({ deliveryId, player, itemTitle, command, note }) {
  if (!player || !itemTitle) throw new BadRequest('player e itemTitle requeridos');
  const id = genId('iss');
  db.run(
    `INSERT INTO delivery_issues (id, delivery_id, player, item_title, command, note, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [id, deliveryId || null, player, itemTitle, command || '', note || '']
  );
  // Notificar a admins via mensaje interno a SYSTEM (log)
  log.info(`[Issues] Nuevo reclamo ${id}: ${player} → ${itemTitle}`);
  return { ok: true, id };
}


function getConfig() {
  const rows = db.query('SELECT key, value FROM config', []);
  const cfg  = {};
  for (const { key, value } of rows) cfg[key] = value;
  return { ok: true, config: cfg };
}

function setConfig(key, value) {
  db.run(`INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))`, [key, value]);
  return { ok: true };
}

function impersonateUser(userId, adminUsername) {
  const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw new NotFound('Usuario no encontrado');
  const { makeToken, safeUser } = require('../auth/auth.service');
  // Token de corta duración para la sesión impersonada
  const token = makeToken(user);
  log.warn(`[Admin] ${adminUsername} impersonando a ${user.username}`);
  return { ok: true, token, user: safeUser(user), impersonatedBy: adminUsername };
}

module.exports = { getStats, listOrders, approveOrder, rejectOrder, listUsers, setWallet, createAdminUser, listAllItems, createItem, updateItem, deleteItem, listDeliveries, getConfig, setConfig, listIssues, requeueIssue, refundIssue, ignoreIssue, createIssue, impersonateUser };
