'use strict';
/** src/modules/p2p/p2p.service.js */

const db = require('../../config/database');
const { genId } = require('../auth/auth.service');
const { BadRequest, NotFound, Forbidden } = require('../../shared/errors');

function listListings(status = 'ACTIVE', page = 1, limit = 24) {
  const offset = (page - 1) * limit;
  const rows = db.query(
    `SELECT * FROM p2p_listings ${status !== 'ALL' ? 'WHERE status = ?' : ''} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    status !== 'ALL' ? [status, limit, offset] : [limit, offset]
  );
  const count = db.get(
    `SELECT COUNT(*) as c FROM p2p_listings ${status !== 'ALL' ? 'WHERE status = ?' : ''}`,
    status !== 'ALL' ? [status] : []
  );
  return { ok: true, listings: rows, total: count?.c || 0 };
}

function getListing(id) {
  const item = db.get('SELECT * FROM p2p_listings WHERE id = ?', [id]);
  if (!item) throw new NotFound('Publicación no encontrada');
  return { ok: true, listing: item };
}

function createListing(user, data) {
  const { title, description, price, quantity = 1, item_type = 'item', whatsapp_full } = data;
  if (!title || !price) throw new BadRequest('Título y precio son requeridos');
  if (price <= 0) throw new BadRequest('El precio debe ser mayor a 0');

  const id = genId('p2p');
  db.run(
    `INSERT INTO p2p_listings (id, seller, title, description, price, quantity, item_type, whatsapp_full, seller_linked, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    [id, user.username, title, description || '', parseInt(price), parseInt(quantity), item_type, whatsapp_full || '', user.linked ? 1 : 0]
  );

  return { ok: true, id };
}

function deleteListing(id, user) {
  const item = db.get('SELECT * FROM p2p_listings WHERE id = ?', [id]);
  if (!item) throw new NotFound('Publicación no encontrada');
  if (item.seller.toLowerCase() !== user.username.toLowerCase() && !user.is_admin) {
    throw new Forbidden('No tienes permiso para eliminar esta publicación');
  }

  db.run('UPDATE p2p_listings SET status = "DELETED" WHERE id = ?', [id]);
  return { ok: true };
}

module.exports = { listListings, getListing, createListing, deleteListing };
