/**
 * Public Phase 1 activation events. Unauthenticated. No PII. No Meta.
 */

import { Router } from 'express';
import { rateLimit } from '../../middleware/rateLimit.js';
import { recordActivationEvent } from '../../services/activation/activationEvents.js';

const router = Router();

const eventLimit = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'test' ? 10_000 : 60,
  keyGenerator: (req) => `activation-event:${req.ip || 'unknown'}`,
  code: 'rate_limit_exceeded',
  message: 'Too many requests. Please wait and try again.',
});

const ALLOWED = new Set([
  'eventType',
  'capability',
  'source',
  'channel',
  'campaign',
  'content',
  'utmCampaign',
  'utmContent',
  'language',
  'country',
  'variant',
  'entryCapability',
  'anonymousId',
  'path',
]);

function sanitize(body) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const key of Object.keys(body)) {
    if (ALLOWED.has(key)) out[key] = body[key];
  }
  return out;
}

router.post('/events', eventLimit, async (req, res) => {
  try {
    const result = await recordActivationEvent({
      ...sanitize(req.body),
      path: typeof req.body?.path === 'string' ? req.body.path : req.headers.referer || null,
    });
    return res.status(200).json({
      ok: true,
      recorded: result.recorded === true,
      deduped: result.deduped === true,
      skipped: result.skipped === true,
      reason: result.reason || null,
    });
  } catch (err) {
    console.warn('[activationEvent] non-fatal', err?.message || err);
    return res.status(200).json({ ok: true, recorded: false, skipped: true, reason: 'error' });
  }
});

export default router;
