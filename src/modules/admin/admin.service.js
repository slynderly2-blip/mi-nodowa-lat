'use strict';
/** src/modules/admin/admin.service.js */

const bcrypt = require('bcryptjs');
const db     = require('../../config/database');
const { genId } = require('../auth/auth.service');
const { NotFound, BadRequest } = require('../../shared/errors');
const log    = require('../../shared/logger');

// ── Stats ─────────────────────────────────────────────────────────────────────
function getStats() {
  const users        = db.get('SELECT COUNT(*) as c FROM users');
  const linked       = db.get('SELECT COUNT(*) as c FROM users WHERE linked = 1');
  const items        = db.get('SELECT COUNT(*) as c FROM store_items WHERE enabled = 1');
  const orders       = db.get("SELECT COUNT(*) as c FROM orders WHERE status = 'PENDING'");
  const deliveries   = db.get("SELECT COUNT(*) as c FROM deliveries WHERE status = 'PENDING'");
  const totalTx      = db.get('SELECT COUNT(*) as c, SUM(amount) as total FROM transactions');
  const totalWallet  = db.get('SELECT SUM(wallet) as w, SUM(bank) as b FROM users');

  return {
    ok: true,
    stats: {
      totalUsers:        users?.c       || 0,
      linkedUsers:       linked?.c      || 0,
      storeItems:        items?.c       || 0,
      pendingOrders:     orders?.c      || 0,
      pendingDeliveries: deliveries?.c  || 0,
      totalTransactions: totalTx?.c     || 0,
      ncCirculating:     (totalWallet?.w || 0) + (totalWallet?.b || 0),
    }
  };
}

