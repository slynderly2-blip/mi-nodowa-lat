'use strict';
/**
 * src/server.js
 * Entry point — Nodowa Tienda
 */

const path    = require('path');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const cfg            = require('./config');
const { initDB }     = require('./config/database');
const { errorHandler } = require('./shared/errors');
const log            = require('./shared/logger');

// ── Rutas ──────────────────────────────────────────────────────────────────
const authRoutes      = require('./modules/auth/auth.routes');
const storeRoutes     = require('./modules/store/store.routes');
const walletRoutes    = require('./modules/wallet/wallet.routes');
const ordersRoutes    = require('./modules/orders/orders.routes');
const usersRoutes     = require('./modules/users/users.routes');
const adminRoutes     = require('./modules/admin/admin.routes');
const delivRoutes     = require('./modules/deliveries/deliveries.routes');
const addonRoutes     = require('./modules/addon/addon.routes');

async function start() {
  // 1. Inicializar DB
  await initDB();

  const app = express();

  // 2. Middlewares globales
  app.use(helmet({
    contentSecurityPolicy: false, // permite inline scripts del frontend
  }));
  app.use(cors({ origin: cfg.cors.origin }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 3. Logger de requests
  app.use((req, _res, next) => {
    const start = Date.now();
    _res.on('finish', () => log.req(req.method, req.path, _res.statusCode, Date.now() - start));
    next();
  });

  // 4. Archivos estáticos (frontend)
  app.use(express.static(path.join(__dirname, '../public')));

  // 5. API routes
  app.use('/api/auth',       authRoutes);
  app.use('/api/store',      storeRoutes);
  app.use('/api/wallet',     walletRoutes);
  app.use('/api/orders',     ordersRoutes);
  app.use('/api/users',      usersRoutes);
  app.use('/api/admin',      adminRoutes);
  app.use('/api/deliveries', delivRoutes);
  app.use('/api/addon',      addonRoutes);

  // 6. SPA fallback — cualquier ruta desconocida devuelve el index
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // 7. Error handler
  app.use(errorHandler);

  // 8. Arrancar
  app.listen(cfg.port, () => {
    log.ok(`Nodowa Tienda corriendo en http://localhost:${cfg.port}`);
    log.info(`Entorno: ${cfg.nodeEnv}`);
  });
}

start().catch(err => {
  console.error('Error fatal al iniciar:', err);
  process.exit(1);
});
