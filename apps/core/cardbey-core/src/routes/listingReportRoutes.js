/**
 * Listing report routes — ACCC compliance consumer reporting by public slug.
 */

import express from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { getPrismaClient } from '../lib/prisma.js';
import { submitGhostStoreReport } from '../lib/ghostStore/ghostStoreService.js';

const router = express.Router();

const VALID_PUBLIC_REASONS = [
  'incorrect_information',
  'not_a_real_business',
  'impersonation',
  'wrong_business',
  'other',
  'inaccurate',
  'not_my_business',
  'offensive',
];

const REASON_MAP = Object.freeze({
  incorrect_information: 'inaccurate',
  not_a_real_business: 'inaccurate',
  impersonation: 'not_my_business',
  wrong_business: 'not_my_business',
  other: 'other',
  inaccurate: 'inaccurate',
  not_my_business: 'not_my_business',
  offensive: 'offensive',
});

const reportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `listing-report:${req.ip ?? 'unknown'}`,
  code: 'listing_report_rate_limit',
});

/**
 * POST /api/public/listings/:slug/report
 * Body: { reason, details?, reporterName?, reporterEmail? }
 */
router.post('/listings/:slug/report', reportRateLimit, async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const { reason, details, reporterName, reporterEmail } = req.body ?? {};

    if (!reason || !VALID_PUBLIC_REASONS.includes(String(reason))) {
      return res.status(400).json({
        ok: false,
        error: 'Valid reason required',
        validReasons: VALID_PUBLIC_REASONS.slice(0, 5),
      });
    }

    const prisma = getPrismaClient();
    const store = await prisma.business.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });

    if (!store) {
      return res.status(404).json({ ok: false, error: 'Listing not found' });
    }

    const mappedReason = REASON_MAP[String(reason)] ?? 'other';
    const detailParts = [
      typeof details === 'string' && details.trim() ? details.trim() : null,
      reporterName ? `Reporter: ${String(reporterName).trim()}` : null,
      reporterEmail ? `Email: ${String(reporterEmail).trim()}` : null,
    ].filter(Boolean);

    const result = await submitGhostStoreReport(store.id, {
      reason: mappedReason,
      detail: detailParts.length ? detailParts.join('\n') : null,
    });

    if (!result.ok) {
      return res.status(result.code === 'validation_error' ? 400 : 404).json(result);
    }

    return res.json({
      ok: true,
      message: 'Report received. Our team will review this listing.',
    });
  } catch (err) {
    console.error('[ListingReport] Error:', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'Failed to submit report' });
  }
});

export default router;
