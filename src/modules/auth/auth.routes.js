'use strict';
/** src/modules/auth/auth.routes.js */

const router  = require('express').Router();
const svc     = require('./auth.service');
const { requireAuth } = require('./auth.middleware');
const { authLimiter } = require('../../shared/rateLimit');

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    res.json(await svc.register(username, password));
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    res.json(await svc.login(username, password));
  } catch (e) { next(e); }
});

// POST /api/auth/admin-login
router.post('/admin-login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    res.json(await svc.adminLogin(username, password));
  } catch (e) { next(e); }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res, next) => {
  try {
    res.json(svc.me(req.user.username));
  } catch (e) { next(e); }
});

// POST /api/auth/generate-link-code
router.post('/generate-link-code', requireAuth, (req, res, next) => {
  try {
    res.json(svc.generateLinkCode(req.user.username));
  } catch (e) { next(e); }
});

// POST /api/auth/verify-link (llamado desde el addon MC)
router.post('/verify-link', async (req, res, next) => {
  try {
    const { code, player, xuid } = req.body;
    res.json(await svc.verifyLink(String(code || ''), player, xuid));
  } catch (e) { next(e); }
});

module.exports = router;
