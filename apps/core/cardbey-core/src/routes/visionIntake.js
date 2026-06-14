/**
 * POST /api/vision/intake — unified vision capture intake.
 */

import express from 'express';
import multer from 'multer';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { runVisionIntake } from '../lib/vision/visionIntakeService.js';
import { parseJsonFormField } from '../lib/vision/visionIntakeValidation.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const visionIntakeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) =>
    `vision-intake:${req.user?.id ?? req.guestId ?? req.ip ?? 'unknown'}`,
  message:
    'Vision intake limit reached ({max} per hour). Try again in {retryAfter} seconds.',
  code: 'vision_intake_rate_limit',
});

router.post(
  '/intake',
  requireUserOrGuest,
  visionIntakeRateLimit,
  upload.array('images', 5),
  async (req, res) => {
    try {
      const clientLocation = parseJsonFormField(req.body?.clientLocation);
      const decodedPayload =
        typeof req.body?.decodedPayload === 'string'
          ? req.body.decodedPayload.trim()
          : null;
      const defaultIntentHint =
        typeof req.body?.defaultIntentHint === 'string'
          ? req.body.defaultIntentHint.trim() || null
          : null;
      const storeIdHint =
        typeof req.body?.storeIdHint === 'string' ? req.body.storeIdHint.trim() || null : null;
      const surface =
        typeof req.body?.surface === 'string' ? req.body.surface.trim() : 'unknown';
      const missionId =
        typeof req.body?.missionId === 'string' ? req.body.missionId.trim() || null : null;

      const result = await runVisionIntake({
        userId: req.user?.id ?? req.guestId ?? null,
        surface,
        defaultIntentHint,
        decodedPayload,
        clientLocation,
        storeIdHint,
        missionId,
        files: req.files ?? [],
      });

      if (!result.ok) {
        const err = result.error ?? {};
        return res.status(400).json({
          ok: false,
          code: err.code ?? 'validation_error',
          error: err.message ?? 'Invalid vision intake request.',
        });
      }

      return res.json({
        ok: true,
        event: result.event,
        needsLocation: result.needsLocation === true,
        classification: result.classification,
        route: result.route,
      });
    } catch (err) {
      console.error('[vision/intake]', err?.message ?? err);
      return res.status(500).json({
        ok: false,
        error: 'vision_intake_failed',
        message: err?.message ?? 'Vision intake failed.',
      });
    }
  },
);

export default router;
