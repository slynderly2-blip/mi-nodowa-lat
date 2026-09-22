'use strict';
/**
 * src/app.js
 * Configuración de Express, middlewares, rutas modulares y frontend estático
 */

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const cfg     = require('./config');
const { errorHandler } = require('./shared/errors');

const app = express();

// Middlewares de seguridad y parsing
app.use(helmet({
  contentSecurityPolicy: false, // Permitir scripts y estilos del frontend moderno
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: cfg.cors.origin || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos subidos (comprobantes, avatares)
const uploadsDir = path.resolve(cfg.uploads.dir || './uploads');
app.use('/uploads', express.static(uploadsDir));

// Servir frontend web estático (HTML, CSS, JS, imágenes)
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Nodowa Tienda & Economy API', status: 'online', time: new Date() });
});
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'Nodowa Tienda & Economy API', status: 'online', time: new Date() });
});

// ── Rutas de la API ─────────────────────────────────────────────────────────
app.use('/api/auth',       require('./modules/auth/auth.routes'));
app.use('/api/addon',      require('./modules/addon/addon.routes'));
app.use('/api/wallet',     require('./modules/wallet/wallet.routes'));
app.use('/api/store',      require('./modules/store/store.routes'));
app.use('/api/orders',     require('./modules/orders/orders.routes'));
app.use('/api/deliveries', require('./modules/deliveries/deliveries.routes'));
app.use('/api/users',      require('./modules/users/users.routes'));
app.use('/api/admin',      require('./modules/admin/admin.routes'));
app.use('/api/p2p',        require('./modules/p2p/p2p.routes'));
app.use('/api/uploads',    require('./modules/uploads/uploads.routes'));

// Fallback para SPA en cualquier ruta no-API
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Middleware global de manejo de errores
app.use(errorHandler);

module.exports = app;
