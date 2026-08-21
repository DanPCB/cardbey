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

export default router;
