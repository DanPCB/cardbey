/**
 * Intent Graph v1 API: build graph for a draft, fetch suggestions for store/draft.
 * All writes audited via graphWriterService; state-machine-centric.
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { buildIntentGraphForDraft } from '../services/intentGraph/graphWriterService.js';

const router = Router();

/**
 * POST /api/intent-graph/build
 * Body: { draftId } or query: ?draftId=
 * Builds intent graph for the given draft (idempotent). Does not block store creation.
 */
router.post('/build', optionalAuth, async (req, res) => {
  try {
    const draftId = (req.body?.draftId || req.query?.draftId || '').toString().trim();
    if (!draftId) {
      return res.status(400).json({ ok: false, error: 'draftId required' });
    }
    const result = await buildIntentGraphForDraft(draftId, {
      actorType: req.userId ? 'human' : 'automation',
      correlationId: req.headers['x-correlation-id'] || null,
    });
    if (!result.ok) {
      const status = result.error === 'Draft not found' ? 404 : result.error === 'Draft preview missing' ? 422 : 500;
      return res.status(status).json({ ok: false, error: result.error });
    }
    return res.json({
      ok: true,
      intentCount: result.intentCount,
      matchCount: result.matchCount,
      suggestionCount: result.suggestionCount,
    });
  } catch (err) {
    console.error('[IntentGraph] POST /build error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Build failed' });
  }
});

/**
 * GET /api/intent-graph/suggestions?draftId= or ?storeId=
 * Returns top action suggestions for the given draft or store (for UI panel).
 * Cooldown: only returns suggestions where cooldownUntil is null or in the past.
 *
 * Robustness: missing draft/store → 200 + empty arrays + reason (no 500).
 * DB/schema failures → 200 + degraded: true after logging (no silent swallow).
 */
router.get('/suggestions', optionalAuth, async (req, res) => {
  const draftId = (req.query?.draftId || '').toString().trim();
  const storeId = (req.query?.storeId || '').toString().trim();
  if (!draftId && !storeId) {
    return res.status(400).json({ ok: false, error: 'draftId or storeId required' });
  }

  try {
    if (draftId) {
      const draft = await prisma.draftStore.findUnique({
        where: { id: draftId },
        select: { id: true },
      });
      if (!draft) {
        return res.status(200).json({
          ok: true,
          suggestions: [],
          intents: [],
          reason: 'draft_not_found',
        });
      }
    } else if (storeId) {
      const store = await prisma.business.findUnique({
        where: { id: storeId },
        select: { id: true },
      });
      if (!store) {
        return res.status(200).json({
          ok: true,
          suggestions: [],
          intents: [],
          reason: 'store_not_found',
        });
      }
    }

    const where = draftId ? { draftStoreId: draftId, storeId: null } : { draftStoreId: null, storeId: storeId };
    const now = new Date();
    const suggestions = await prisma.storeActionSuggestion.findMany({
      where: {
        ...where,
        status: 'active',
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lt: now } }],
      },
      orderBy: { rank: 'asc' },
      take: 5,
      select: {
        id: true,
        rank: true,
        actionType: true,
        title: true,
        description: true,
        payload: true,
        status: true,
        cooldownUntil: true,
        createdAt: true,
      },
    });

    const intentRows = await prisma.intentNode.findMany({
      where: draftId ? { draftStoreId: draftId } : { storeId: storeId },
      orderBy: { weight: 'desc' },
      take: 10,
      select: { id: true, intentKey: true, label: true, weight: true, confidence: true },
    });

    const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];
    const safeIntentRows = Array.isArray(intentRows) ? intentRows : [];

    const intents = safeIntentRows.map((i) => ({
      id: i.id,
      intentKey: typeof i.intentKey === 'string' ? i.intentKey : '',
      label: typeof i.label === 'string' ? i.label : '',
      weight: typeof i.weight === 'number' && Number.isFinite(i.weight) ? i.weight : 0,
      confidence: i.confidence ?? undefined,
    }));

    return res.json({
      ok: true,
      suggestions: safeSuggestions,
      intents,
    });
  } catch (err) {
    console.error('[IntentGraph] GET /suggestions error:', err?.message || err);
    if (process.env.NODE_ENV !== 'production') {
      console.error('[IntentGraph] GET /suggestions error (full):', err);
    }
    return res.status(200).json({
      ok: true,
      suggestions: [],
      intents: [],
      degraded: true,
    });
  }
});

/**
 * POST /api/intent-graph/suggestions/:id/accept
 * Transition suggestion status active → applied; write ActionOutcome (applied) and AuditEvent.
 * Idempotent: if status is already applied or dismissed, return 200 { ok: true, already } without duplicate side effects.
 */
