'use strict';
/** src/shared/rateLimit.js */

const rateLimit = require('express-rate-limit');

// Para endpoints del addon (el addon llama cada 60s por jugador)
const addonLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests from addon' },
});

// Para auth (login, register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos, espera unos minutos.' },
});

// General API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Rate limit excedido.' },
});

module.exports = { addonLimiter, authLimiter, apiLimiter };
