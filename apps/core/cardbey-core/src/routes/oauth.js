/**
 * OAuth Status Routes
 * Provides safe status endpoint that doesn't error when OAuth isn't configured
 */

import express from 'express';
import { getProviderStatuses } from '../auth/providers.js';

const router = express.Router();

/**
 * GET /api/oauth/status
 * Returns OAuth provider status (safe - never errors)
 */
router.get('/status', (req, res) => {
  // Check if OAuth is configured (from environment variables)
  const hasOAuthBase = Boolean(process.env.OAUTH_BASE_URL);
  const hasFacebookCreds = Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  const hasTikTokCreds = Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  
  const configured = hasOAuthBase || hasFacebookCreds || hasTikTokCreds;
  
  res.json({
    ok: configured,
    providers: {
      facebook: {
        configured: hasFacebookCreds,
        connected: false // Would check actual connection state here
      },
      tiktok: {
        configured: hasTikTokCreds,
        connected: false // Would check actual connection state here
      },
    },
    reason: configured ? null : 'not_configured',
    message: configured ? 'OAuth providers available' : 'OAuth not configured (optional for development)'
  });
});

/**
 * GET /api/oauth/providers
 * List OAuth providers with detailed status (ok, missing env vars)
 * Returns 200 always; ok is per-provider
 */
router.get('/providers', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  
  const providers = getProviderStatuses();
  
  res.json({
    providers,
  });
});

export default router;

