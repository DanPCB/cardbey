/**
 * Public Store Routes
 * Mounted at /api/public/store — no authentication.
 * GET /:storeId/draft reuses resolveDraftForStore (same as /api/stores/:storeId/draft).
 * Always returns 200 with ok:true and status (never 404). generationRunId is optional; when missing for storeId "temp", returns 200 with status "not_found".
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { resolveDraftForStore } from '../lib/draftResolver.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/public/store/:storeId/draft?generationRunId=...
 * Public draft by store id (or "temp" + optional generationRunId). No auth.
 * Reuses same underlying draft lookup as /api/stores/:storeId/draft (DRY).
 *
 * Query: generationRunId or gen (optional). When storeId is "temp" and no generationRunId, infer from latest draft if any; else return 200 with status "not_found".
 * Response (200): { ok: true, storeId, generationRunId, status, draftId, draft, store, products, categories }
 * - status: "generating" | "ready" | "not_found" | "failed"
 * - draftId: string ('' when no draft)
 * - products/categories: always arrays
 * Never 404: no draft → 200 with { ok: true, status: "not_found", ... }.
 */
router.get('/:storeId/draft', async (req, res, next) => {
  try {
    const { storeId } = req.params;
    let generationRunId = typeof req.query.generationRunId === 'string' ? req.query.generationRunId : null;
    if (!generationRunId && typeof req.query.gen === 'string') generationRunId = req.query.gen;

    console.log('[PublicStore:draft]', req.method, req.path, 'storeId=', storeId, 'generationRunId=', generationRunId || '(none)');

    if (!storeId || typeof storeId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: 'storeId is required'
      });
    }

    let runId = generationRunId;
    if (storeId === 'temp' && !runId) {
      const latest = await prisma.draftStore.findFirst({
        where: { status: { in: ['draft', 'generating', 'ready', 'error'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      if (latest) {
        const inp = typeof latest.input === 'string' ? JSON.parse(latest.input) : (latest.input || {});
        const prev = typeof latest.preview === 'string' ? JSON.parse(latest.preview) : (latest.preview || {});
        runId = inp.generationRunId || prev?.meta?.generationRunId || null;
      }
      // When still no runId: do not 400. Return 200 with status "not_found" so clients never get 404 and polling does not hard-fail.
    }

    const resolved = await resolveDraftForStore(prisma, storeId, runId);
    const products = Array.isArray(resolved.products) ? resolved.products : [];
    const categories = Array.isArray(resolved.categories) ? resolved.categories : [];
    const status = resolved.status ?? 'not_found';
    const rawPreview = resolved.draft?.preview;
    const preview = rawPreview && typeof rawPreview === 'object'
      ? rawPreview
      : typeof rawPreview === 'string'
        ? (() => { try { return JSON.parse(rawPreview); } catch { return {}; } })()
        : {};
    const body = {
      ok: true,
      storeId: storeId || 'temp',
      generationRunId: resolved.generationRunId ?? runId ?? null,
      status,
      draftId: (resolved.draft?.id != null ? String(resolved.draft.id) : ''),
      draft: resolved.draft ?? null,
      store: resolved.store ?? { id: storeId || 'temp', name: 'Untitled Store', type: 'General' },
      products,
      categories,
      qaReport: preview?.meta?.qaReport ?? null,
    };
    console.log('[PublicStore:draft] responding keys=', Object.keys(body).join(','), 'status=', status);
    return res.status(200).json(body);
  } catch (error) {
    console.error('[PublicStore:draft] Error:', error);
    next(error);
  }
});

export default router;
