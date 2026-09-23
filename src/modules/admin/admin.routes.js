'use strict';
/** src/modules/admin/admin.routes.js */

const router = require('express').Router();
const svc    = require('./admin.service');
const { requireAuth } = require('../auth/auth.middleware');

/* Middleware: solo admins */
function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ ok: false, error: 'Acceso restringido a administradores' });
  }
  next();
}

// GET /api/admin/stats
router.get('/stats', requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(svc.getStats()); } catch (e) { next(e); }
});

// GET /api/admin/orders
router.get('/orders', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    res.json(svc.listOrders(status || 'PENDING', parseInt(page || '1'), parseInt(limit || '20')));
  } catch (e) { next(e); }
});

// POST /api/admin/orders/:id/approve
router.post('/orders/:id/approve', requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(svc.approveOrder(req.params.id, req.user.username)); } catch (e) { next(e); }
});

// POST /api/admin/orders/:id/reject
router.post('/orders/:id/reject', requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(svc.rejectOrder(req.params.id, req.body.note, req.user.username)); } catch (e) { next(e); }
});

// GET /api/admin/users
router.get('/users', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    res.json(svc.listUsers(search, parseInt(page || '1'), parseInt(limit || '30')));
  } catch (e) { next(e); }
});

// POST /api/admin/users/:id/wallet
router.post('/users/:id/wallet', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const { wallet, bank } = req.body;
    res.json(svc.setWallet(req.params.id, wallet, bank));
  } catch (e) { next(e); }
});

// GET /api/admin/items
router.get('/items', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const { page, limit } = req.query;
    res.json(svc.listAllItems(parseInt(page || '1'), parseInt(limit || '50')));
  } catch (e) { next(e); }
});

// POST /api/admin/items
router.post('/items', requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(svc.createItem(req.body)); } catch (e) { next(e); }
});

// PATCH /api/admin/items/:id
router.patch('/items/:id', requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(svc.updateItem(req.params.id, req.body)); } catch (e) { next(e); }
});

// DELETE /api/admin/items/:id
router.delete('/items/:id', requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(svc.deleteItem(req.params.id)); } catch (e) { next(e); }
});

// GET /api/admin/deliveries
router.get('/deliveries', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    res.json(svc.listDeliveries(status || 'PENDING', parseInt(page || '1'), parseInt(limit || '30')));
  } catch (e) { next(e); }
});

// GET /api/admin/config
router.get('/config', requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(svc.getConfig()); } catch (e) { next(e); }
});

// POST /api/admin/config
router.post('/config', requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(svc.setConfig(req.body.key, req.body.value)); } catch (e) { next(e); }
});

module.exports = router;
