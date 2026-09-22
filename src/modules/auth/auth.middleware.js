'use strict';
/**
 * src/modules/auth/auth.middleware.js
 * Middleware JWT: requireAuth y requireAdmin
 */

const jwt = require('jsonwebtoken');
const cfg = require('../../config');
const { Unauthorized, Forbidden } = require('../../shared/errors');

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new Unauthorized('Token requerido');
    const payload = jwt.verify(token, cfg.jwt.secret);
    req.user = payload;
    next();
  } catch (err) {
    next(new Unauthorized('Token inválido o expirado'));
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!req.user?.isAdmin) return next(new Forbidden('Se requieren permisos de administrador'));
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
