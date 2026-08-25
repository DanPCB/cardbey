/**
 * Public first-party marketing visit ingest.
 * Unauthenticated. Writes only when campaign/UTM/correlation context exists.
 * Live Meta is never triggered here.
 */

import { Router } from 'express';
import { rateLimit } from '../../middleware/rateLimit.js';
import { ingestFirstPartyVisit } from '../../services/marketingOperations/visitCapture.js';

const router = Router();

const visitLimit = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'test' ? 10_000 : 40,
  keyGenerator: (req) => `marketing-visit:${req.ip || 'unknown'}`,
  code: 'rate_limit_exceeded',
  message: 'Too many requests. Please wait and try again.',
});

const ALLOWED = new Set([
  'campaignId',
  'contentId',
  'channel',
  'provider',
  'source',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'anonymousId',
  'visitorKey',
  'correlationId',
  'targetType',
  'cb_attr',
  'path',
  'destination',
  'destinationPath',
  'referrer',
  'marketingAttribution',
]);

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const key of Object.keys(body)) {
    if (ALLOWED.has(key)) out[key] = body[key];
  }
  return out;
}

router.post('/visits', visitLimit, async (req, res) => {
  try {
    req.body = sanitizeBody(req.body);
    const result = await ingestFirstPartyVisit(req);
    return res.status(200).json({
      ok: true,
      skipped: result.visit?.skipped === true || result.skipped === true,
      reason: result.visit?.reason || result.reason || null,
      deduped: result.visit?.deduped === true,
      returned: result.returned?.skipped ? false : result.returned?.ok === true,
      liveMeta: false,
    });
  } catch (err) {
    console.warn('[marketingVisit] non-fatal', err?.message || err);
    return res.status(200).json({ ok: true, skipped: true, reason: 'error', liveMeta: false });
  }
});

export default router;
