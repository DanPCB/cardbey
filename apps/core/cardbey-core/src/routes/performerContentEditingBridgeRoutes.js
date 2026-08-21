/**
 * Performer Content Editing Bridge routes — Phase 2.
 * Mounted at /api/performer/content-editing-bridge
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
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
} from '../services/performerContentBridge/performerContentEditingBridge.js';

const router = Router();

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

router.post('/warnings', async (req, res, next) => {
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

router.post('/propose', async (req, res, next) => {
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

router.post('/accept', async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const a = actor(req);
    const result = await acceptShowImprovement(prisma, {
      storeId: req.body?.storeId,
      proposalId: req.body?.proposalId,
      expectedUpdatedAt: req.body?.expectedUpdatedAt,
      ...a,
    });
    return res.json(result);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.post('/discard', async (req, res, next) => {
  try {
    const a = actor(req);
    const result = await discardShowImprovement({
      proposalId: req.body?.proposalId,
      ...a,
    });
    return res.json(result);
  } catch (err) {
    return sendErr(res, err, next);
  }
});

router.post('/hide', async (req, res, next) => {
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

export default router;
