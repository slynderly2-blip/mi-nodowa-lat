'use strict';
/** src/modules/auth/auth.routes.js */

const router  = require('express').Router();
const svc     = require('./auth.service');
const { requireAuth } = require('./auth.middleware');
const { authLimiter } = require('../../shared/rateLimit');

// POST /api/auth/start-link (genera código temporal para iniciar sesión con /link en Minecraft)
router.post('/start-link', (req, res, next) => {
  try {
    const { username } = req.body || {};
    res.json(svc.generateLinkCode(username));
  } catch (e) { next(e); }
});

// GET /api/auth/poll-link?code=123456 (la web verifica en tiempo real si el jugador ejecutó /link)
router.get('/poll-link', (req, res, next) => {
  try {
    const { code } = req.query;
    res.json(svc.pollLink(code));
  } catch (e) { next(e); }
});

// POST /api/auth/verify-link (llamado desde el addon MC al escribir /link <codigo>)
router.post('/verify-link', async (req, res, next) => {
  try {
    const { code, player, xuid } = req.body;
    res.json(await svc.verifyLink(String(code || ''), player, xuid));
  } catch (e) { next(e); }
});

// POST /api/auth/admin-login (para el panel admin con ortizuwu20)
router.post('/admin-login', authLimiter, async (req, res, next) => {
  try {
    const { password } = req.body;
    res.json(await svc.adminLogin('admin', password));
  } catch (e) { next(e); }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res, next) => {
  try {
    res.json(svc.me(req.user.username));
  } catch (e) { next(e); }
});

// POST /api/auth/generate-link-code
router.post('/generate-link-code', (req, res, next) => {
  try {
    res.json(svc.generateLinkCode(req.body?.username || null));
  } catch (e) { next(e); }
});

module.exports = router;
