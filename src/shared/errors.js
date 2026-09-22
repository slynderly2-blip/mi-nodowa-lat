'use strict';
/** src/shared/errors.js — Clases de error HTTP */

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

class BadRequest  extends AppError { constructor(m) { super(m, 400); } }
class Unauthorized extends AppError { constructor(m = 'No autorizado') { super(m, 401); } }
class Forbidden   extends AppError { constructor(m = 'Acceso denegado') { super(m, 403); } }
class NotFound    extends AppError { constructor(m = 'No encontrado') { super(m, 404); } }
class Conflict    extends AppError { constructor(m) { super(m, 409); } }

function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  const msg    = err.isOperational ? err.message : 'Error interno del servidor';
  if (status >= 500) require('./logger').error(err.message, err.stack);
  res.status(status).json({ ok: false, error: msg });
}

module.exports = { AppError, BadRequest, Unauthorized, Forbidden, NotFound, Conflict, errorHandler };
