/**
 * Public activation runway preview + post-activation signals.
 * GET /activate-business/:businessRef
 * POST /activate-business/:businessRef/performer-opened
 */

import express from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  getPublicActivationPreviewBySeedId,
  recordPerformerOpenedAfterActivation,
} from '../lib/businessIngestion/ActivationRunwayService.js';
import { recordActivationReportView } from '../lib/businessIngestion/seedSuitcaseService.js';

const router = express.Router();

/** POST /activate-business/:businessRef/report-viewed */
router.post('/:businessRef/report-viewed', optionalAuth, async (req, res, next) => {
  try {
    const result = await recordActivationReportView(req.params.businessRef);
    if (!result.ok) {
      return res.status(404).json({ ok: false, message: 'No activation report available.' });
    }
    return res.status(200).json({ ok: true, viewCount: result.viewCount });
  } catch (error) {
    console.error('[activate-business] report-viewed error:', error);
    next(error);
  }
});

/** POST /activate-business/:businessRef/performer-opened */
router.post('/:businessRef/performer-opened', requireAuth, async (req, res, next) => {
  try {
    const businessSpaceId =
      typeof req.body?.businessSpaceId === 'string' ? req.body.businessSpaceId.trim() : null;
    const result = await recordPerformerOpenedAfterActivation({
      seedId: req.params.businessRef,
      userId: req.userId,
      businessSpaceId,
    });
    if (!result.ok) {
      return res.status(400).json({ ok: false, message: result.message });
    }
    return res.status(200).json({ ok: true, message: result.message });
  } catch (error) {
    console.error('[activate-business] performer-opened error:', error);
    next(error);
  }
});

/** GET /activate-business/:businessRef */
router.get('/:businessRef', optionalAuth, async (req, res, next) => {
  try {
    const result = await getPublicActivationPreviewBySeedId(req.params.businessRef);
    if (!result.ok || !result.preview) {
      return res.status(404).json({ ok: false, error: 'not_found', message: result.message });
    }
    return res.status(200).json({
      ok: true,
      preview: result.preview,
      authenticated: Boolean(req.userId),
    });
  } catch (error) {
    console.error('[activate-business] preview error:', error);
    next(error);
  }
});

export default router;
