'use strict';
/**
 * src/modules/addon/addon.service.js
 * Endpoints del addon de Minecraft. Usa deliveries.manager para todo lo relacionado a entregas.
 */

const db      = require('../../config/database');
const manager = require('../deliveries/deliveries.manager');
const { genId } = require('../auth/auth.service');
const { BadRequest } = require('../../shared/errors');
const log     = require('../../shared/logger');

// GET /api/addon/get-balance
function getBalance(playerName) {
  if (!playerName) return { ok: false, wallet: 0 };
  const user = db.get('SELECT wallet FROM users WHERE username = ? COLLATE NOCASE', [playerName]);
  return { ok: true, wallet: user?.wallet || 0 };
}

// GET /api/addon/pending-deliveries
function getPendingDeliveries(playerName) {
  if (!playerName) return { ok: true, deliveries: [] };
  const rows = manager.getPending(playerName);
  return {
    ok: true,
    deliveries: rows.map(r => ({
      id:          r.id,
      productName: r.item_title,
      product:     r.item_title,
      description: r.item_category ? `Categoría: ${r.item_category}` : '',
      command:     r.command || '',
      commands:    r.command ? [r.command] : [],
      giveCoins:   r.give_coins || 0,
    }))
  };
}

// POST /api/addon/execute-delivery
// Nuevo endpoint único: marca DELIVERED atómicamente y devuelve el comando a ejecutar.
// Si ya fue procesada devuelve ok:false → addon NO ejecuta nada.
function executeDelivery(deliveryId) {
  return manager.executeDelivery(deliveryId);
}

// POST /api/addon/ack-delivery  (legacy — no-op, kept for backwards compat)
function ackDelivery(deliveryId) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');
  log.info(`[Addon] ack (no-op) para ${deliveryId}`);
  return { ok: true };
}

// POST /api/addon/claim-delivery (legacy — no-op)
function claimDelivery(deliveryId) {
  if (!deliveryId) throw new BadRequest('deliveryId requerido');
  return { ok: true };
}

// POST /api/wallet/transfer
function addonTransfer(fromUser, toUser, amount) {
  const amt = parseInt(amount, 10);
  if (!fromUser || !toUser) throw new BadRequest('fromUser y toUser requeridos');
  if (isNaN(amt) || amt <= 0) throw new BadRequest('amount debe ser mayor a 0');
  if (fromUser.toLowerCase() === toUser.toLowerCase()) throw new BadRequest('No puedes enviarte a ti mismo');

  const sender = db.get('SELECT id, wallet, username FROM users WHERE username = ? COLLATE NOCASE', [fromUser]);
  if (!sender) return { ok: false, error: 'Remitente no encontrado' };
  if (sender.wallet < amt) return { ok: false, error: `Saldo insuficiente. Tienes ${sender.wallet} NC.` };

  let recipient = db.get('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE', [toUser]);
  if (!recipient) {
    db.run(`INSERT INTO users (username, display_name, wallet, bank, linked, is_admin) VALUES (?, ?, 0, 0, 0, 0)`, [toUser, toUser]);
    recipient = db.get('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE', [toUser]);
  }

  db.transaction(() => {
    db.run('UPDATE users SET wallet = wallet - ? WHERE id = ?', [amt, sender.id]);
    db.run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [amt, recipient.id]);
    db.run(
      `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, ?, ?, ?, 'TRANSFER', 'Transferencia en juego')`,
      [genId('tx'), sender.username, recipient.username, amt]
    );
  });

  log.ok(`[Addon] Transfer: ${fromUser} → ${toUser} = ${amt} NC`);
  return { ok: true };
}

module.exports = { getBalance, getPendingDeliveries, executeDelivery, claimDelivery, ackDelivery, addonTransfer };
