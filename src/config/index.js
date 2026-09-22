'use strict';
/**
 * src/config/index.js
 * Configuración centralizada (env vars + defaults)
 */

require('dotenv').config();

module.exports = {
  port:     parseInt(process.env.PORT || '3001', 10),
  nodeEnv:  process.env.NODE_ENV || 'development',
  isProd:   process.env.NODE_ENV === 'production',

  jwt: {
    secret:       process.env.JWT_SECRET || 'nodowa_default_secret_CHANGE_ME',
    expiresIn:    process.env.JWT_EXPIRES_IN    || '7d',
    adminExpires: process.env.ADMIN_JWT_EXPIRES_IN || '8h',
  },

  db: {
    path: process.env.DB_PATH || './data/nodowa.db',
  },

  uploads: {
    dir:   process.env.UPLOADS_DIR   || './uploads',
    maxMb: parseInt(process.env.MAX_UPLOAD_MB || '10', 10),
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },

  rateLimit: {
    addonRpm: parseInt(process.env.RATE_LIMIT_ADDON_RPM || '120', 10),
  },
};
