'use strict';
/**
 * migrations/002_migrate_json.js
 * Migración de todos los datos desde db.json (595 usuarios, órdenes, entregas, items) a SQLite
 */

const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { initDB, getDB, persistDB } = require('../src/config/database');
const log  = require('../src/shared/logger');

async function migrate() {
  log.info('Iniciando migración desde db.json...');

  const db = await initDB();

  // Buscar archivo db.json
  const candidates = [
    path.join(__dirname, '../backup_extracted/data/db.json'),
    path.join(__dirname, '../data/db.json'),
    path.join(__dirname, '../db.json')
  ];

  let jsonPath = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { jsonPath = c; break; }
  }

  if (!jsonPath) {
    log.warn('No se encontró archivo db.json. Saltando migración de datos antiguos.');
    return;
  }

  log.info(`Leyendo archivo de respaldo: ${jsonPath}`);
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);

  // 1. Migrar Config & Crear Admin
  if (data.config) {
    const c = data.config;
    const adminPass = c.adminPassword || 'ortizuwu20';
    const hash = await bcrypt.hash(adminPass, 10);

    // Asegurar usuario admin
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE');
    existingAdmin.bind(['admin']);
    const hasAdmin = existingAdmin.step();
    existingAdmin.free();

    if (hasAdmin) {
      db.run('UPDATE users SET password_hash = ?, is_admin = 1 WHERE username = "admin" COLLATE NOCASE', [hash]);
    } else {
      db.run(
        `INSERT INTO users (username, display_name, password_hash, wallet, bank, linked, is_admin)
         VALUES ('admin', 'Administrador', ?, 0, 0, 0, 1)`,
        [hash]
      );
    }

    if (c.currencyName) db.run('INSERT OR REPLACE INTO config (key, value) VALUES ("currency_name", ?)', [c.currencyName]);
    if (c.currencySymbol) db.run('INSERT OR REPLACE INTO config (key, value) VALUES ("currency_symbol", ?)', [c.currencySymbol]);
    if (c.binance) {
      if (c.binance.payId) db.run('INSERT OR REPLACE INTO config (key, value) VALUES ("binance_pay_id", ?)', [String(c.binance.payId)]);
      if (c.binance.walletAddress) db.run('INSERT OR REPLACE INTO config (key, value) VALUES ("binance_wallet", ?)', [c.binance.walletAddress]);
      if (c.binance.qrImage) db.run('INSERT OR REPLACE INTO config (key, value) VALUES ("binance_qr", ?)', [c.binance.qrImage]);
      if (c.binance.instruction) db.run('INSERT OR REPLACE INTO config (key, value) VALUES ("binance_instruction", ?)', [c.binance.instruction]);
    }
    log.ok('Configuración y cuenta de administrador migradas.');
  }

  // 2. Migrar Usuarios
  if (data.users && typeof data.users === 'object') {
    const userList = Object.values(data.users);
    log.info(`Migrando ${userList.length} usuarios...`);
    let userCount = 0;

    for (const u of userList) {
      if (!u.username) continue;
      try {
        db.run(
          `INSERT OR IGNORE INTO users (username, display_name, pin, wallet, bank, linked, xuid, avatar, is_admin, created_at, last_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.username,
            u.displayName || u.username,
            u.pin || null,
            parseInt(u.wallet) || 0,
            parseInt(u.bank) || 0,
            u.linked ? 1 : 0,
            u.xuid ? String(u.xuid) : null,
            u.avatarUrl || null,
            u.isAdmin || u.username.toLowerCase() === 'admin' ? 1 : 0,
            u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
            u.lastActive ? new Date(u.lastActive).toISOString() : new Date().toISOString()
          ]
        );
        userCount++;
      } catch (e) {
        // Ignorar duplicados
      }
    }
    log.ok(`Usuarios migrados con éxito: ${userCount}`);
  }

  // 3. Migrar Items de Tienda
  if (Array.isArray(data.storeItems)) {
    log.info(`Migrando ${data.storeItems.length} items de tienda...`);
    let itemCount = 0;
    for (const item of data.storeItems) {
      if (!item.id || !item.name) continue;
      try {
        db.run(
          `INSERT OR REPLACE INTO store_items (id, name, category, price_coins, price_usdt, description, icon_type, command, give_coins, badge, enabled, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            item.id,
            item.name,
            item.category || 'general',
            parseInt(item.priceCoins) || 0,
            parseFloat(item.priceUsdt) || 0.0,
            item.description || '',
            item.iconType || 'gem',
            item.command || '',
            parseInt(item.giveCoins) || 0,
            item.badge || '',
            itemCount
          ]
        );
        itemCount++;
      } catch (e) {
        log.warn(`Error migrando item ${item.id}: ${e.message}`);
      }
    }
    log.ok(`Items de tienda migrados: ${itemCount}`);
  }

  // 4. Migrar Órdenes
  if (Array.isArray(data.orders)) {
    log.info(`Migrando ${data.orders.length} pedidos...`);
    let ordCount = 0;
    for (const o of data.orders) {
      if (!o.id) continue;
      try {
        db.run(
          `INSERT OR IGNORE INTO orders (id, username, item_id, item_title, price_usdt, give_coins, command, txid, receipt_image, status, admin_note, created_at, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            o.id,
            o.username || 'unknown',
            o.itemId || null,
            o.itemTitle || o.productName || 'Producto',
            parseFloat(o.priceUsdt) || 0.0,
            parseInt(o.giveCoins) || 0,
            o.command || '',
            o.txid || '',
            o.receiptImage || '',
            (o.status || 'PENDING').toUpperCase(),
            o.adminNote || '',
            o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
            o.reviewedAt ? new Date(o.reviewedAt).toISOString() : null
          ]
        );
        ordCount++;
      } catch (e) {
        // Ignorar
      }
    }
    log.ok(`Pedidos migrados: ${ordCount}`);
  }

  // 5. Migrar Entregas
  if (Array.isArray(data.deliveries)) {
    log.info(`Migrando ${data.deliveries.length} entregas...`);
    let delCount = 0;
    for (const d of data.deliveries) {
      if (!d.id) continue;
      try {
        db.run(
          `INSERT OR IGNORE INTO deliveries (id, username, item_title, item_category, command, give_coins, price_coins, payment_method, source, status, created_at, delivered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            d.id,
            d.username || 'unknown',
            d.itemTitle || d.productName || 'Item',
            d.itemCategory || 'store',
            d.command || '',
            parseInt(d.giveCoins) || 0,
            parseInt(d.priceCoins) || 0,
            d.paymentMethod || 'Nodocoins',
            d.source || 'STORE',
            (d.status || 'PENDING').toUpperCase(),
            d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
            d.deliveredAt ? new Date(d.deliveredAt).toISOString() : null
          ]
        );
        delCount++;
      } catch (e) {
        // Ignorar
      }
    }
    log.ok(`Entregas migradas: ${delCount}`);
  }

  // 6. Migrar Transacciones
  if (Array.isArray(data.transactions)) {
    log.info(`Migrando ${data.transactions.length} transacciones...`);
    let txCount = 0;
    for (const t of data.transactions) {
      if (!t.id) continue;
      try {
        db.run(
          `INSERT OR IGNORE INTO transactions (id, from_user, to_user, amount, type, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id,
            t.fromUser || t.from || 'SYSTEM',
            t.toUser || t.to || 'SYSTEM',
            parseInt(t.amount) || 0,
            (t.type || 'TRANSFER').toUpperCase(),
            t.note || t.reason || '',
            t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString()
          ]
        );
        txCount++;
      } catch (e) {
        // Ignorar
      }
    }
    log.ok(`Transacciones migradas: ${txCount}`);
  }

  // 7. Migrar P2P si existe
  const p2pList = Array.isArray(data.p2pMarket) ? data.p2pMarket : (Array.isArray(data.ncListings) ? data.ncListings : []);
  if (p2pList.length > 0) {
    log.info(`Migrando ${p2pList.length} publicaciones P2P...`);
    for (const p of p2pList) {
      if (!p.id) continue;
      try {
        db.run(
          `INSERT OR IGNORE INTO p2p_listings (id, seller, title, description, price, quantity, item_type, whatsapp_full, seller_linked, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.seller || p.username || 'unknown',
            p.title || 'Oferta',
            p.description || '',
            parseInt(p.price) || 0,
            parseInt(p.quantity) || 1,
            p.itemType || 'item',
            p.whatsappFull || p.whatsapp || '',
            p.sellerLinked ? 1 : 0,
            p.status || 'ACTIVE',
            p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString()
          ]
        );
      } catch (e) {}
    }
  }

  // Guardar en disco
  persistDB();
  log.ok('¡Migración completada exitosamente! Base de datos persistida.');
}

if (require.main === module) {
  migrate().catch(e => {
    log.error('Error durante la migración:', e);
    process.exit(1);
  });
}

module.exports = migrate;
