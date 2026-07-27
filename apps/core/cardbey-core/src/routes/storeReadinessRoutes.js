/**
 * Store Readiness API routes (V1 + Phase 2 explain + Phase 3 drafts).
 *
 * Mounts:
 *   /api/stores/:storeId/readiness
 *   /api/business-studio/stores/:storeId/readiness
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';
import {
  isStoreReadinessV1Enabled,
  isPilSellerAssistantV1Enabled,
  isStoreReadinessDraftsV1Enabled,
  aggregateStoreReadiness,
  assertStoreOwner,
  toSellerPilContext,
  explainOverallScore,
  explainFinding,
  answerFromSnapshot,
  generateReadinessDraft,
  regenerateReadinessDraft,
  approveReadinessDraft,
  rejectReadinessDraft,
  applyReadinessDraft,
  listReadinessDraftsForStore,
  getReadinessDraft,
} from '../lib/storeReadiness/index.js';

const readinessRateLimit = rateLimitMiddleware({
  endpoint: '/api/stores/:storeId/readiness',
  windowMs: 60_000,
  maxRequests: 60,
  perUser: true,
});

async function requireStoreOwner(req, res, next) {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId required' });
    }
    const prisma = getPrismaClient();
    const ownership = await assertStoreOwner(prisma, storeId, req.userId);
    if (!ownership.ok) {
      if (ownership.reason === 'not_found') {
        return res.status(404).json({ ok: false, error: 'Store not found' });
      }
      if (ownership.reason === 'unauthenticated') {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'You do not own this store',
      });
    }
    req.storeRecord = ownership.business;
    next();
  } catch (err) {
    next(err);
  }
}

function featureGate(req, res, next) {
  if (!isStoreReadinessV1Enabled()) {
    return res.status(404).json({
      ok: false,
      error: 'not_found',
      message: 'Store readiness is not enabled',
    });
  }
  next();
}

function draftsGate(req, res, next) {
  if (!isStoreReadinessDraftsV1Enabled()) {
    return res.status(404).json({
      ok: false,
      error: 'not_found',
      message: 'Store readiness drafts are not enabled',
    });
  }
  next();
}

async function loadSnapshot(req) {
  const storeId = String(req.params.storeId ?? '').trim();
  const draftId = req.query.draftId ? String(req.query.draftId) : null;
  const prisma = getPrismaClient();
  return aggregateStoreReadiness(prisma, storeId, { draftId });
}

async function getReadinessHandler(req, res, next) {
  try {
    const snapshot = await loadSnapshot(req);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const includePil =
      String(req.query.includePilContext || '') === '1' && isPilSellerAssistantV1Enabled();
    const includeDiag = String(req.query.diagnostics || '') === '1';

    return res.json({
      ok: true,
      readiness: includeDiag
        ? snapshot
        : { ...snapshot, diagnostics: undefined },
      ...(includePil ? { sellerPilContext: toSellerPilContext(snapshot) } : {}),
    });
  } catch (err) {
    next(err);
  }
}

async function postRefreshHandler(req, res, next) {
  return getReadinessHandler(req, res, next);
}

/** GET .../explain — overall explanation from snapshot */
async function getExplainHandler(req, res, next) {
  try {
    const snapshot = await loadSnapshot(req);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const findingCode = req.query.findingCode ? String(req.query.findingCode) : null;
    const question = req.query.q ? String(req.query.q) : null;
    const studioMeta = {
      storeName: req.storeRecord?.name || null,
    };

    if (question) {
      return res.json({
        ok: true,
        answer: answerFromSnapshot(snapshot, question, { studioMeta }),
      });
    }
    if (findingCode) {
      return res.json({ ok: true, explanation: explainFinding(snapshot, findingCode) });
    }
    return res.json({ ok: true, explanation: explainOverallScore(snapshot) });
  } catch (err) {
    next(err);
  }
}

async function listDraftsHandler(req, res, next) {
  try {
    const storeId = String(req.params.storeId);
    const drafts = listReadinessDraftsForStore(storeId, req.userId);
    return res.json({ ok: true, drafts });
  } catch (err) {
    next(err);
  }
}

async function createDraftHandler(req, res, next) {
  try {
    const snapshot = await loadSnapshot(req);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const body = req.body || {};
    const draft = generateReadinessDraft({
      snapshot,
      findingCode: body.findingCode || undefined,
      draftType: body.draftType || undefined,
      generatedBy: body.generatedBy || 'seller_assistant',
      studioMeta: {
        storeName: req.storeRecord?.name || body.storeName,
        category: body.category,
      },
    });
    return res.status(201).json({ ok: true, draft });
  } catch (err) {
    next(err);
  }
}

async function regenerateDraftHandler(req, res, next) {
  try {
    const snapshot = await loadSnapshot(req);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const draft = regenerateReadinessDraft(String(req.params.draftId), snapshot, {
      storeName: req.storeRecord?.name,
    });
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'Draft not found' });
    }
    return res.json({ ok: true, draft });
  } catch (err) {
    next(err);
  }
}

async function approveDraftHandler(req, res, next) {
  try {
    const result = approveReadinessDraft(String(req.params.draftId), {
      ownerUserId: req.userId,
      note: req.body?.note,
    });
    if (!result.ok) {
      const status = result.error === 'forbidden' ? 403 : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function rejectDraftHandler(req, res, next) {
  try {
    const result = rejectReadinessDraft(String(req.params.draftId), {
      ownerUserId: req.userId,
      note: req.body?.note,
    });
    if (!result.ok) {
      const status = result.error === 'forbidden' ? 403 : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function applyDraftHandler(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const draftId = String(req.params.draftId);
    const existing = getReadinessDraft(draftId);
    if (existing && existing.storeId !== String(req.params.storeId)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const result = await applyReadinessDraft(prisma, draftId, {
      ownerUserId: req.userId,
      note: req.body?.note,
    });
    if (!result.ok) {
      const status =
        result.error === 'forbidden'
          ? 403
          : result.error === 'not_found'
            ? 404
            : 400;
      return res.status(status).json(result);
    }

    // Refresh snapshot after apply
    const snapshot = await loadSnapshot(req);
    if (snapshot && result.draft) {
      result.draft.readinessScoreAfter = snapshot.overallScore;
    }

    return res.json({
      ok: true,
      draft: result.draft,
      mutation: result.mutation,
      readiness: snapshot,
      ...(isPilSellerAssistantV1Enabled()
        ? { sellerPilContext: toSellerPilContext(snapshot) }
        : {}),
    });
  } catch (err) {
    next(err);
  }
}

export function createStoreReadinessRouter() {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, readinessRateLimit, featureGate, requireStoreOwner);
  router.get('/', getReadinessHandler);
  router.post('/refresh', postRefreshHandler);
  router.get('/explain', getExplainHandler);
  router.get('/drafts', draftsGate, listDraftsHandler);
  router.post('/drafts', draftsGate, createDraftHandler);
  router.post('/drafts/:draftId/regenerate', draftsGate, regenerateDraftHandler);
  router.post('/drafts/:draftId/approve', draftsGate, approveDraftHandler);
  router.post('/drafts/:draftId/reject', draftsGate, rejectDraftHandler);
  router.post('/drafts/:draftId/apply', draftsGate, applyDraftHandler);
  return router;
}

export function createBusinessStudioReadinessRouter() {
  return createStoreReadinessRouter();
}

export default createStoreReadinessRouter;
