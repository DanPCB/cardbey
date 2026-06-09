/**
 * Passive Intent-to-Artifact pipeline routes (Foundation Phase).
 *
 * POST /api/passive-generation/run — advisory pipeline (no auto-publish)
 * POST /api/passive-generation/analyze — structure intent + gaps only (dry run)
 * GET  /api/passive-generation/sources — configured acquisition sources
 */

import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import {
  runPassiveGenerationPipeline,
  structureIntent,
  detectMissingData,
  listSources,
} from '../lib/passiveGeneration/index.js';

const router = express.Router();

/** GET /api/passive-generation/sources */
router.get('/sources', optionalAuth, (_req, res) => {
  return res.status(200).json({
    ok: true,
    sources: listSources({ configuredOnly: false }),
    configured: listSources({ configuredOnly: true }).map((s) => s.sourceId),
  });
});

/** POST /api/passive-generation/analyze — intent + gaps only */
router.post('/analyze', optionalAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const intent = structureIntent({
      text: body.text ?? null,
      urls: body.urls,
      uploads: body.uploads,
      socialHandles: body.socialHandles,
      voiceTranscript: body.voiceTranscript,
      entities: body.entities,
    });
    const gaps = detectMissingData(intent);
    return res.status(200).json({ ok: true, intent, gaps });
  } catch (error) {
    console.error('[passive-generation] analyze error:', error);
    next(error);
  }
});

/** POST /api/passive-generation/run — full advisory pipeline */
router.post('/run', optionalAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const result = await runPassiveGenerationPipeline({
      text: body.text ?? null,
      urls: body.urls,
      uploads: body.uploads,
      discoveryCandidateIds: body.discoveryCandidateIds,
      socialHandles: body.socialHandles,
      voiceTranscript: body.voiceTranscript,
      entities: body.entities,
      dryRun: body.dryRun === true,
      minConfidence: typeof body.minConfidence === 'number' ? body.minConfidence : undefined,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('[passive-generation] run error:', error);
    next(error);
  }
});

export default router;
