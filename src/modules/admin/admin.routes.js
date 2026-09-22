'use strict';
/** src/modules/admin/admin.routes.js */

const router = require('express').Router();
const svc    = require('./admin.service');
const { requireAdmin } = require('../auth/auth.middleware');

// All admin routes require admin role
router.use(requireAdmin);

// Dashboard stats
router.get('/stats', (req, res) => {
  res.json(svc.getStats());
});

// Orders management
router.get('/orders', (req, res) => {
  const { status = 'PENDING', page = 1, limit = 20 } = req.query;
  res.json(svc.listOrders(status, parseInt(page), parseInt(limit)));
});

router.post('/orders/:id/approve', (req, res) => {
  res.json(svc.approveOrder(req.params.id, req.user.username));
});

router.post('/orders/:id/reject', (req, res) => {
  res.json(svc.rejectOrder(req.params.id, req.body.note, req.user.username));
});

// Users management
router.get('/users', (req, res) => {
  const { search, page = 1, limit = 30 } = req.query;
  res.json(svc.listUsers(search, parseInt(page), parseInt(limit)));
});

router.patch('/users/:id/wallet', (req, res) => {
  const { wallet, bank } = req.body;
  res.json(svc.setWallet(req.params.id, wallet, bank));
});

// Store items management
router.get('/items', (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  res.json(svc.listAllItems(parseInt(page), parseInt(limit)));
});

router.post('/items', (req, res) => {
  res.status(201).json(svc.createItem(req.body));
});

router.put('/items/:id', (req, res) => {
  res.json(svc.updateItem(req.params.id, req.body));
});

router.delete('/items/:id', (req, res) => {
  res.json(svc.deleteItem(req.params.id));
});

// Deliveries
router.get('/deliveries', (req, res) => {
  const { status = 'PENDING', page = 1, limit = 30 } = req.query;
  res.json(svc.listDeliveries(status, parseInt(page), parseInt(limit)));
});

// Settings / Config
router.get('/config', (req, res) => {
  res.json(svc.getConfig());
});

router.post('/config', (req, res) => {
  const { key, value } = req.body;
  res.json(svc.setConfig(key, value));
});

module.exports = router;
