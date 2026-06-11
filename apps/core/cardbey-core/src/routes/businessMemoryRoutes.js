/**
 * Phase 4 — Business Memory API (read-only recording + summary; no execution).
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  syncBusinessMemorySnapshot,
  recordBusinessDecision,
  recordBusinessAction,
  updateBusinessActionStatus,
  recordBusinessOutcome,
  getBusinessMemorySummary,
  inferBusinessOutcomeType,
} from '../services/businessMemory/businessMemoryService.js';
import { mirrorMissionOutputToSuitcase } from '../services/suitcase/suitcaseMissionOutputBridge.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();

const snapshotSchema = z.object({
  storeId: z.string().min(1),
  ownerId: z.string().min(1),
  capturedAt: z.string().min(1),
  healthScore: z.number(),
  observations: z.array(z.string()).optional(),
});

const opportunitySchema = z.object({
  id: z.string().min(1),
  category: z.string(),
  priority: z.number(),
  severity: z.string(),
  title: z.string(),
  reason: z.string(),
  evidence: z.array(z.string()).optional(),
  recommendedAction: z.record(z.unknown()).optional(),
});

router.post('/sync-snapshot', requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        snapshot: snapshotSchema,
        opportunities: z.array(opportunitySchema).max(20),
      })
      .parse(req.body);
    const ownerId = req.userId;
    const snapshot = { ...body.snapshot, ownerId };
    const result = await syncBusinessMemorySnapshot(snapshot, body.opportunities);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: error.errors });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/decision', requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        opportunityEventId: z.string().min(1),
        decision: z.enum(['prepared', 'dismissed', 'confirmed', 'ignored']),
        source: z.enum(['opportunity_briefing_card', 'performer_intake', 'system']),
      })
      .parse(req.body);
    const row = await recordBusinessDecision({ ...input, ownerId: req.userId });
    res.status(201).json({ ok: true, decisionEventId: row.id, skipped: Boolean(row.skipped) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: error.errors });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/action', requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        opportunityEventId: z.string().min(1),
        decisionEventId: z.string().optional().nullable(),
        missionId: z.string().optional().nullable(),
        actionType: z.string().min(1),
        intent: z.string().min(1),
        status: z.enum(['prepared', 'started', 'completed', 'failed', 'cancelled']),
      })
      .parse(req.body);
    const row = await recordBusinessAction({ ...input, ownerId: req.userId });
    res.status(201).json({ ok: true, actionEventId: row.id, skipped: Boolean(row.skipped) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: error.errors });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.patch('/action/:actionEventId', requireAuth, async (req, res, next) => {
  try {
    const actionEventId = String(req.params.actionEventId ?? '').trim();
    const input = z
      .object({
        missionId: z.string().optional().nullable(),
        status: z.enum(['prepared', 'started', 'completed', 'failed', 'cancelled']),
      })
      .parse(req.body);
    const row = await updateBusinessActionStatus({
      actionEventId,
      missionId: input.missionId ?? undefined,
      status: input.status,
      ownerId: req.userId,
    });
    res.json({ ok: true, actionEventId: row.id, status: row.status, missionId: row.missionId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: error.errors });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/outcome', requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        opportunityEventId: z.string().min(1),
        actionEventId: z.string().min(1),
        missionId: z.string().optional().nullable(),
        outcomeType: z.string().min(1).optional(),
        outcomeJson: z.record(z.unknown()).optional(),
        missionStatus: z.string().optional(),
        actionType: z.string().optional(),
        missionOutputs: z.record(z.unknown()).optional(),
      })
      .parse(req.body);

    const outcomeType =
      (input.outcomeType && String(input.outcomeType).trim()) ||
      inferBusinessOutcomeType({
        actionType: input.actionType,
        missionStatus: input.missionStatus,
        missionOutputs: input.missionOutputs,
      });

    const row = await recordBusinessOutcome({
      opportunityEventId: input.opportunityEventId,
      actionEventId: input.actionEventId,
      missionId: input.missionId ?? undefined,
      outcomeType,
      outcomeJson: input.outcomeJson ?? { missionStatus: input.missionStatus, missionOutputs: input.missionOutputs },
      ownerId: req.userId,
    });

    if (input.missionOutputs && input.missionId && !row.skipped) {
      const prisma = getPrismaClient();
      const actionRow = await prisma.businessActionEvent?.findUnique?.({
        where: { id: input.actionEventId },
        select: { storeId: true },
      });
      void mirrorMissionOutputToSuitcase(
        {
          ownerId: req.userId,
          storeId: actionRow?.storeId ?? null,
          missionId: input.missionId,
          missionOutputs: input.missionOutputs,
          missionStatus: input.missionStatus,
          actionType: input.actionType,
          outcomeEventId: row.id,
        },
        prisma,
      ).catch(() => {});
    }

    res.status(201).json({ ok: true, outcomeEventId: row.id, outcomeType, skipped: Boolean(row.skipped) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: error.errors });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.query.storeId ?? '').trim();
    if (!storeId) return res.status(400).json({ ok: false, error: 'storeId required' });
    const summary = await getBusinessMemorySummary(storeId, req.userId);
    res.json({ ok: true, ...summary });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

export default router;
