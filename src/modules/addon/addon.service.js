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

// ── POST /api/addon/claim-delivery ───────────────────────────────────────────
function claimDelivery(deliveryId) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');

  // ATOMICO: Marcar como DELIVERING en una sola operación
  // Si ya fue marcada por otro proceso, changes=0 y bloqueamos
  try {
    const result = db.run(
      `UPDATE deliveries SET status = 'DELIVERING'
       WHERE id = ? AND status = 'PENDING'`,
      [deliveryId]
    );

    if (result.changes === 0) {
      // Ya está DELIVERING o DELIVERED - otro proceso la tomó primero
      const delivery = db.get('SELECT status FROM deliveries WHERE id = ?', [deliveryId]);
      if (!delivery) return { ok: false, error: 'Entrega no encontrada' };
      if (delivery.status === 'DELIVERED') {
        log.warn(`[Addon] ⚠️ BLOQUEADO: delivery ${deliveryId} ya entregada`);
        return { ok: false, error: 'already_delivered' };
      }
      log.warn(`[Addon] ⚠️ BLOQUEADO: delivery ${deliveryId} siendo procesada (status=${delivery.status})`);
      return { ok: false, error: 'already_claiming' };
    }

    log.info(`[Addon] 🔒 Delivery ${deliveryId} tomada para entrega`);
    return { ok: true, claimToken: deliveryId };
  } catch (err) {
    log.error(`[Addon] Error en claim ${deliveryId}: ${err.message}`);
    throw err;
  }
}

// ── POST /api/addon/ack-delivery ─────────────────────────────────────────────
function ackDelivery(deliveryId, claimToken) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');

  const delivery = db.get('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);
  if (!delivery) return { ok: false, error: 'Entrega no encontrada' };
  
  if (delivery.status === 'DELIVERED') {
    log.warn(`[Addon] ⚠️ DUPLICADO BLOQUEADO: ${deliveryId} ya entregada`);
    return { ok: true, already: true };
  }

  // Solo procesar si está en DELIVERING (fue correctamente reclamada antes)
  if (delivery.status !== 'DELIVERING') {
    log.error(`[Addon] ❌ Status inválido para ack: ${deliveryId} = ${delivery.status}`);
    return { ok: false, error: `Status inválido: ${delivery.status}` };
  }

  const result = db.run(
    `UPDATE deliveries SET status = 'DELIVERED', delivered_at = datetime('now')
     WHERE id = ? AND status = 'DELIVERING'`,
    [deliveryId]
  );

  if (result.changes === 0) {
    log.warn(`[Addon] ⚠️ Race condition en ack: ${deliveryId}`);
    return { ok: true, already: true };
  }

  log.ok(`[Addon] ✅ Entregado: ${deliveryId} → ${delivery.username} (${delivery.item_title})`);
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

module.exports = { getBalance, getPendingDeliveries, claimDelivery, ackDelivery, addonTransfer };
