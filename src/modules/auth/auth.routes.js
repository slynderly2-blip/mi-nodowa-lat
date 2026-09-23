'use strict';
/** src/modules/auth/auth.routes.js */

const router  = require('express').Router();
const svc     = require('./auth.service');
const { requireAuth } = require('./auth.middleware');
const { authLimiter } = require('../../shared/rateLimit');

// POST /api/auth/request-link — flujo principal: nickname → código
// Crea el usuario si no existe, devuelve código de 6 dígitos
router.post('/request-link', authLimiter, async (req, res, next) => {
  try {
    const { username } = req.body;
    res.json(await svc.requestLinkCode(username));
  } catch (e) { next(e); }
});

// GET /api/auth/check-link/:code — polling del frontend para saber si ya usó /link en MC
router.get('/check-link/:code', async (req, res, next) => {
  try {
    res.json(svc.checkLinkStatus(req.params.code));
  } catch (e) { next(e); }
});

// POST /api/auth/verify-link — llamado desde el addon MC con el código
router.post('/verify-link', async (req, res, next) => {
  try {
    const { code, player, xuid } = req.body;
    res.json(await svc.verifyLink(String(code || ''), player, xuid));
  } catch (e) { next(e); }
});

// POST /api/auth/admin-login — login con usuario+contraseña solo para admins
router.post('/admin-login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    res.json(await svc.adminLogin(username, password));
  } catch (e) { next(e); }
});

// POST /api/auth/create-first-admin — SOLO para setup inicial (sin auth)
router.post('/create-first-admin', async (req, res, next) => {
  try {
    const { username, password, secret } = req.body;
    
    // Clave secreta para prevenir abuso
    if (secret !== process.env.JWT_SECRET) {
      return res.status(403).json({ ok: false, error: 'Acceso denegado' });
    }
    
    res.json(await svc.createAdmin(username, password));
  } catch (e) { next(e); }
});

// GET /api/auth/me — info del usuario autenticado
router.get('/me', requireAuth, (req, res, next) => {
  try {
    res.json(svc.me(req.user.username));
  } catch (e) { next(e); }
});

// POST /api/auth/generate-link-code — re-generar código estando autenticado (perfil)
router.post('/generate-link-code', requireAuth, (req, res, next) => {
  try {
    res.json(svc.requestLinkCode(req.user.username));
  } catch (e) { next(e); }
});

// Mantener login/register por compatibilidad con cuentas admin legacy
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    res.json(await svc.register(username, password));
  } catch (e) { next(e); }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    res.json(await svc.login(username, password));
  } catch (e) { next(e); }
});

module.exports = router;
