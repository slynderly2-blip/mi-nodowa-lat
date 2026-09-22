'use strict';
/** src/modules/store/store.routes.js */

const router  = require('express').Router();
const svc     = require('./store.service');
const { requireAuth } = require('../auth/auth.middleware');

// GET /api/store/items
router.get('/items', (req, res, next) => {
  try {
    const { category, search, page, limit } = req.query;
    res.json(svc.listItems(category, search, parseInt(page || '1'), parseInt(limit || '50')));
  } catch (e) { next(e); }
});

// GET /api/store/items/:id
router.get('/items/:id', (req, res, next) => {
  try { res.json(svc.getItem(req.params.id)); } catch (e) { next(e); }
});

// POST /api/store/buy-nc
router.post('/buy-nc', requireAuth, (req, res, next) => {
  try {
    res.json(svc.buyWithNC(req.user.username, req.body.itemId));
  } catch (e) { next(e); }
});

// POST /api/store/submit-order
router.post('/submit-order', requireAuth, (req, res, next) => {
  try {
    const { itemId, txid, receiptImage } = req.body;
    res.json(svc.submitOrder(req.user.username, itemId, txid, receiptImage));
  } catch (e) { next(e); }
});

module.exports = router;