// ── Orders admin ──────────────────────────────────────────────────────────────
function listOrders(status = 'PENDING', page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const rows = db.query(
    `SELECT * FROM orders ${status !== 'ALL' ? "WHERE status = ?" : ""} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    status !== 'ALL' ? [status, limit, offset] : [limit, offset]
  );
  const count = db.get(
    `SELECT COUNT(*) as c FROM orders ${status !== 'ALL' ? "WHERE status = ?" : ""}`,
    status !== 'ALL' ? [status] : []
  );
  return { ok: true, orders: rows, total: count?.c || 0 };
}

function approveOrder(orderId, adminUsername) {
  const order = db.get("SELECT * FROM orders WHERE id = ? AND status = 'PENDING'", [orderId]);
  if (!order) throw new NotFound('Pedido pendiente no encontrado');

  const delId = genId('del');

  db.transaction(() => {
    // Marcar orden aprobada
    db.run(
      `UPDATE orders SET status = 'APPROVED', admin_note = 'Aprobado por el Administrador', reviewed_at = datetime('now') WHERE id = ?`,
      [orderId]
    );

    // Crear entrega
    db.run(
      `INSERT INTO deliveries (id, username, item_title, item_category, command, give_coins, price_coins, payment_method, source, status)
       VALUES (?, ?, ?, 'store', ?, ?, 0, 'USDT/Binance', 'STORE_USDT', 'PENDING')`,
      [delId, order.username, order.item_title, order.command || '', order.give_coins || 0]
    );

    // Si da coins, otorgar inmediatamente
    if (order.give_coins > 0) {
      db.run('UPDATE users SET wallet = wallet + ? WHERE username = ? COLLATE NOCASE', [order.give_coins, order.username]);
      db.run(
        `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, 'SYSTEM', ?, ?, 'DELIVERY', ?)`,
        [genId('tx'), order.username, order.give_coins, `Compra aprobada: ${order.item_title}`]
      );
    }
  });

  log.ok(`[Admin] Orden aprobada: ${orderId} por ${adminUsername}`);
  return { ok: true, deliveryId: delId };
}

function rejectOrder(orderId, note, adminUsername) {
  const order = db.get("SELECT * FROM orders WHERE id = ? AND status = 'PENDING'", [orderId]);
  if (!order) throw new NotFound('Pedido pendiente no encontrado');

  db.run(
    `UPDATE orders SET status = 'REJECTED', admin_note = ?, reviewed_at = datetime('now') WHERE id = ?`,
    [note || 'Rechazado por el Administrador', orderId]
  );

  log.warn(`[Admin] Orden rechazada: ${orderId} por ${adminUsername}`);
  return { ok: true };
}

// ── Users admin ───────────────────────────────────────────────────────────────
function listUsers(search, page = 1, limit = 30) {
  const offset = (page - 1) * limit;
  let sql = 'SELECT id, username, display_name, wallet, bank, linked, xuid, is_admin, created_at, last_active FROM users';
  const params = [];
  if (search) { sql += ' WHERE username LIKE ? OR display_name LIKE ?'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY wallet DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows  = db.query(sql, params);
  const count = db.get(`SELECT COUNT(*) as c FROM users${search ? ' WHERE username LIKE ? OR display_name LIKE ?' : ''}`, search ? [`%${search}%`, `%${search}%`] : []);
  return { ok: true, users: rows, total: count?.c || 0 };
}

function setWallet(userId, wallet, bank) {
  const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw new NotFound('Usuario no encontrado');

  const updates = [];
  const params  = [];
  if (wallet !== undefined) { updates.push('wallet = ?'); params.push(parseInt(wallet)); }
  if (bank   !== undefined) { updates.push('bank = ?');   params.push(parseInt(bank)); }
  if (!updates.length) throw new BadRequest('Nada que actualizar');

  params.push(userId);
  db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  const updated = db.get('SELECT id, username, wallet, bank FROM users WHERE id = ?', [userId]);
  return { ok: true, user: updated };
}

async function createAdminUser(username, password) {
  const hash = await bcrypt.hash(password, 10);
  const existing = db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (existing) {
    db.run('UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?', [hash, existing.id]);
  } else {
    db.run(
      `INSERT INTO users (username, display_name, password_hash, wallet, bank, linked, is_admin) VALUES (?, ?, ?, 0, 0, 0, 1)`,
      [username, username, hash]
    );
  }
  return { ok: true };
}

// ── Store items CRUD ──────────────────────────────────────────────────────────
function listAllItems(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const items = db.query('SELECT * FROM store_items ORDER BY sort_order ASC, name ASC LIMIT ? OFFSET ?', [limit, offset]);
  const total = db.get('SELECT COUNT(*) as c FROM store_items');
  return { ok: true, items, total: total?.c || 0 };
}

function createItem(data) {
  const { id, name, category, price_coins, price_usdt, description, icon_type, command, give_coins, badge, sort_order } = data;
  if (!id || !name || !category) throw new BadRequest('id, name y category son requeridos');

  db.run(
    `INSERT INTO store_items (id, name, category, price_coins, price_usdt, description, icon_type, command, give_coins, badge, enabled, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, name, category, price_coins||0, price_usdt||0, description||'', icon_type||'gem', command||'', give_coins||0, badge||'', sort_order||0]
  );
  return { ok: true, id };
}

function updateItem(id, data) {
  const item = db.get('SELECT * FROM store_items WHERE id = ?', [id]);
  if (!item) throw new NotFound('Item no encontrado');

  const fields = ['name','category','price_coins','price_usdt','description','icon_type','command','give_coins','badge','enabled','sort_order'];
  const sets   = [];
  const params = [];
  for (const f of fields) {
    if (data[f] !== undefined) { sets.push(`${f} = ?`); params.push(data[f]); }
  }
  if (!sets.length) throw new BadRequest('Nada que actualizar');
  params.push(id);
  db.run(`UPDATE store_items SET ${sets.join(', ')} WHERE id = ?`, params);
  return { ok: true };
}

function deleteItem(id) {
  db.run('UPDATE store_items SET enabled = 0 WHERE id = ?', [id]);
  return { ok: true };
}

// ── Deliveries admin ──────────────────────────────────────────────────────────
function listDeliveries(status = 'PENDING', page = 1, limit = 30) {
  const offset = (page - 1) * limit;
  const rows = db.query(
    `SELECT * FROM deliveries ${status !== 'ALL' ? "WHERE status = ?" : ""} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    status !== 'ALL' ? [status, limit, offset] : [limit, offset]
  );
  return { ok: true, deliveries: rows };
}

// ── Config ────────────────────────────────────────────────────────────────────
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

module.exports = { getStats, listOrders, approveOrder, rejectOrder, listUsers, setWallet, createAdminUser, listAllItems, createItem, updateItem, deleteItem, listDeliveries, getConfig, setConfig };
