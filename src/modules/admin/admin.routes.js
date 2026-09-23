'use strict';
const router = require('express').Router();
const svc    = require('./admin.service');
const { requireAuth } = require('../auth/auth.middleware');

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Solo admins' });
  next();
}

router.get('/stats',                  requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.getStats()); } catch(e) { next(e); } });
router.get('/orders',                 requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.listOrders(req.query.status || 'PENDING', +req.query.page || 1, +req.query.limit || 20)); } catch(e) { next(e); } });
router.post('/orders/:id/approve',    requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.approveOrder(req.params.id, req.user.username)); } catch(e) { next(e); } });
router.post('/orders/:id/reject',     requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.rejectOrder(req.params.id, req.body.note, req.user.username)); } catch(e) { next(e); } });
router.get('/users',                  requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.listUsers(req.query.search, +req.query.page || 1, +req.query.limit || 30)); } catch(e) { next(e); } });
router.post('/users/:id/wallet',      requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.setWallet(req.params.id, req.body.wallet, req.body.bank)); } catch(e) { next(e); } });
router.get('/items',                  requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.listAllItems(+req.query.page || 1, +req.query.limit || 50)); } catch(e) { next(e); } });
router.post('/items',                 requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.createItem(req.body)); } catch(e) { next(e); } });
router.patch('/items/:id',            requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.updateItem(req.params.id, req.body)); } catch(e) { next(e); } });
router.delete('/items/:id',           requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.deleteItem(req.params.id)); } catch(e) { next(e); } });
router.get('/deliveries',             requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.listDeliveries(req.query.status || 'PENDING', +req.query.page || 1, +req.query.limit || 30)); } catch(e) { next(e); } });
router.get('/config',                 requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.getConfig()); } catch(e) { next(e); } });
router.post('/config',                requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.setConfig(req.body.key, req.body.value)); } catch(e) { next(e); } });

module.exports = router;
