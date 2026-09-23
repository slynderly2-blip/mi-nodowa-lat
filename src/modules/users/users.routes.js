'use strict';
/** src/modules/users/users.routes.js */

const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const svc    = require('./users.service');
const { requireAuth } = require('../auth/auth.middleware');

// Configuración de multer para subir avatares
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../../../data/uploads/avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${req.user.username}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (!allowed.test(file.originalname)) {
      return cb(new Error('Solo se permiten archivos de imagen (jpg, jpeg, png, gif, webp)'));
    }
    cb(null, true);
  }
});

// GET /api/users/profile/:username  — público
router.get('/profile/:username', (req, res, next) => {
  try { res.json(svc.getProfile(req.params.username)); } catch (e) { next(e); }
});

// PATCH /api/users/profile  — editar perfil propio
router.patch('/profile', requireAuth, (req, res, next) => {
  try {
    const { display_name, avatar } = req.body;
    res.json(svc.updateProfile(req.user.username, { display_name, avatar }));
  } catch (e) { next(e); }
});

// POST /api/users/profile/upload-avatar  — subir imagen de avatar
router.post('/profile/upload-avatar', requireAuth, upload.single('avatar'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });
    }
    // Construir URL del avatar guardado
    const avatarUrl = `/data/uploads/avatars/${req.file.filename}`;
    // Actualizar el avatar del usuario en la BD
    const result = svc.updateProfile(req.user.username, { avatar: avatarUrl });
    res.json({ ok: true, avatar_url: avatarUrl, user: result });
  } catch (e) { next(e); }
});

// GET /api/users/leaderboard
router.get('/leaderboard', (req, res, next) => {
  try { res.json(svc.getLeaderboard(parseInt(req.query.limit || '20'))); } catch (e) { next(e); }
});

// GET /api/users/search?q=
router.get('/search', (req, res, next) => {
  try { res.json(svc.searchUser(req.query.q || '')); } catch (e) { next(e); }
});

// GET /api/users/inbox
router.get('/inbox', requireAuth, (req, res, next) => {
  try {
    const page  = parseInt(req.query.page  || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    res.json(svc.getInbox(req.user.username, page, limit));
  } catch (e) { next(e); }
});

// GET /api/users/inbox/unread
router.get('/inbox/unread', requireAuth, (req, res, next) => {
  try { res.json(svc.getUnreadCount(req.user.username)); } catch (e) { next(e); }
});

// POST /api/users/inbox/:id/read
router.post('/inbox/:id/read', requireAuth, (req, res, next) => {
  try { res.json(svc.markRead(req.user.username, req.params.id)); } catch (e) { next(e); }
});

// POST /api/users/inbox/read-all
router.post('/inbox/read-all', requireAuth, (req, res, next) => {
  try { res.json(svc.markAllRead(req.user.username)); } catch (e) { next(e); }
});

// POST /api/users/report-issue — usuario reporta un problema genérico (desde buzón)
router.post('/report-issue', requireAuth, (req, res, next) => {
  try {
    const adminSvc = require('../admin/admin.service');
    const { itemTitle, deliveryId, note } = req.body;
    if (!itemTitle) return res.status(400).json({ ok: false, error: 'itemTitle requerido' });
    res.json(adminSvc.createIssue({
      deliveryId: deliveryId || null,
      player:    req.user.username,
      itemTitle,
      command:   '',
      note:      note || 'Problema reportado desde buzón',
    }));
  } catch (e) { next(e); }
});

module.exports = router;
