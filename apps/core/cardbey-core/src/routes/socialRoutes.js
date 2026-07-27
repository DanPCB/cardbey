/**
 * Social account connection placeholder routes.
 * POST /api/social/connect/:provider – mock only; returns { connected: true }.
 * No real OAuth integration. Additive only; no impact on auth or mission flow.
 */

import express from 'express';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const ALLOWED_PROVIDERS = ['instagram', 'facebook', 'tiktok'];

/**
 * POST /api/social/connect/:provider
 * Placeholder: returns { connected: true }. No OAuth yet.
 */
router.post('/connect/:provider', optionalAuth, (req, res) => {
  const provider = (req.params.provider || '').toLowerCase();
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider', allowed: ALLOWED_PROVIDERS });
  }
  res.json({ connected: true });
});

export default router;
