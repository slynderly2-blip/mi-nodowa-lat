'use strict';
/** src/modules/users/users.routes.js */

const router = require('express').Router();
const svc    = require('./users.service');
const { requireAuth } = require('../auth/auth.middleware');

// GET /api/users/profile/:username  — público
router.get('/profile/:username', (req, res, next) => {
  try { res.json(svc.getProfile(req.params.username)); } catch (e) { next(e); }
});

// PATCH /api/users/profile  — editar perfil propio
router.patch('/profile', requireAuth, (req, res, next) => {
  try {
    const { display_name, avatar } = req.body;
    res.json(svc.updateProfile(req.user.username, { display_name, avatar }));
  } catch (e) { next(e); }
});

// GET /api/users/leaderboard
router.get('/leaderboard', (req, res, next) => {
  try { res.json(svc.getLeaderboard(parseInt(req.query.limit || '20'))); } catch (e) { next(e); }
});

// GET /api/users/search?q=
router.get('/search', (req, res, next) => {
  try { res.json(svc.searchUser(req.query.q || '')); } catch (e) { next(e); }
});

// GET /api/users/inbox
router.get('/inbox', requireAuth, (req, res, next) => {
  try {
    const page  = parseInt(req.query.page  || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    res.json(svc.getInbox(req.user.username, page, limit));
  } catch (e) { next(e); }
});

// GET /api/users/inbox/unread
router.get('/inbox/unread', requireAuth, (req, res, next) => {
  try { res.json(svc.getUnreadCount(req.user.username)); } catch (e) { next(e); }
});

// POST /api/users/inbox/:id/read
router.post('/inbox/:id/read', requireAuth, (req, res, next) => {
  try { res.json(svc.markRead(req.user.username, req.params.id)); } catch (e) { next(e); }
});

// POST /api/users/inbox/read-all
router.post('/inbox/read-all', requireAuth, (req, res, next) => {
  try { res.json(svc.markAllRead(req.user.username)); } catch (e) { next(e); }
});

module.exports = router;
