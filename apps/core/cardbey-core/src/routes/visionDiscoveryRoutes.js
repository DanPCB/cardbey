/**
 * Vision → Discovery API routes.
 * Vision never creates live stores — only scan events and governed seeds.
 */

import express from 'express';
import multer from 'multer';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { saveVisionUploadFiles } from '../lib/vision/saveVisionUploads.js';
import {
  createVisionScanEventRecord,
  ignoreVisionScanCandidate,
  processVisionEntity,
  promoteVisionScanToDiscovery,
} from '../lib/visionDiscovery/visionDiscoveryService.ts';
import { executeVisionIntentByContextId } from '../lib/visionDiscovery/visionIntentExecutionService.ts';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const visionDiscoveryRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) =>
    `vision-discovery:${req.user?.id ?? req.guestId ?? req.ip ?? 'unknown'}`,
  message: 'Vision discovery limit reached. Try again later.',
  code: 'vision_discovery_rate_limit',
});

/** POST /api/vision/scan-event — persist scan event + user result */
router.post('/scan-event', requireUserOrGuest, visionDiscoveryRateLimit, async (req, res) => {
  try {
    const body = req.body ?? {};
    const result = await createVisionScanEventRecord({
      userId: req.user?.id ?? req.guestId ?? null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      scanType: body.scanType,
      rawPayload: body.rawPayload ?? null,
      imageAssetUrl: body.imageAssetUrl ?? null,
      detectedText: body.detectedText ?? null,
      clientClassification: body.clientClassification ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
    });
    return res.json({ ok: true, event: result.event, userResult: result.userResult });
  } catch (err) {
    console.error('[vision/scan-event]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'scan_event_failed' });
  }
});

/** POST /api/vision/process-entity — extract entity, match Cardbey, optional auto-seed */
router.post(
  '/process-entity',
  requireUserOrGuest,
  visionDiscoveryRateLimit,
  upload.single('image'),
  async (req, res) => {
  try {
    const body = req.body ?? {};
    let imageAssetUrl = typeof body.imageAssetUrl === 'string' ? body.imageAssetUrl : null;
    const file = req.file;
    if (file?.buffer) {
      const paths = saveVisionUploadFiles([file]);
      imageAssetUrl = paths[0] ?? imageAssetUrl;
    }

    const result = await processVisionEntity({
      userId: req.user?.id ?? req.guestId ?? null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      scanType: body.scanType,
      rawPayload: body.rawPayload ?? null,
      detectedUrl: body.detectedUrl ?? null,
      imageAssetUrl,
      detectedText: body.detectedText ?? null,
      imageMetadata: parseJsonField(body.imageMetadata),
      clientClassification: parseJsonField(body.clientClassification),
      latitude: body.latitude != null ? Number(body.latitude) : null,
      longitude: body.longitude != null ? Number(body.longitude) : null,
      autoPromote: body.autoPromote === true || body.autoPromote === 'true',
      imageBuffer: file?.buffer ?? null,
      mimeType: file?.mimetype ?? null,
      tenantKey: req.user?.id ?? req.guestId ?? 'vision',
    });
    return res.json(result);
  } catch (err) {
    console.error('[vision/process-entity]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'process_entity_failed' });
  }
  },
);

/** POST /api/vision/promote-to-discovery — user-initiated candidate creation */
router.post(
  '/promote-to-discovery',
  requireUserOrGuest,
  visionDiscoveryRateLimit,
  async (req, res) => {
    try {
      const scanEventId =
        typeof req.body?.scanEventId === 'string' ? req.body.scanEventId.trim() : '';
      if (!scanEventId) {
        return res.status(400).json({ ok: false, error: 'scanEventId is required' });
      }
      const result = await promoteVisionScanToDiscovery(
        scanEventId,
        req.user?.id ?? req.guestId ?? null,
      );
      if (!result.ok) {
        const status = result.error === 'vision_to_discovery_disabled' ? 503 : 400;
        return res.status(status).json(result);
      }
      return res.json(result);
    } catch (err) {
      console.error('[vision/promote-to-discovery]', err?.message ?? err);
      return res.status(500).json({ ok: false, error: 'promote_failed' });
    }
  },
);

/** POST /api/vision/execute-intent — route selected intent through IntentGraph */
router.post('/execute-intent', requireUserOrGuest, visionDiscoveryRateLimit, async (req, res) => {
  try {
    const body = req.body ?? {};
    const intentId = typeof body.intentId === 'string' ? body.intentId.trim() : '';
    const entityContextId =
      typeof body.entityContextId === 'string' ? body.entityContextId.trim() : '';
    if (!intentId || !entityContextId) {
      return res.status(400).json({ ok: false, error: 'intentId and entityContextId are required' });
    }
    const result = await executeVisionIntentByContextId({
      intentId,
      entityContextId,
      userId: req.user?.id ?? req.guestId ?? null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      confirmed: body.confirmed === true,
      suggestionsShown: Array.isArray(body.suggestionsShown) ? body.suggestionsShown : [],
    });
    if ('error' in result && result.ok === false) {
      return res.status(404).json(result);
    }
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('[vision/execute-intent]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'execute_intent_failed' });
  }
});

export default router;
