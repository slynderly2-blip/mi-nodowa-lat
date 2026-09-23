'use strict';
const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const svc    = require('./admin.service');
const { requireAuth } = require('../auth/auth.middleware');

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Solo admins' });
  next();
}

// ── Multer para QR de Binance ─────────────────────────────────────
const qrStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../../../data/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `binance_qr${ext}`);  // nombre fijo — siempre sobreescribe el anterior
  }
});
const uploadQR = multer({
  storage: qrStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

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

// GET /api/admin/config/payment — público, solo expone datos de pago (QR, Pay ID, billetera)
router.get('/config/payment', (req, res, next) => {
  try {
    const cfg = svc.getConfig().config;
    res.json({
      ok: true,
      binance_pay_id: cfg.binance_pay_id || '',
      binance_wallet: cfg.binance_wallet || 'USDT',
      binance_qr_url: cfg.binance_qr_url || '',
    });
  } catch(e) { next(e); }
});

// POST /api/admin/config/upload-qr  — sube QR de Binance Pay
router.post('/config/upload-qr', requireAuth, requireAdmin, uploadQR.single('qr'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });
    const url = `/data/uploads/${req.file.filename}`;
    svc.setConfig('binance_qr_url', url);
    res.json({ ok: true, url });
  } catch (e) { next(e); }
});

// ── Zona de reclamos ──────────────────────────────────────────────
router.get('/issues',                      requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.listIssues(req.query.status || 'pending', +req.query.page || 1, +req.query.limit || 30)); } catch(e) { next(e); } });
router.post('/issues/:id/requeue',         requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.requeueIssue(req.params.id, req.user.username)); } catch(e) { next(e); } });
router.post('/issues/:id/refund',          requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.refundIssue(req.params.id, req.body.amount, req.user.username)); } catch(e) { next(e); } });
router.post('/issues/:id/ignore',          requireAuth, requireAdmin, (req, res, next) => { try { res.json(svc.ignoreIssue(req.params.id, req.body.note, req.user.username)); } catch(e) { next(e); } });

module.exports = router;
