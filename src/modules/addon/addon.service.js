'use strict';
/**
 * src/modules/addon/addon.service.js
 * Endpoints consumidos directamente por el addon de Minecraft Bedrock.
 * Estos son los más críticos — deben ser rápidos y sin auth.
 */

const db  = require('../../config/database');
const { genId } = require('../auth/auth.service');
const { BadRequest } = require('../../shared/errors');
const log = require('../../shared/logger');

// ── GET /api/addon/get-balance ────────────────────────────────────────────────
function getBalance(playerName) {
  if (!playerName) return { ok: false, wallet: 0 };
  const user = db.get(
    'SELECT wallet FROM users WHERE username = ? COLLATE NOCASE',
    [playerName]
  );
  return { ok: true, wallet: user ? (user.wallet || 0) : 0 };
}

// ── GET /api/addon/pending-deliveries ─────────────────────────────────────────
function getPendingDeliveries(playerName) {
  if (!playerName) return { ok: true, deliveries: [] };

  const rows = db.query(
    `SELECT id, item_title, item_category, command, give_coins
     FROM deliveries
     WHERE username = ? COLLATE NOCASE AND status = 'PENDING'
     ORDER BY created_at ASC`,
    [playerName]
  );

  const deliveries = rows.map(r => ({
    id:          r.id,
    productName: r.item_title,
    product:     r.item_title,
    description: r.item_category ? `Categoría: ${r.item_category}` : '',
    command:     r.command || '',
    commands:    r.command ? [r.command] : [],
    giveCoins:   r.give_coins || 0,
  }));

  return { ok: true, deliveries };
}

// ── POST /api/addon/ack-delivery ─────────────────────────────────────────────
function ackDelivery(deliveryId) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');

  const delivery = db.get('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);
  if (!delivery) return { ok: false, error: 'Entrega no encontrada' };
  
  // Si ya fue entregada, no hacer nada más
  if (delivery.status === 'DELIVERED') {
    log.info(`[Addon] Entrega ${deliveryId} ya procesada - ignorando duplicado`);
    return { ok: true, already: true };
  }

  // Usar transacción para evitar condiciones de carrera (entregas duplicadas)
  db.transaction(() => {
    // Marcar como entregada
    db.run(
      `UPDATE deliveries SET status = 'DELIVERED', delivered_at = datetime('now') WHERE id = ? AND status = 'PENDING'`,
      [deliveryId]
    );

    // Si la entrega da coins, actualizar wallet
    if (delivery.give_coins > 0) {
      db.run(
        `UPDATE users SET wallet = wallet + ? WHERE username = ? COLLATE NOCASE`,
        [delivery.give_coins, delivery.username]
      );
      db.run(
        `INSERT INTO transactions (id, from_user, to_user, amount, type, note)
         VALUES (?, 'SYSTEM', ?, ?, 'DELIVERY', ?)`,
        [genId('tx'), delivery.username, delivery.give_coins, `Entrega: ${delivery.item_title}`]
      );
    }
  });

  log.ok(`[Addon] Entrega ACK: ${deliveryId} para ${delivery.username}`);
  return { ok: true };
}

// ── POST /api/wallet/transfer (addon) ─────────────────────────────────────────
function addonTransfer(fromUser, toUser, amount) {
  const from = fromUser || '';
  const to   = toUser   || '';
  const amt  = parseInt(amount, 10);

  if (!from || !to) throw new BadRequest('fromUser y toUser requeridos');
  if (isNaN(amt) || amt <= 0) throw new BadRequest('amount debe ser mayor a 0');
  if (from.toLowerCase() === to.toLowerCase()) throw new BadRequest('No puedes enviarte a ti mismo');

  const sender = db.get('SELECT id, wallet, username FROM users WHERE username = ? COLLATE NOCASE', [from]);
  if (!sender) return { ok: false, error: 'Usuario remitente no encontrado' };
  if (sender.wallet < amt) return { ok: false, error: `Saldo insuficiente. Tienes ${sender.wallet} NC.` };

  // Crear o auto-crear destinatario (jugadores que no tienen cuenta web aún)
  let recipient = db.get('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE', [to]);
  if (!recipient) {
    db.run(
      `INSERT INTO users (username, display_name, wallet, bank, linked, is_admin) VALUES (?, ?, 0, 0, 0, 0)`,
      [to, to]
    );
    recipient = db.get('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE', [to]);
  }

  const txId = genId('tx');
  db.transaction(() => {
    db.run('UPDATE users SET wallet = wallet - ? WHERE id = ?', [amt, sender.id]);
    db.run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [amt, recipient.id]);
    db.run(
      `INSERT INTO transactions (id, from_user, to_user, amount, type, note)
       VALUES (?, ?, ?, ?, 'TRANSFER', 'Transferencia en juego')`,
      [txId, sender.username, recipient.username, amt]
    );
  });

  log.ok(`[Addon] Transfer: ${from} → ${to} = ${amt} NC`);
  return { ok: true };
}

module.exports = { getBalance, getPendingDeliveries, ackDelivery, addonTransfer };
