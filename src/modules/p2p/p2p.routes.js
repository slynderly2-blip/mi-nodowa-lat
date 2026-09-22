'use strict';
/** src/modules/p2p/p2p.routes.js */

const router = require('express').Router();
const svc    = require('./p2p.service');
const { requireAuth } = require('../auth/auth.middleware');

// Public listing browsing
router.get('/listings', (req, res) => {
  const { status = 'ACTIVE', page = 1, limit = 24 } = req.query;
  res.json(svc.listListings(status, parseInt(page), parseInt(limit)));
});

router.get('/listings/:id', (req, res) => {
  res.json(svc.getListing(req.params.id));
});

// Authenticated actions
router.post('/listings', requireAuth, (req, res) => {
  res.status(201).json(svc.createListing(req.user, req.body));
});

router.delete('/listings/:id', requireAuth, (req, res) => {
  res.json(svc.deleteListing(req.params.id, req.user));
});

module.exports = router;
