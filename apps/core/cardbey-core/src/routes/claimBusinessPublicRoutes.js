/**
 * Public claim preview page (V1.2).
 * GET /claim-business/:seedId
 */

import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { getPublicClaimPreviewBySeedId } from '../lib/businessIngestion/ClaimBridgeService.js';

const router = express.Router();

/** GET /claim-business/:seedId */
router.get('/:seedId', optionalAuth, async (req, res, next) => {
  try {
    const result = await getPublicClaimPreviewBySeedId(req.params.seedId);
    if (!result.ok || !result.preview) {
      return res.status(404).json({ ok: false, error: 'not_found', message: result.message });
    }
    return res.status(200).json({
      ok: true,
      preview: result.preview,
      authenticated: Boolean(req.userId),
      message: result.preview.claimable
        ? 'Sign in to claim ownership of this business.'
        : 'This business is not currently available to claim.',
    });
  } catch (error) {
    console.error('[claim-business] preview error:', error);
    next(error);
  }
});

export default router;
