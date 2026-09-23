'use strict';
/** src/modules/wallet/wallet.service.js */

const db  = require('../../config/database');
const { genId } = require('../auth/auth.service');
const { BadRequest, Forbidden } = require('../../shared/errors');
const log = require('../../shared/logger');

function getBalance(username) {
  const user = db.get('SELECT wallet, bank FROM users WHERE username = ? COLLATE NOCASE', [username]);
  return { ok: true, wallet: user?.wallet || 0, bank: user?.bank || 0 };
}

function getTransactions(username, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const rows = db.query(
    `SELECT * FROM transactions
     WHERE from_user = ? OR to_user = ?
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [username, username, limit, offset]
  );
  const total = db.get(
    'SELECT COUNT(*) as count FROM transactions WHERE from_user = ? OR to_user = ?',
    [username, username]
  );
  return { ok: true, transactions: rows, total: total?.count || 0, page, limit };
}

function depositBank(username, amount) {
  const amt = parseInt(amount, 10);
  if (isNaN(amt) || amt <= 0) throw new BadRequest('Monto inválido');
  const user = db.get('SELECT id, wallet FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new BadRequest('Usuario no encontrado');
  if (user.wallet < amt) throw new BadRequest(`Saldo insuficiente. Tienes ${user.wallet} NC en billetera.`);

  db.transaction(() => {
    db.run('UPDATE users SET wallet = wallet - ?, bank = bank + ? WHERE id = ?', [amt, amt, user.id]);
    db.run(
      `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, ?, 'BANK', ?, 'BANK_DEPOSIT', 'Depósito seguro en cuenta bancaria')`,
      [genId('tx'), username, amt]
    );
  });
  const updated = db.get('SELECT wallet, bank FROM users WHERE id = ?', [user.id]);
  return { ok: true, wallet: updated.wallet, bank: updated.bank };
}

function withdrawBank(username, amount) {
  const amt = parseInt(amount, 10);
  if (isNaN(amt) || amt <= 0) throw new BadRequest('Monto inválido');
  const user = db.get('SELECT id, wallet, bank FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (!user) throw new BadRequest('Usuario no encontrado');
  if (user.bank < amt) throw new BadRequest(`Saldo bancario insuficiente. Tienes ${user.bank} NC en el banco.`);

  db.transaction(() => {
    db.run('UPDATE users SET wallet = wallet + ?, bank = bank - ? WHERE id = ?', [amt, amt, user.id]);
    db.run(
      `INSERT INTO transactions (id, from_user, to_user, amount, type, note) VALUES (?, 'BANK', ?, ?, 'BANK_WITHDRAW', 'Retiro del banco a billetera')`,
      [genId('tx'), username, amt]
    );
  });
  const updated = db.get('SELECT wallet, bank FROM users WHERE id = ?', [user.id]);
  return { ok: true, wallet: updated.wallet, bank: updated.bank };
}

function transfer(fromUser, toUser, amount) {
  return require('../addon/addon.service').addonTransfer(fromUser, toUser, amount);
}

module.exports = { getBalance, getTransactions, depositBank, withdrawBank, transfer };
