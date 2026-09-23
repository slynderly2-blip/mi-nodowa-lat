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
// Este endpoint se llama ANTES de ejecutar comandos para prevenir duplicación
function claimDelivery(deliveryId) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');

  const delivery = db.get('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);
  if (!delivery) {
    return { ok: false, error: 'Entrega no encontrada' };
  }
  
  // Si ya fue entregada o está siendo reclamada, rechazar
  if (delivery.status === 'DELIVERED') {
    log.warn(`[Addon] ⚠️ INTENTO DUPLICADO bloqueado: delivery ${deliveryId} ya entregada`);
    return { ok: false, error: 'already_delivered', message: 'Esta entrega ya fue procesada' };
  }

  if (delivery.claiming_started_at) {
    const claimTime = new Date(delivery.claiming_started_at);
    const now = new Date();
    const diffSeconds = (now - claimTime) / 1000;
    
    // Si se inició hace menos de 30 segundos, está en proceso
    if (diffSeconds < 30) {
      log.warn(`[Addon] ⚠️ INTENTO DUPLICADO bloqueado: delivery ${deliveryId} siendo procesada (${diffSeconds}s ago)`);
      return { ok: false, error: 'already_claiming', message: 'Esta entrega ya está siendo procesada' };
    }
  }
  
  // Si no está PENDING, error
  if (delivery.status !== 'PENDING') {
    return { ok: false, error: `Estado inválido: ${delivery.status}` };
  }

  // Generar token único y marcar como "claiming"
  const claimToken = genId('claim');
  
  try {
    const result = db.run(
      `UPDATE deliveries SET claiming_started_at = datetime('now'), claim_token = ?
       WHERE id = ? AND status = 'PENDING' AND claiming_started_at IS NULL`,
      [claimToken, deliveryId]
    );
    
    if (result.changes === 0) {
      log.warn(`[Addon] ⚠️ Race condition detectada en claim de ${deliveryId}`);
      return { ok: false, error: 'race_condition', message: 'Otro proceso está reclamando esta entrega' };
    }

    log.info(`[Addon] 🔒 Delivery ${deliveryId} bloqueada para reclamar con token ${claimToken}`);
    return { 
      ok: true, 
      claimToken,
      command: delivery.command,
      giveCoins: delivery.give_coins || 0
    };
  } catch (err) {
    log.error(`[Addon] Error al reclamar delivery ${deliveryId}: ${err.message}`);
    throw err;
  }
}

// ── POST /api/addon/ack-delivery ─────────────────────────────────────────────
function ackDelivery(deliveryId, claimToken) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');

  // Registrar el intento de ACK
  try {
    db.run(
      `INSERT INTO delivery_acks (delivery_id, status, note) VALUES (?, 'ATTEMPT', 'Intento de confirmación')`,
      [deliveryId]
    );
  } catch (e) {
    log.warn(`[Addon] No se pudo registrar intento de ACK: ${e.message}`);
  }

  const delivery = db.get('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);
  if (!delivery) {
    log.warn(`[Addon] Intento de ACK en entrega inexistente: ${deliveryId}`);
    db.run(`INSERT INTO delivery_acks (delivery_id, status, note) VALUES (?, 'ERROR', 'Entrega no encontrada')`, [deliveryId]);
    return { ok: false, error: 'Entrega no encontrada' };
  }
  
  // Si ya fue entregada, no hacer nada más
  if (delivery.status === 'DELIVERED') {
    log.warn(`[Addon] ⚠️ INTENTO DUPLICADO de ACK en entrega ya procesada: ${deliveryId} para ${delivery.username} - ${delivery.item_title}`);
    db.run(`INSERT INTO delivery_acks (delivery_id, status, note) VALUES (?, 'DUPLICATE', 'Ya estaba entregada')`, [deliveryId]);
    return { ok: true, already: true, message: 'Entrega ya procesada anteriormente' };
  }

  // Verificar token si fue proporcionado (nuevo sistema)
  if (claimToken && delivery.claim_token && delivery.claim_token !== claimToken) {
    log.error(`[Addon] Token inválido para delivery ${deliveryId}`);
    return { ok: false, error: 'Token inválido' };
  }
  
  // Si no está PENDING, error
  if (delivery.status !== 'PENDING') {
    log.error(`[Addon] Intento de ACK en entrega con status inválido: ${deliveryId} status=${delivery.status}`);
    db.run(`INSERT INTO delivery_acks (delivery_id, status, note) VALUES (?, 'ERROR', ?)`, [deliveryId, `Status inválido: ${delivery.status}`]);
    return { ok: false, error: `Estado inválido: ${delivery.status}` };
  }

  log.info(`[Addon] 🎮 Procesando entrega ${deliveryId}: ${delivery.item_title} para ${delivery.username}`);

  // Usar transacción para marcar como entregada
  try {
    db.transaction(() => {
      // Marcar como entregada SOLO si está PENDING
      const result = db.run(
        `UPDATE deliveries SET status = 'DELIVERED', delivered_at = datetime('now') 
         WHERE id = ? AND status = 'PENDING'`,
        [deliveryId]
      );
      
      // Verificar que realmente se actualizó
      if (result.changes === 0) {
        log.error(`[Addon] ❌ No se pudo actualizar entrega ${deliveryId} - posible race condition o ya procesada`);
        db.run(`INSERT INTO delivery_acks (delivery_id, status, note) VALUES (?, 'FAILED', 'No se pudo actualizar (changes=0)')`, [deliveryId]);
        throw new Error('No se pudo procesar la entrega - ya fue procesada');
      }

      // YA NO DAMOS COINS AQUÍ - los coins se dan al comprar (en buyWithNC)
      // Solo ejecutamos comandos de items
      
      // Registrar ACK exitoso
      db.run(`INSERT INTO delivery_acks (delivery_id, status, note) VALUES (?, 'SUCCESS', 'Entregado correctamente')`, [deliveryId]);
    });
  } catch (err) {
    log.error(`[Addon] ❌ Error en transacción de entrega ${deliveryId}: ${err.message}`);
    throw err;
  }

  log.ok(`[Addon] ✅ Entrega ACK exitoso: ${deliveryId} para ${delivery.username}`);
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
