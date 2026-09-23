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
// NOTA: Este endpoint requiere que la migración 004 haya sido aplicada
// Si no existe claim_token, el sistema caerá back al modo simple en ack-delivery
function claimDelivery(deliveryId) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');

  const delivery = db.get('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);
  if (!delivery) {
    return { ok: false, error: 'Entrega no encontrada' };
  }
  
  // Si ya fue entregada, rechazar inmediatamente
  if (delivery.status === 'DELIVERED') {
    log.warn(`[Addon] ⚠️ BLOQUEADO: delivery ${deliveryId} ya entregada`);
    return { ok: false, error: 'already_delivered', message: 'Ya entregada' };
  }

  // Si no está PENDING, error
  if (delivery.status !== 'PENDING') {
    return { ok: false, error: `Estado inválido: ${delivery.status}` };
  }

  // Verificar si la columna claim_token existe (migración 004 aplicada)
  try {
    // Intentar marcar con token si la columna existe
    const claimToken = genId('claim');
    const result = db.run(
      `UPDATE deliveries SET claiming_started_at = datetime('now'), claim_token = ?
       WHERE id = ? AND status = 'PENDING'`,
      [claimToken, deliveryId]
    );
    
    if (result.changes === 0) {
      log.warn(`[Addon] ⚠️ Delivery ${deliveryId} ya siendo procesada`);
      return { ok: false, error: 'race_condition' };
    }

    log.info(`[Addon] 🔒 Delivery ${deliveryId} bloqueada con token ${claimToken}`);
    return { ok: true, claimToken };
  } catch (err) {
    // Si la columna no existe, devolver OK sin token (fallback mode)
    if (err.message && err.message.includes('no such column')) {
      log.warn(`[Addon] Migración 004 no aplicada, usando modo simple para ${deliveryId}`);
      return { ok: true, claimToken: null };
    }
    throw err;
  }
}

// ── POST /api/addon/ack-delivery ─────────────────────────────────────────────
function ackDelivery(deliveryId, claimToken) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');

  const delivery = db.get('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);
  if (!delivery) {
    log.warn(`[Addon] Intento de ACK en entrega inexistente: ${deliveryId}`);
    return { ok: false, error: 'Entrega no encontrada' };
  }
  
  // ⚡ PROTECCIÓN CRÍTICA: Si ya fue entregada, devolver OK pero no hacer nada más
  if (delivery.status === 'DELIVERED') {
    log.warn(`[Addon] ⚠️ BLOQUEADO: delivery ${deliveryId} ya procesada - evitando duplicado`);
    return { ok: true, already: true, message: 'Ya procesada' };
  }

  log.info(`[Addon] 🎮 Marcando como entregada: ${deliveryId} (${delivery.item_title})`);

  // Marcar como entregada INMEDIATAMENTE en una sola operación atómica
  try {
    const result = db.run(
      `UPDATE deliveries SET status = 'DELIVERED', delivered_at = datetime('now') 
       WHERE id = ? AND status = 'PENDING'`,
      [deliveryId]
    );
    
    if (result.changes === 0) {
      // Ya fue procesada por otro proceso
      log.warn(`[Addon] ⚠️ Race condition: delivery ${deliveryId} ya no está PENDING`);
      return { ok: true, already: true, message: 'Ya procesada por otro proceso' };
    }

    log.ok(`[Addon] ✅ Delivery ${deliveryId} marcada como DELIVERED exitosamente`);
    return { ok: true };
  } catch (err) {
    log.error(`[Addon] ❌ Error al marcar delivery ${deliveryId}: ${err.message}`);
    throw err;
  }
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
