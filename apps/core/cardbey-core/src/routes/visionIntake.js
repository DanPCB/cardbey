/**
 * POST /api/vision/intake — unified vision capture intake.
 */

import express from 'express';
import multer from 'multer';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { runVisionIntake } from '../lib/vision/visionIntakeService.js';
import { parseJsonFormField } from '../lib/vision/visionIntakeValidation.js';
import { runCardScanPipeline } from '../lib/vision/cardScanPipeline.js';
import { createFromScan } from '../services/vision/productCreator.js';

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

/**
 * POST /api/vision/scan — OCR + entity extraction preview (confirmation required before create).
 */
router.post(
  '/scan',
  requireUserOrGuest,
  visionIntakeRateLimit,
  upload.single('image'),
  async (req, res) => {
    try {
      const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : '';
      const scanType = typeof req.body?.scanType === 'string' ? req.body.scanType.trim() : 'business_card';
      const file = req.file;

      if (!file?.buffer) {
        return res.status(400).json({
          ok: false,
          error: 'NO_IMAGE',
          message: 'Please provide an image to scan.',
        });
      }

      const result = await runCardScanPipeline({
        buffer: file.buffer,
        mimeType: file.mimetype || 'image/jpeg',
        scanType,
        tenantKey: storeId || req.user?.id || req.guestId || 'default',
      });

      if (!result.ok) {
        const err = result.error ?? {};
        const status = err.code === 'LOW_CONFIDENCE' ? 400 : 400;
        return res.status(status).json({
          ok: false,
          error: err.code ?? 'SCAN_FAILED',
          message: err.message ?? 'Failed to process image.',
          confidence: result.confidence,
          ocrText: result.ocrText,
        });
      }

      return res.json({
        ok: true,
        storeId: storeId || null,
        ocrText: result.ocrText,
        confidence: result.confidence,
        provider: result.provider,
        extractedData: result.extractedData,
        preview: result.preview,
      });
    } catch (err) {
      console.error('[vision/scan]', err?.message ?? err);
      return res.status(500).json({
        ok: false,
        error: 'SCAN_FAILED',
        message: err?.message ?? 'Failed to process image.',
      });
    }
  },
);

/**
 * POST /api/vision/scan/confirm — create product after user confirmation.
 */
router.post('/scan/confirm', requireUserOrGuest, async (req, res) => {
  try {
    const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : '';
    const extractedData = req.body?.extractedData;
    const confirmed = req.body?.confirmed === true;

    if (!confirmed) {
      return res.status(400).json({
        ok: false,
        error: 'CONFIRMATION_REQUIRED',
        message: 'Please confirm the extracted data before creating.',
      });
    }

    if (!storeId) {
      return res.status(400).json({
        ok: false,
        error: 'STORE_REQUIRED',
        message: 'Store is required.',
      });
    }

    const userId = req.user?.id ?? null;
    const result = await createFromScan(storeId, extractedData, userId);

    if (!result.ok) {
      const status =
        result.error === 'STORE_NOT_FOUND' || result.error === 'AUTH_REQUIRED' ? 403 : 400;
      return res.status(status).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[vision/scan/confirm]', err?.message ?? err);
    return res.status(500).json({
      ok: false,
      error: 'CONFIRM_FAILED',
      message: err?.message ?? 'Failed to create product.',
    });
  }
});

export default router;
