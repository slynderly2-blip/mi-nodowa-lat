'use strict';
/** src/modules/store/store.routes.js */

const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const svc     = require('./store.service');
const { requireAuth } = require('../auth/auth.middleware');

// ── Multer para comprobantes USDT ─────────────────────────────────
const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../../../data/uploads/receipts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Solo imágenes (jpg, jpeg, png, gif, webp)'));
  }
});

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

// POST /api/store/upload-receipt  — sube imagen de comprobante, devuelve la URL
router.post('/upload-receipt', requireAuth, uploadReceipt.single('receipt'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });
    const url = `/data/uploads/receipts/${req.file.filename}`;
    res.json({ ok: true, url });
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
