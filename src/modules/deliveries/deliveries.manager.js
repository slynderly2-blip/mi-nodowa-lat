'use strict';
/**
 * deliveries.manager.js
 * Módulo central que maneja TODO el ciclo de vida de entregas.
 * Un delivery pasa por: PENDING → EXECUTING → DELIVERED
 * El addon llama /api/addon/execute-delivery que hace TODO en una sola llamada.
 */

const db  = require('../../config/database');
const { genId } = require('../auth/auth.service');
const log = require('../../shared/logger');

/**
 * Crea una delivery nueva. Llamado por store/admin al comprar.
 */
function createDelivery({ username, itemTitle, itemCategory, command, giveCoins, priceCoins, paymentMethod, source }) {
  const id = genId('del');
  db.run(
    `INSERT INTO deliveries (id, username, item_title, item_category, command, give_coins, price_coins, payment_method, source, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [id, username, itemTitle, itemCategory || '', command || '', giveCoins || 0, priceCoins || 0, paymentMethod || '', source || '']
  );
  log.info(`[Deliveries] Creada: ${id} → ${username} (${itemTitle})`);
  return id;
}

/**
 * Lista deliveries pendientes para un jugador.
 */
function getPending(username) {
  if (!username) return [];
  return db.query(
    `SELECT id, item_title, item_category, command, give_coins
     FROM deliveries WHERE username = ? COLLATE NOCASE AND status = 'PENDING'
     ORDER BY created_at ASC`,
    [username]
  );
}

/**
 * Ejecuta una delivery completa en UNA sola operación atómica:
 * 1. Cambia status PENDING → DELIVERED en la misma query
 * 2. Si changes=0 significa ya fue procesada → devuelve null (no ejecutar nada)
 * 3. Si changes=1 devuelve los datos para que el addon ejecute el comando
 *
 * Esto garantiza que NUNCA se ejecute dos veces sin importar cuántas veces llame el addon.
 */
function executeDelivery(deliveryId) {
  if (!deliveryId) return { ok: false, error: 'deliveryId requerido' };

  // Operación atómica: solo funciona si está PENDING
  const result = db.run(
    `UPDATE deliveries
     SET status = 'DELIVERED', delivered_at = datetime('now')
     WHERE id = ? AND status = 'PENDING'`,
    [deliveryId]
  );

  if (result.changes === 0) {
    // Verificar si existe
    const d = db.get('SELECT status, username, item_title FROM deliveries WHERE id = ?', [deliveryId]);
    if (!d) {
      log.warn(`[Deliveries] execute: ${deliveryId} no existe`);
      return { ok: false, error: 'not_found' };
    }
    // Ya fue ejecutada — el addon NO debe ejecutar el comando
    log.warn(`[Deliveries] ⚠️ BLOQUEADO: ${deliveryId} ya procesada (status=${d.status})`);
    return { ok: false, already: true };
  }

  // Obtener datos para que el addon ejecute el comando
  const d = db.get('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);
  log.ok(`[Deliveries] ✅ Ejecutando: ${deliveryId} → ${d.username} (${d.item_title})`);

  // FIX CRÍTICO: acreditar give_coins en la wallet AHORA, dentro de la misma transacción.
  // Antes esto nunca ocurría — el addon recibía giveCoins pero nunca lo aplicaba.
  if (d.give_coins > 0) {
    db.run('UPDATE users SET wallet = wallet + ? WHERE username = ? COLLATE NOCASE', [d.give_coins, d.username]);
    db.run(
      `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, 'SYSTEM', ?, ?, 'DELIVERY_COINS', ?)`,
      [genId('tx'), d.username, d.give_coins, `Entrega: ${d.item_title}`]
    );
    db.run(
      `INSERT INTO messages (id, from_user, to_user, subject, body, ref_id, ref_type) VALUES (?, 'SYSTEM', ?, ?, ?, ?, 'DELIVERY')`,
      [genId('msg'), d.username, `Nodocoins acreditados: ${d.item_title}`, `Se acreditaron ${d.give_coins} NC a tu billetera.`, d.id]
    );
    log.ok(`[Deliveries] 💰 +${d.give_coins} NC acreditados a ${d.username}`);
  }

  return {
    ok: true,
    delivery: {
      id:        d.id,
      username:  d.username,
      command:   d.command || '',
      giveCoins: d.give_coins || 0,
      itemTitle: d.item_title,
    }
  };
}

module.exports = { createDelivery, getPending, executeDelivery };
