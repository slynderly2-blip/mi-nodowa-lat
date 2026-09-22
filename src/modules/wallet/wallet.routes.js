'use strict';
/** src/modules/wallet/wallet.routes.js */

const router = require('express').Router();
const svc    = require('./wallet.service');
const { requireAuth } = require('../auth/auth.middleware');
const { addonLimiter } = require('../../shared/rateLimit');

// GET /api/wallet/balance
router.get('/balance', requireAuth, (req, res, next) => {
  try { res.json(svc.getBalance(req.user.username)); } catch (e) { next(e); }
});

// GET /api/wallet/transactions
router.get('/transactions', requireAuth, (req, res, next) => {
  try {
    const page  = parseInt(req.query.page  || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    res.json(svc.getTransactions(req.user.username, page, limit));
  } catch (e) { next(e); }
});

// POST /api/wallet/deposit-bank
router.post('/deposit-bank', requireAuth, (req, res, next) => {
  try { res.json(svc.depositBank(req.user.username, req.body.amount)); } catch (e) { next(e); }
});

// POST /api/wallet/withdraw-bank
router.post('/withdraw-bank', requireAuth, (req, res, next) => {
  try { res.json(svc.withdrawBank(req.user.username, req.body.amount)); } catch (e) { next(e); }
});

// POST /api/wallet/transfer (también llamado desde addon)
router.post('/transfer', addonLimiter, (req, res, next) => {
  try {
    const { fromUser, from, toUser, to, amount } = req.body;
    res.json(svc.transfer(fromUser || from, toUser || to, amount));
  } catch (e) { next(e); }
});

module.exports = router;
