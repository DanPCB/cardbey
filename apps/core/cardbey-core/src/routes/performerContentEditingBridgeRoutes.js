/**
 * Performer Content Editing Bridge routes — Phase 2/3.
 * Mounted at /api/performer/content-editing-bridge
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getPrismaClient } from '../lib/prisma.js';
import { isPlatformAdmin } from '../lib/authorization.js';
import {
  assertBridgeEnabled,
  resolveBridgeContext,
  proposeShowImprovement,
  acceptShowImprovement,
  discardShowImprovement,
  hideShowViaBridge,
  listBridgeShowWarnings,
  isPerformerContentEditingBridgeEnabled,
  getBridgeReadiness,
  getBridgeTelemetrySnapshot,
} from '../services/performerContentBridge/performerContentEditingBridge.js';

const router = Router();

const limitPropose = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => `ceb-propose:${req.userId || req.ip}:${req.body?.storeId || ''}`,
  code: 'content_bridge_rate_limited',
  message: 'Too many improvement proposals. Retry after {retryAfter}s.',
});

const limitAccept = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `ceb-accept:${req.userId || req.ip}:${req.body?.storeId || ''}`,
  code: 'content_bridge_rate_limited',
});

const limitHide = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => `ceb-hide:${req.userId || req.ip}:${req.body?.storeId || ''}`,
  code: 'content_bridge_rate_limited',
});

const limitWarnings = rateLimit({
  windowMs: 60_000,
  max: 40,
  keyGenerator: (req) => `ceb-warnings:${req.userId || req.ip}:${req.body?.storeId || ''}`,
  code: 'content_bridge_rate_limited',
});

function sendErr(res, err, next) {
  const status = err?.statusCode || 500;
  if (status < 500) {
    return res.status(status).json({
      ok: false,
      error: err.code || 'bridge_error',
      message: err.message || 'Bridge request failed',
    });
  }
  return next(err);
}

router.get('/status', requireAuth, (req, res) => {
  res.json({
    ok: true,
    enabled: isPerformerContentEditingBridgeEnabled(),
  });
});

router.get('/readiness', requireAuth, async (req, res, next) => {
  try {
    if (!isPlatformAdmin(req.user) && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Admin only in production' });
    }
    const prisma = getPrismaClient();
    const readiness = await getBridgeReadiness(prisma);
    return res.json(readiness);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.use(requireAuth);

router.use((req, res, next) => {
  try {
    assertBridgeEnabled();
    next();
  } catch (err) {
    return sendErr(res, err, next);
  }
});

function actor(req) {
  const adminSupport = req.body?.adminSupport === true || req.query?.adminSupport === '1';
  if (adminSupport && !isPlatformAdmin(req.user)) {
    const err = new Error('Admin support requires platform admin');
    err.statusCode = 403;
    err.code = 'forbidden';
    throw err;
  }
  return {
    userId: req.userId,
    user: req.user,
    adminSupport,
    adminReason: typeof req.body?.adminReason === 'string' ? req.body.adminReason : null,
  };
}

router.post('/resolve', async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const a = actor(req);
    const result = await resolveBridgeContext(prisma, {
      storeId: req.body?.storeId,
      draftId: req.body?.draftId,
      revisionId: req.body?.revisionId,
      generationRunId: req.body?.generationRunId,
      section: req.body?.section || 'shows',
      itemId: req.body?.itemId,
      returnTo: req.body?.returnTo,
      allowInit: req.body?.allowInit !== false,
      ...a,
    });
    return res.json(result);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.post('/warnings', limitWarnings, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const a = actor(req);
    const result = await listBridgeShowWarnings(prisma, {
      storeId: req.body?.storeId,
      draftId: req.body?.draftId,
      revisionId: req.body?.revisionId,
      returnTo: req.body?.returnTo,
      ...a,
    });
    return res.json(result);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.post('/propose', limitPropose, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const a = actor(req);
    const result = await proposeShowImprovement(prisma, {
      storeId: req.body?.storeId,
      draftId: req.body?.draftId,
      revisionId: req.body?.revisionId,
      itemId: req.body?.itemId,
      scope: req.body?.scope,
      selectedFields: req.body?.selectedFields,
      returnTo: req.body?.returnTo,
      ...a,
    });
    return res.json(result);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.post('/accept', limitAccept, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const a = actor(req);
    const result = await acceptShowImprovement(prisma, {
      storeId: req.body?.storeId,
      proposalId: req.body?.proposalId,
      expectedUpdatedAt: req.body?.expectedUpdatedAt,
      expectedFingerprint: req.body?.expectedFingerprint,
      ...a,
    });
    return res.json(result);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.post('/discard', async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const a = actor(req);
    const result = await discardShowImprovement(prisma, {
      storeId: req.body?.storeId,
      proposalId: req.body?.proposalId,
      ...a,
    });
    return res.json(result);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.post('/hide', limitHide, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const a = actor(req);
    const result = await hideShowViaBridge(prisma, {
      storeId: req.body?.storeId,
      draftId: req.body?.draftId,
      revisionId: req.body?.revisionId,
      itemId: req.body?.itemId,
      confirmed: req.body?.confirmed === true,
      returnTo: req.body?.returnTo,
      ...a,
    });
    return res.json(result);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.get('/telemetry', requireAuth, (req, res) => {
  if (!isPlatformAdmin(req.user) && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  return res.json({ ok: true, counters: getBridgeTelemetrySnapshot() });
});

export default router;
