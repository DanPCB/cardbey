/**
 * Dev-only: Content ingest export. Only when NODE_ENV !== 'production' and ENABLE_CONTENT_INGEST_LOGS=true.
 * GET /api/dev/content-ingest/export?limit=200&sourceType=ocr&goal=build_store_from_menu&before=ISODate
 * Optional: X-Dev-Admin-Token must match DEV_ADMIN_TOKEN env if set.
 * Hard max limit from CONTENT_INGEST_EXPORT_MAX_LIMIT (default 500).
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { shouldCapture } from '../services/contentIngest/captureSample.js';

const router = Router();
const prisma = new PrismaClient();

const EXPORT_MAX_LIMIT = Math.min(1000, Math.max(100, parseInt(process.env.CONTENT_INGEST_EXPORT_MAX_LIMIT, 10) || 500));

function devOnly(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  if (!shouldCapture()) {
    return res.status(403).json({
      ok: false,
      error: 'forbidden',
      message: 'Content ingest export requires ENABLE_CONTENT_INGEST_LOGS=true',
    });
  }
  const token = req.get('X-Dev-Admin-Token');
  const expected = process.env.DEV_ADMIN_TOKEN;
  if (expected != null && String(expected).trim() !== '' && token !== expected) {
    return res.status(403).json({ ok: false, error: 'forbidden', message: 'Invalid or missing X-Dev-Admin-Token' });
  }
  next();
}

/**
 * GET /api/dev/content-ingest/export
 * Query: limit (default 200, max EXPORT_MAX_LIMIT), sourceType, goal, before (ISODate for pagination)
 */
router.get('/content-ingest/export', devOnly, async (req, res, next) => {
  try {
    const requestedLimit = Math.max(1, parseInt(req.query.limit, 10) || 200);
    const limit = Math.min(requestedLimit, EXPORT_MAX_LIMIT);
    const sourceType = req.query.sourceType?.trim() || undefined;
    const goal = req.query.goal?.trim() || undefined;
    const beforeRaw = req.query.before?.trim();
    let beforeDate = null;
    if (beforeRaw) {
      const d = new Date(beforeRaw);
      if (!Number.isNaN(d.getTime())) beforeDate = d;
    }

    const where = {};
    if (sourceType) where.sourceType = sourceType;
    if (goal) where.goal = goal;
    if (beforeDate) where.createdAt = { lt: beforeDate };

    const samples = await prisma.contentIngestSample.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      ok: true,
      count: samples.length,
      samples: samples.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        generationRunId: s.generationRunId,
        jobId: s.jobId,
        draftId: s.draftId,
        sourceType: s.sourceType,
        goal: s.goal,
        mode: s.mode,
        includeImages: s.includeImages,
        templateKey: s.templateKey,
        websiteDomain: s.websiteDomain,
        vertical: s.vertical,
        rawInputSanitized: s.rawInputSanitized,
        ocrTextSanitized: s.ocrTextSanitized,
        outputCatalog: s.outputCatalog,
        meta: s.meta,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
