'use strict';
const router = require('express').Router();
const svc    = require('./deliveries.service');
const { requireAuth } = require('../auth/auth.middleware');

router.get('/', requireAuth, (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    res.json(svc.listDeliveries(req.user.username, status, parseInt(page || '1'), parseInt(limit || '20')));
  } catch (e) { next(e); }
});

module.exports = router;
