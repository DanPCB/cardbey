/**
 * Observation API — read recent structured execution observations.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import observationBus from '../lib/runtime/observationBus.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();

router.get('/latest', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const observations = await observationBus.getLatest(limit);
    res.json({ ok: true, observations });
  } catch (error) {
    console.error('[observations/latest]', error);
    res.status(500).json({ ok: false, error: 'observations_fetch_failed' });
  }
});

router.get('/missions/:missionId/summary', requireAuth, async (req, res) => {
  try {
    const missionId = String(req.params.missionId ?? '').trim();
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required' });
    }

    const prisma = getPrismaClient();
    let gist = null;
    let keyFacts = [];

    if (prisma?.missionPipeline?.findUnique) {
      const pipeline = await prisma.missionPipeline.findUnique({
        where: { id: missionId },
        select: { metadataJson: true, status: true, type: true },
      });
      const meta =
        pipeline?.metadataJson && typeof pipeline.metadataJson === 'object'
          ? pipeline.metadataJson
          : {};
      if (meta.activeSummary) {
        gist = String(meta.activeSummary);
        keyFacts = Array.isArray(meta.keyFacts) ? meta.keyFacts.map(String) : [];
      }
    }

    if (!gist && prisma?.missionContext?.findUnique) {
      const ctxRow = await prisma.missionContext.findUnique({
        where: { missionId },
        select: { contextJson: true },
      });
      try {
        const parsed = JSON.parse(ctxRow?.contextJson ?? '{}');
        if (parsed?.activeSummary) {
          gist = String(parsed.activeSummary);
          keyFacts = Array.isArray(parsed.keyFacts) ? parsed.keyFacts.map(String) : [];
        }
      } catch {
        /* ignore */
      }
    }

    if (!gist) {
      return res.status(404).json({ ok: false, error: 'summary_not_found' });
    }

    res.json({ ok: true, summary: { gist, keyFacts } });
  } catch (error) {
    console.error('[observations/mission summary]', error);
    res.status(500).json({ ok: false, error: 'summary_fetch_failed' });
  }
});

export default router;
