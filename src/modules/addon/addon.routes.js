'use strict';
/** src/modules/addon/addon.routes.js */

const router = require('express').Router();
const svc    = require('./addon.service');
const { addonLimiter } = require('../../shared/rateLimit');

// GET /api/addon/get-balance?player=<name>
router.get('/get-balance', addonLimiter, (req, res, next) => {
  try {
    res.json(svc.getBalance(req.query.player));
  } catch (e) { next(e); }
});

// GET /api/addon/pending-deliveries?player=<name>
router.get('/pending-deliveries', addonLimiter, (req, res, next) => {
  try {
    res.json(svc.getPendingDeliveries(req.query.player));
  } catch (e) { next(e); }
});

// POST /api/addon/claim-delivery
router.post('/claim-delivery', addonLimiter, (req, res, next) => {
  try {
    res.json(svc.claimDelivery(req.body.deliveryId));
  } catch (e) { next(e); }
});

// POST /api/addon/ack-delivery
router.post('/ack-delivery', addonLimiter, (req, res, next) => {
  try {
    res.json(svc.ackDelivery(req.body.deliveryId, req.body.claimToken));
  } catch (e) { next(e); }
});

module.exports = router;
