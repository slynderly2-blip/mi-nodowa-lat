'use strict';
/** src/modules/orders/orders.routes.js */

const router = require('express').Router();
const svc    = require('./orders.service');
const adminSvc = require('../admin/admin.service');
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

// POST /api/orders/:id/report — usuario reporta un problema con su pedido
router.post('/:id/report', requireAuth, (req, res, next) => {
  try {
    const order = svc.getOrder(req.user.username, req.params.id);
    const o = order.order;
    res.json(adminSvc.createIssue({
      deliveryId: null,
      player:    req.user.username,
      itemTitle: o.item_title || o.item_id,
      command:   o.command || '',
      note:      req.body.note || 'Pedido aprobado pero no recibido',
    }));
  } catch (e) { next(e); }
});

module.exports = router;