router.post('/suggestions/:id/accept', optionalAuth, async (req, res) => {
  try {
    const id = (req.params?.id || '').toString().trim();
    if (!id) return res.status(400).json({ ok: false, error: 'suggestion id required' });

    const suggestion = await prisma.storeActionSuggestion.findUnique({
      where: { id },
      select: { id: true, status: true, title: true },
    });
    if (!suggestion) return res.status(404).json({ ok: false, error: 'Suggestion not found' });

    const current = (suggestion.status || '').toLowerCase();
    if (current !== 'active') {
      return res.json({ ok: true, already: suggestion.status });
    }

    const actorType = req.userId ? 'human' : 'system';
    const actorId = req.userId || null;

    await prisma.$transaction(async (tx) => {
      await tx.storeActionSuggestion.update({
        where: { id },
        data: { status: 'applied', updatedAt: new Date() },
      });
      await tx.actionOutcome.create({
        data: {
          suggestionId: id,
          outcome: 'applied',
          actorType,
          actorId,
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: 'StoreActionSuggestion',
          entityId: id,
          action: 'status_transition',
          fromStatus: 'active',
          toStatus: 'applied',
          actorType,
          actorId,
          reason: 'INTENT_GRAPH_ACCEPT',
        },
      });
    });

    return res.json({ ok: true, status: 'applied' });
  } catch (err) {
    console.error('[IntentGraph] POST accept error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Accept failed' });
  }
});

/**
 * POST /api/intent-graph/suggestions/:id/dismiss
 * Transition suggestion status active → dismissed; set cooldownUntil (e.g. +7d); write ActionOutcome (dismissed) and AuditEvent.
 * Idempotent: if status is already applied or dismissed, return 200 { ok: true, already } without duplicate side effects.
 */
router.post('/suggestions/:id/dismiss', optionalAuth, async (req, res) => {
  try {
    const id = (req.params?.id || '').toString().trim();
    if (!id) return res.status(400).json({ ok: false, error: 'suggestion id required' });

    const suggestion = await prisma.storeActionSuggestion.findUnique({
      where: { id },
      select: { id: true, status: true, title: true },
    });
    if (!suggestion) return res.status(404).json({ ok: false, error: 'Suggestion not found' });

    const current = (suggestion.status || '').toLowerCase();
    if (current !== 'active') {
      return res.json({ ok: true, already: suggestion.status });
    }

    const actorType = req.userId ? 'human' : 'system';
    const actorId = req.userId || null;
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.storeActionSuggestion.update({
        where: { id },
        data: { status: 'dismissed', cooldownUntil, updatedAt: now },
      });
      await tx.actionOutcome.create({
        data: {
          suggestionId: id,
          outcome: 'dismissed',
          actorType,
          actorId,
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: 'StoreActionSuggestion',
          entityId: id,
          action: 'status_transition',
          fromStatus: 'active',
          toStatus: 'dismissed',
          actorType,
          actorId,
          reason: 'INTENT_GRAPH_DISMISS',
          metadata: { cooldownUntil: cooldownUntil.toISOString() },
        },
      });
    });

    return res.json({ ok: true, status: 'dismissed' });
  } catch (err) {
    console.error('[IntentGraph] POST dismiss error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Dismiss failed' });
  }
});

/**
 * GET /api/intent-graph/debug?draftId= or ?storeId=
 * Returns full graph for inspection: nodes, edges, signals, matches, suggestions.
 */
router.get('/debug', optionalAuth, async (req, res) => {
  try {
    const draftId = (req.query?.draftId || '').toString().trim();
    const storeId = (req.query?.storeId || '').toString().trim();
    if (!draftId && !storeId) {
      return res.status(400).json({ ok: false, error: 'draftId or storeId required' });
    }

    const nodeWhere = draftId ? { draftStoreId: draftId } : { storeId: storeId };
    const nodes = await prisma.intentNode.findMany({
      where: nodeWhere,
      orderBy: { weight: 'desc' },
      include: {
        signals: true,
        offerMatches: true,
        edgesFrom: { select: { id: true, toId: true, kind: true } },
        edgesTo: { select: { id: true, fromId: true, kind: true } },
      },
    });

    const suggestionWhere = draftId
      ? { draftStoreId: draftId, storeId: null }
      : { draftStoreId: null, storeId: storeId };
    const suggestions = await prisma.storeActionSuggestion.findMany({
      where: suggestionWhere,
      orderBy: { rank: 'asc' },
      include: { outcomes: true },
    });

    const edges = nodes.flatMap((n) => [
      ...n.edgesFrom.map((e) => ({ id: e.id, fromId: n.id, toId: e.toId, kind: e.kind })),
    ]);

    return res.json({
      ok: true,
      nodes: nodes.map((n) => ({
        id: n.id,
        intentKey: n.intentKey,
        label: n.label,
        weight: n.weight,
        confidence: n.confidence,
        source: n.source,
        signals: n.signals,
        offerMatches: n.offerMatches,
      })),
      edges,
      suggestions,
    });
  } catch (err) {
    console.error('[IntentGraph] GET /debug error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Fetch failed' });
  }
});

export default router;
