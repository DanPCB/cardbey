/**
 * Public content interaction metrics — no auth required.
 * GET/POST /api/public/content-interactions/:contentType/:contentId
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import {
  addContentClap,
  getContentInteractionSummary,
  recordContentShare,
  recordContentView,
  toggleContentLove,
} from '../services/contentInteractionService.js';

const router = Router();

function viewerKeyFromReq(req) {
  const header = req.get('x-cardbey-viewer-key');
  if (header && String(header).trim()) return String(header).trim().slice(0, 128);
  const bodyKey = req.body?.viewerKey;
  if (bodyKey && String(bodyKey).trim()) return String(bodyKey).trim().slice(0, 128);
  return 'anonymous';
}

function metaFromReq(req) {
  const q = req.query ?? {};
  const b = req.body ?? {};
  return {
    storeId: b.storeId ?? q.storeId ?? null,
    artifactId: b.artifactId ?? q.artifactId ?? null,
  };
}

router.get('/:contentType/:contentId', async (req, res, next) => {
  try {
    const summary = await getContentInteractionSummary(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) {
      return res.status(400).json({ ok: false, error: 'invalid_content' });
    }
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:contentType/:contentId/view', async (req, res, next) => {
  try {
    const summary = await recordContentView(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) return res.status(400).json({ ok: false, error: 'invalid_content' });
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:contentType/:contentId/love', async (req, res, next) => {
  try {
    const summary = await toggleContentLove(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) return res.status(400).json({ ok: false, error: 'invalid_content' });
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:contentType/:contentId/clap', async (req, res, next) => {
  try {
    const summary = await addContentClap(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) return res.status(400).json({ ok: false, error: 'invalid_content' });
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:contentType/:contentId/share', async (req, res, next) => {
  try {
    const summary = await recordContentShare(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) return res.status(400).json({ ok: false, error: 'invalid_content' });
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

export default router;
