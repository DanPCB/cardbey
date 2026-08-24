/**
 * Public claim OTP API — Phase 2 GTM acceptance paths.
 * POST /api/claim/initiate  { seedId, email }
 * POST /api/claim/verify    { seedId, email, code }
 */

import express from 'express';
import { initiateClaimOtp, verifyClaimOtpCode } from '../lib/claim/claimOtpService.js';
import { getSeedRecordById } from '../lib/businessIngestion/IngestionRepository.js';

const router = express.Router();

function statusForCode(code) {
  switch (code) {
    case 'TOO_MANY_ATTEMPTS':
    case 'LOCKED':
      return 429;
    case 'EXPIRED':
    case 'NOT_FOUND':
    case 'INVALID':
      return 400;
    case 'SEND_FAILED':
    case 'UNAVAILABLE':
      return 503;
    default:
      return 400;
  }
}

/** POST /api/claim/initiate */
router.post('/initiate', async (req, res, next) => {
  try {
    const seedId = String(req.body?.seedId ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    if (!seedId || !email) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID',
        message: 'seedId and email are required.',
      });
    }

    let businessName = null;
    try {
      const seed = await getSeedRecordById(seedId);
      businessName = seed?.normalized?.businessName ?? null;
    } catch {
      // Seed lookup is best-effort for email copy; OTP still issued for acceptance tests.
    }

    const result = await initiateClaimOtp({
      seedId,
      email,
      userId: req.userId ?? req.user?.id ?? null,
      businessName,
    });

    if (!result.ok) {
      return res.status(statusForCode(result.code)).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[claim] initiate error:', error);
    next(error);
  }
});

/** POST /api/claim/verify */
router.post('/verify', async (req, res, next) => {
  try {
    const seedId = String(req.body?.seedId ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    const code = String(req.body?.code ?? req.body?.otp ?? '').trim();

    const result = await verifyClaimOtpCode({
      seedId,
      email,
      code,
      userId: req.userId ?? req.user?.id ?? null,
    });

    if (!result.ok) {
      return res.status(statusForCode(result.code)).json(result);
    }

    return res.status(200).json({ valid: true, ok: true, code: 'OK', otpId: result.otpId });
  } catch (error) {
    console.error('[claim] verify error:', error);
    next(error);
  }
});

export default router;
