/**
 * Extended OAuth connect stubs for social platforms beyond Meta/Zalo.
 * Returns redirect guidance when server credentials exist; otherwise 503.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPlatformById, isPlatformEnvConfigured } from '../lib/platforms/platformRegistry.js';

const router = express.Router();

const OAUTH_PLATFORM_IDS = ['twitter', 'linkedin', 'reddit', 'mastodon', 'pinterest'];

function buildConnectHandler(platformId) {
  return (req, res) => {
    const platform = getPlatformById(platformId);
    if (!platform || platform.authType !== 'oauth') {
      return res.status(404).json({ ok: false, error: 'platform_not_found' });
    }

    if (req.user?.role === 'guest') {
      return res.status(403).json({
        ok: false,
        error: 'guest_forbidden',
        message: 'Guest sessions cannot connect external platforms.',
      });
    }

    if (!isPlatformEnvConfigured(platform)) {
      return res.status(503).json({
        ok: false,
        configured: false,
        error: 'oauth_not_configured',
        platform: platformId,
        message: `Set ${platform.requires.join(', ')} on the server to enable ${platform.name} OAuth.`,
      });
    }

    // Provider-specific OAuth URL construction lands in a follow-up; UI can poll status meanwhile.
    return res.status(501).json({
      ok: false,
      configured: true,
      error: 'oauth_flow_pending',
      platform: platformId,
      message: `${platform.name} OAuth redirect is configured on the server. Full consent flow shipping next.`,
      docUrl: platform.docUrl ?? null,
    });
  };
}

for (const id of OAUTH_PLATFORM_IDS) {
  router.get(`/${id}/connect`, requireAuth, buildConnectHandler(id));
}

export default router;
