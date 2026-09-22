'use strict';
/** src/modules/orders/orders.routes.js */

const router = require('express').Router();
const svc    = require('./orders.service');
const { requireAuth } = require('../auth/auth.middleware');

router.get('/', requireAuth, (req, res, next) => {
  try {
    const { page } = req.query;
    res.json(svc.listOrders(req.user.username, parseInt(page || '1')));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try {
    res.json(svc.getOrder(req.user.username, req.params.id));
  } catch (e) { next(e); }
});

module.exports = router;
