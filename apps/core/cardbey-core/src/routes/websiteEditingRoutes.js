/**
 * Phase 0 Website Editing — owner resolve endpoint.
 * Mounted at /api/stores (before catch-all :storeId routes).
 *
 * GET /api/stores/:storeId/website-editing-context
 * Query: draftId?, revisionId?, generationRunId? (legacy optional)
 *
 * Read-only resolve; may initialise DraftStore revision (create-from-store contract).
 * Never creates Business / never publishes.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { resolveWebsiteEditingContext } from '../services/websiteEditing/resolveWebsiteEditingContext.js';
import { buildDesignPresentationProjection } from '../services/websiteEditing/buildDesignPresentationProjection.js';
import { DESIGN_READINESS } from '../services/websiteEditing/designAdapterContract.js';
import Features from '../config/features.js';

const router = Router();

/**
 * Draft-only resolve (no Business id yet).
 * Must be registered before /:storeId/... so "website-editing" is not treated as a storeId.
 * GET /api/stores/website-editing/by-draft/:draftId
 */
router.get('/website-editing/by-draft/:draftId', requireAuth, async (req, res, next) => {
  try {
    const draftId = String(req.params.draftId ?? '').trim();
    if (!draftId) {
      return res.status(400).json({ ok: false, error: 'draftId_required' });
    }
    const prisma = getPrismaClient();
    const context = await resolveWebsiteEditingContext(prisma, {
      draftId,
      userId: req.userId,
      user: req.user,
      adminSupport: false,
      allowInit: false,
    });
    return res.status(200).json(context);
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({
        ok: false,
        error: err.code || 'resolve_failed',
        message: err.message || 'Could not resolve Website Editing context',
      });
    }
    return next(err);
  }
});

router.get('/:storeId/website-editing-context', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId_required' });
    }
    const draftId =
      typeof req.query.draftId === 'string' && req.query.draftId.trim()
        ? req.query.draftId.trim()
        : null;
    const revisionId =
      typeof req.query.revisionId === 'string' && req.query.revisionId.trim()
        ? req.query.revisionId.trim()
        : null;
    const generationRunId =
      typeof req.query.generationRunId === 'string' && req.query.generationRunId.trim()
        ? req.query.generationRunId.trim()
        : null;

    const prisma = getPrismaClient();
    const context = await resolveWebsiteEditingContext(prisma, {
      storeId: storeId === '_' ? null : storeId,
      draftId,
      revisionId,
      generationRunId,
      userId: req.userId,
      user: req.user,
      adminSupport: false,
      allowInit: true,
    });
    return res.status(200).json(context);
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({
        ok: false,
        error: err.code || 'resolve_failed',
        message: err.message || 'Could not resolve Website Editing context',
      });
    }
    return next(err);
  }
});

/**
 * C1 read-only Design projection.
 * GET /api/stores/:storeId/website-editing/design-projection
 */
router.get('/:storeId/website-editing/design-projection', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId || storeId === '_') {
      return res.status(400).json({ ok: false, error: 'storeId_required' });
    }

    const flagEnabled = Boolean(Features.websiteEditingDesignAdapter?.v1);
    if (!flagEnabled) {
      return res.status(200).json({
        ok: true,
        readiness: DESIGN_READINESS.NOT_ENABLED,
        message: 'Website Editing Design adapter is not enabled.',
        projection: null,
      });
    }

    const draftId =
      typeof req.query.draftId === 'string' && req.query.draftId.trim()
        ? req.query.draftId.trim()
        : null;

    const prisma = getPrismaClient();
    let editingContext = null;
    try {
      editingContext = await resolveWebsiteEditingContext(prisma, {
        storeId,
        draftId,
        userId: req.userId,
        user: req.user,
        adminSupport: false,
        allowInit: false,
      });
    } catch (err) {
      const status = err?.statusCode || 500;
      if (status === 403 || status === 404) {
        return res.status(status).json({
          ok: false,
          error: err.code || 'forbidden',
          message: err.message || 'Not allowed',
          readiness: DESIGN_READINESS.BLOCKED_BY_MISSING_DRAFT,
        });
      }
      if (status !== 500) {
        editingContext = null;
      } else {
        return next(err);
      }
    }

    const business = await prisma.business.findUnique({ where: { id: storeId } });
    if (!business) {
      return res.status(404).json({ ok: false, error: 'store_not_found' });
    }

    const resolvedDraftId = editingContext?.draftId || draftId;
    let draft = null;
    if (resolvedDraftId) {
      draft = await prisma.draftStore.findUnique({ where: { id: resolvedDraftId } }).catch(() => null);
    }

    const body = buildDesignPresentationProjection({
      business,
      draft,
      editingContext,
      flagEnabled: true,
    });
    return res.status(200).json(body);
  } catch (err) {
    return next(err);
  }
});

/**
 * C2 — set draft template/style preset (draft-only).
 * POST /api/stores/:storeId/website-editing/design/template
 */
router.post('/:storeId/website-editing/design/template', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId || storeId === '_') {
      return res.status(400).json({ ok: false, error: 'storeId_required' });
    }
    const { executeSetTemplate } = await import('../services/websiteEditing/designAdapterMutations.js');
    const prisma = getPrismaClient();
    const result = await executeSetTemplate(prisma, {
      storeId,
      userId: req.userId,
      user: req.user,
      draftId: req.body?.draftId || req.query.draftId || null,
      presetId: req.body?.presetId || req.body?.templateId,
      expectedFingerprint: req.body?.expectedFingerprint,
      body: req.body,
      adminSupport: false,
    });
    return res.status(200).json(result);
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({
        ok: false,
        error: err.code || 'set_template_failed',
        message: err.message || 'Could not set template',
        readiness: err.readiness,
        currentFingerprint: err.currentFingerprint,
      });
    }
    return next(err);
  }
});

/**
 * C2 — set draft hero via canonical hero service (draftOnly).
 * POST /api/stores/:storeId/website-editing/design/hero
 */
router.post('/:storeId/website-editing/design/hero', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId || storeId === '_') {
      return res.status(400).json({ ok: false, error: 'storeId_required' });
    }
    const { executeSetHero } = await import('../services/websiteEditing/designAdapterMutations.js');
    const prisma = getPrismaClient();
    const result = await executeSetHero(prisma, {
      storeId,
      userId: req.userId,
      user: req.user,
      draftId: req.body?.draftId || req.query.draftId || null,
      expectedFingerprint: req.body?.expectedFingerprint,
      body: req.body,
      adminSupport: false,
    });
    return res.status(200).json(result);
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({
        ok: false,
        error: err.code || 'set_hero_failed',
        message: err.message || 'Could not set hero',
        readiness: err.readiness,
        currentFingerprint: err.currentFingerprint,
      });
    }
    return next(err);
  }
});

export default router;
