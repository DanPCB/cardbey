/**
 * Intent Graph v1: Build and persist store graph from a generated DraftStore.
 * State-machine-centric: single transaction for graph writes; audit events for start/success/failure.
 */

import { prisma } from '../../lib/prisma.js';
import { inferIntentsFromPreview } from './intentInferenceRules.js';
import { matchOffersToIntents } from './offerIntentMatching.js';
import { buildTopActions } from './actionSuggestionEngine.js';

const ENTITY_INTENT_GRAPH = 'IntentGraph';
const REASON_BUILD_START = 'INTENT_GRAPH_BUILD_START';
const REASON_BUILD_SUCCESS = 'INTENT_GRAPH_BUILD_SUCCESS';
const REASON_BUILD_FAILED = 'INTENT_GRAPH_BUILD_FAILED';

function emitAudit(prismaClient, { entityType, entityId, action, fromStatus, toStatus, actorType, reason, metadata }) {
  return prismaClient.auditEvent.create({
    data: {
      entityType: entityType || ENTITY_INTENT_GRAPH,
      entityId: entityId || '',
      action: action || 'build',
      fromStatus: fromStatus ?? null,
      toStatus: toStatus ?? null,
      actorType: actorType || 'automation',
      actorId: null,
      correlationId: null,
      reason: reason ?? null,
      metadata: metadata || undefined,
    },
  }).catch((err) => {
    console.warn('[IntentGraph] Audit write failed:', err?.message);
  });
}

/**
 * Build intent graph for a draft: infer intents, match offers, create suggestions; persist in one transaction.
 * Idempotent: deletes existing graph for this draftStoreId then recreates.
 * @param {string} draftId - DraftStore.id
 * @param {{ actorType?: string, correlationId?: string }} options
 * @returns {{ ok: boolean, intentCount?: number, matchCount?: number, suggestionCount?: number, auditEventId?: string, error?: string }}
 */
export async function buildIntentGraphForDraft(draftId, options = {}) {
  const actorType = options.actorType || 'automation';
  const correlationId = options.correlationId || null;

  if (!draftId || typeof draftId !== 'string') {
    return { ok: false, error: 'draftId required' };
  }

  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
    select: { id: true, status: true, preview: true },
  });

  if (!draft) {
    await emitAudit(prisma, {
      entityId: draftId,
      action: 'build',
      toStatus: 'failed',
      actorType,
      reason: REASON_BUILD_FAILED,
      metadata: { error: 'DRAFT_NOT_FOUND' },
    });
    return { ok: false, error: 'Draft not found' };
  }

  const preview = typeof draft.preview === 'object' ? draft.preview : (draft.preview ? JSON.parse(draft.preview) : null);
  if (!preview) {
    await emitAudit(prisma, {
      entityId: draftId,
      action: 'build',
      toStatus: 'failed',
      actorType,
      reason: REASON_BUILD_FAILED,
      metadata: { error: 'PREVIEW_MISSING' },
    });
    return { ok: false, error: 'Draft preview missing' };
  }

  await emitAudit(prisma, {
    entityId: draftId,
    action: 'build',
    fromStatus: null,
    toStatus: 'running',
    actorType,
    reason: REASON_BUILD_START,
    metadata: { correlationId },
  });

  const intents = inferIntentsFromPreview(preview);
  const matches = matchOffersToIntents(preview, intents.map((i) => ({ intentKey: i.intentKey, label: i.label })));
  const actions = buildTopActions(intents.map((i) => ({ intentKey: i.intentKey, label: i.label })), true);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const draftStoreId = draftId;

      // Idempotent: remove existing graph for this draft before recreating (no stale nodes).
      const existingNodes = await tx.intentNode.findMany({ where: { draftStoreId }, select: { id: true } });
      const nodeIds = existingNodes.map((n) => n.id);
      if (nodeIds.length > 0) {
        await tx.intentGraphSignal.deleteMany({ where: { intentNodeId: { in: nodeIds } } });
        await tx.offerIntentMatch.deleteMany({ where: { intentNodeId: { in: nodeIds } } });
        await tx.intentEdge.deleteMany({ where: { fromId: { in: nodeIds } } });
        await tx.intentEdge.deleteMany({ where: { toId: { in: nodeIds } } });
        await tx.intentNode.deleteMany({ where: { draftStoreId } });
      }
      await tx.storeActionSuggestion.deleteMany({ where: { draftStoreId } });

      const nodeIdByKey = {};
      for (const intent of intents) {
        const confidence = intent.weight != null ? Math.min(1, Math.max(0, intent.weight)) : null;
        const node = await tx.intentNode.create({
          data: {
            draftStoreId,
            storeId: null,
            intentKey: intent.intentKey,
            label: intent.label,
            weight: intent.weight,
            confidence: confidence ?? undefined,
            source: 'rules',
          },
        });
        nodeIdByKey[intent.intentKey] = node.id;
        for (const sig of intent.signals || []) {
          await tx.intentGraphSignal.create({
            data: {
              intentNodeId: node.id,
              signalType: sig.signalType || 'item_keyword',
              signalValue: sig.signalValue || '',
              strength: sig.strength ?? 0.7,
            },
          });
        }
      }

      for (const m of matches) {
        const intentNodeId = nodeIdByKey[m.intentKey];
        if (!intentNodeId) continue;
        await tx.offerIntentMatch.create({
          data: {
            intentNodeId,
            offerType: m.offerType,
            offerRef: m.offerRef,
            draftStoreId,
            storeId: null,
            score: m.score,
            evidence: m.evidence || {},
          },
        });
      }

      for (const a of actions) {
        await tx.storeActionSuggestion.create({
          data: {
            draftStoreId,
            storeId: null,
            rank: a.rank,
            actionType: a.actionType,
            title: a.title,
            description: a.description || null,
            payload: a.payload || {},
            status: 'active',
            cooldownUntil: null, // show immediately; set on dismiss to avoid repeat
          },
        });
      }

      return {
        intentCount: intents.length,
        matchCount: matches.length,
        suggestionCount: actions.length,
      };
    });

    await emitAudit(prisma, {
      entityId: draftId,
      action: 'build',
      fromStatus: 'running',
      toStatus: 'completed',
      actorType,
      reason: REASON_BUILD_SUCCESS,
      metadata: { ...result, correlationId },
    });

    return {
      ok: true,
      intentCount: result.intentCount,
      matchCount: result.matchCount,
      suggestionCount: result.suggestionCount,
    };
  } catch (err) {
    console.error('[IntentGraph] build failed:', err);
    await emitAudit(prisma, {
      entityId: draftId,
      action: 'build',
      fromStatus: 'running',
      toStatus: 'failed',
      actorType,
      reason: REASON_BUILD_FAILED,
      metadata: { error: err?.message || String(err), correlationId },
    });
    return { ok: false, error: err?.message || 'Build failed' };
  }
}
