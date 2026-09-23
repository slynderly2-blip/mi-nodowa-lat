'use strict';
/** src/modules/users/users.routes.js */

const router = require('express').Router();
const svc    = require('./users.service');
const { requireAuth } = require('../auth/auth.middleware');

router.get('/profile/:username', (req, res, next) => {
  try { res.json(svc.getProfile(req.params.username)); } catch (e) { next(e); }
});

router.get('/leaderboard', (req, res, next) => {
  try { res.json(svc.getLeaderboard(parseInt(req.query.limit || '20'))); } catch (e) { next(e); }
});

router.get('/search', (req, res, next) => {
  try { res.json(svc.searchUser(req.query.q || '')); } catch (e) { next(e); }
});

module.exports = router;
