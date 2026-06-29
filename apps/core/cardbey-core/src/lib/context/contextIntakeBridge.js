/**
 * Bridge persisted UserContext into intake v2 currentContext shape.
 */

import {
  getContextExtractor,
  getContextProvider,
  isContextEngineEnabled,
} from './contextEngine.js';
import { ContextQueries } from './contextQueries.js';
import { extractCampaignIdFromMission, extractDraftIdFromMission, extractStoreIdFromMission } from './contextMissionExtract.js';
import { missionPipelineOwnedByUser } from '../intake/guestDraftSignInGate.js';
import { getPrismaClient } from '../prisma.js';

function isMissingContextTableError(err) {
  const msg = String(err?.message ?? err ?? '');
  return msg.includes('performer_session_contexts') && msg.includes('does not exist');
}

/**
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} body
 */
export function resolveContextSessionId(req, body = {}) {
  return (
    String(req.headers?.['x-session-id'] ?? body.sessionId ?? body.conversationSessionId ?? '').trim() ||
    (req.guestSessionId ? `guest_${req.guestSessionId}` : null) ||
    null
  );
}

/**
 * @param {import('express').Request} req
 */
export function resolveContextUserId(req) {
  return String(req.user?.id ?? req.userId ?? req.guestId ?? req.guest?.id ?? '').trim() || null;
}

/**
 * @typedef {import('./contextTypes.ts').UserContext} UserContext
 */

/**
 * Merge server-persisted context with client-supplied currentContext.
 * Client keys win for explicit UI-only fields; server wins for workflow state.
 *
 * @param {UserContext | null} persisted
 * @param {Record<string, unknown>} clientContext
 */
export function mergePersistedWithClientContext(persisted, clientContext = {}) {
  if (!persisted) return { ...clientContext };

  const serverFields = {
    activeMissionId: persisted.activeMissionId ?? clientContext.activeMissionId,
    activeStoreId: persisted.activeStoreId ?? clientContext.activeStoreId ?? clientContext.storeId,
    storeId: persisted.activeStoreId ?? clientContext.storeId ?? clientContext.activeStoreId,
    activeDraftId: persisted.activeDraftId ?? clientContext.activeDraftId ?? clientContext.draftId,
    draftId: persisted.activeDraftId ?? clientContext.draftId ?? clientContext.activeDraftId,
    activeCampaignId: persisted.activeCampaignId ?? clientContext.activeCampaignId,
    currentWorkflow: persisted.currentWorkflow ?? clientContext.currentWorkflow,
    currentStepId: persisted.currentStepId ?? clientContext.currentStepId,
    pendingCheckpoints: persisted.pendingCheckpoints?.length
      ? persisted.pendingCheckpoints
      : clientContext.pendingCheckpoints,
    contextEngine: {
      version: persisted.metadata?.version,
      totalInteractions: persisted.metadata?.totalInteractions,
      hasActiveStore: ContextQueries.hasActiveStore(persisted),
      currentWorkflow: persisted.currentWorkflow,
      recentInteractionCount: persisted.interactions?.length ?? 0,
    },
  };

  return {
    ...clientContext,
    ...serverFields,
    _userContext: persisted,
  };
}

/**
 * @param {UserContext | null} userContext
 */
export function toClassifierHints(userContext) {
  if (!userContext) return {};
  return {
    hasActiveStore: ContextQueries.hasActiveStore(userContext),
    currentWorkflow: ContextQueries.getCurrentWorkflow(userContext),
    recentInteractions: ContextQueries.getRecentInteractions(userContext, 3),
    hasPendingCheckpoints: ContextQueries.hasPendingCheckpoints(userContext),
    activeMissionId: ContextQueries.getActiveMissionId(userContext),
  };
}

/**
 * Backfill activeStoreId from mission pipeline or conversation session when persistence missed completion.
 *
 * @param {{
 *   userId: string;
 *   body: Record<string, unknown>;
 *   conversationSession?: { id?: string; storeId?: string | null } | null;
 * }} opts
 */
export async function backfillStoreIdFromMission({ userId, body, conversationSession = null }) {
  const missionId = String(
    body.missionId ??
      (body.currentContext && typeof body.currentContext === 'object'
        ? /** @type {Record<string, unknown>} */ (body.currentContext).activeMissionId
        : '') ??
      '',
  ).trim();

  if (missionId) {
    try {
      const prisma = getPrismaClient();
      const pipeline = await prisma.missionPipeline.findUnique({
        where: { id: missionId },
        select: {
          id: true,
          type: true,
          targetId: true,
          targetType: true,
          outputsJson: true,
          metadataJson: true,
          createdBy: true,
        },
      });
      if (pipeline && missionPipelineOwnedByUser(pipeline, userId)) {
        const storeId = extractStoreIdFromMission(pipeline, /** @type {Record<string, unknown>} */ (pipeline.outputsJson ?? {}));
        if (storeId) return storeId;
      }
    } catch (err) {
      console.warn('[context] backfillStoreIdFromMission failed:', err?.message ?? err);
    }
  }

  const sessionStoreId =
    conversationSession?.storeId && String(conversationSession.storeId).trim()
      ? String(conversationSession.storeId).trim()
      : null;
  if (sessionStoreId) return sessionStoreId;

  return null;
}

/**
 * @param {{
 *   userId: string;
 *   body: Record<string, unknown>;
 * }} opts
 */
export async function backfillDraftIdFromMission({ userId, body }) {
  const missionId = String(
    body.missionId ??
      (body.currentContext && typeof body.currentContext === 'object'
        ? /** @type {Record<string, unknown>} */ (body.currentContext).activeMissionId
        : '') ??
      '',
  ).trim();
  if (!missionId) return null;

  try {
    const prisma = getPrismaClient();
    const pipeline = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        type: true,
        targetId: true,
        targetType: true,
        outputsJson: true,
        metadataJson: true,
        createdBy: true,
      },
    });
    if (pipeline && missionPipelineOwnedByUser(pipeline, userId)) {
      return extractDraftIdFromMission(
        pipeline,
        pipeline.outputsJson && typeof pipeline.outputsJson === 'object'
          ? /** @type {Record<string, unknown>} */ (pipeline.outputsJson)
          : {},
      );
    }
  } catch (err) {
    console.warn('[context] backfillDraftIdFromMission failed:', err?.message ?? err);
  }
  return null;
}

/**
 * Bootstrap intake context at the start of POST /intake/v2.
 *
 * @param {{
 *   req: import('express').Request;
 *   body: Record<string, unknown>;
 *   conversationSession?: { id?: string; storeId?: string | null } | null;
 * }} opts
 * @returns {Promise<{ userContext: UserContext; currentContext: Record<string, unknown> } | null>}
 */
export async function bootstrapIntakeContext({ req, body, conversationSession = null }) {
  if (!isContextEngineEnabled()) return null;

  const userId = resolveContextUserId(req);
  const sessionId = resolveContextSessionId(req, body);
  if (!userId || !sessionId) return null;

  const provider = getContextProvider();
  const extractor = getContextExtractor();
  const clientContext =
    body.currentContext && typeof body.currentContext === 'object'
      ? /** @type {Record<string, unknown>} */ (body.currentContext)
      : {};

  let userContext;
  try {
    userContext = await provider.getOrCreateContext(userId, sessionId);
  } catch (err) {
    if (isMissingContextTableError(err)) {
      console.warn(
        '[context] performer_session_contexts table missing — run: node scripts/ensure-performer-session-context-table.mjs',
      );
      return null;
    }
    throw err;
  }

  const intakeUpdate = extractor.extractFromIntake(body, userContext);
  userContext = await provider.updateContext(userId, sessionId, intakeUpdate);

  if (!ContextQueries.hasActiveStore(userContext)) {
    const backfilledStoreId = await backfillStoreIdFromMission({ userId, body, conversationSession });
    if (backfilledStoreId) {
      userContext = await provider.updateContext(userId, sessionId, {
        activeStoreId: backfilledStoreId,
        currentWorkflow: null,
        activeMissionId: null,
      });
      console.log(`[Context Engine] Backfilled activeStoreId=${backfilledStoreId} (session=${sessionId})`);
    } else {
      const backfilledDraftId = extractDraftIdFromMission(
        { metadataJson: body?.currentContext },
        {
          ...(body?.currentContext && typeof body.currentContext === 'object' ? body.currentContext : {}),
          missionId: body.missionId,
          draftId: body.draftId,
        },
      ) || (await backfillDraftIdFromMission({ userId, body }));
      if (backfilledDraftId) {
        userContext = await provider.updateContext(userId, sessionId, {
          activeDraftId: backfilledDraftId,
          currentWorkflow: null,
        });
        console.log(`[Context Engine] Backfilled activeDraftId=${backfilledDraftId} (session=${sessionId})`);
      }
    }
  }

  await provider.recordInteraction(userId, sessionId, body, null, null, null);

  const currentContext = mergePersistedWithClientContext(userContext, clientContext);
  return { userContext, currentContext };
}

/**
 * Finalize intake context after classification / execution.
 *
 * @param {{
 *   userId: string;
 *   sessionId: string;
 *   body: Record<string, unknown>;
 *   classification: Record<string, unknown> | null;
 *   result?: Record<string, unknown> | null;
 *   durationMs?: number;
 * }} opts
 */
export async function finalizeIntakeContext({
  userId,
  sessionId,
  body,
  classification,
  result = null,
  durationMs = 0,
}) {
  if (!isContextEngineEnabled() || !userId || !sessionId) return;

  const provider = getContextProvider();
  const extractor = getContextExtractor();
  let userContext;
  try {
    userContext = await provider.getContext(userId, sessionId);
  } catch (err) {
    if (isMissingContextTableError(err)) return;
    throw err;
  }

  const intent = classification?.tool ? String(classification.tool) : null;
  const confidence =
    typeof classification?.confidence === 'number' ? classification.confidence : null;

  await provider.recordInteraction(userId, sessionId, body, classification, intent, confidence, durationMs);

  /** @type {Record<string, unknown>} */
  const update = {};

  const storeId =
    extractStoreIdFromMission(
      { metadataJson: body?.currentContext, outputsJson: result },
      result && typeof result === 'object' ? result : {},
    ) ||
    (result?.storeId ? String(result.storeId) : null) ||
    (classification?.parameters &&
    typeof classification.parameters === 'object' &&
    /** @type {Record<string, unknown>} */ (classification.parameters).storeId
      ? String(/** @type {Record<string, unknown>} */ (classification.parameters).storeId)
      : null) ||
    (body?.intakeV2Selection &&
    typeof body.intakeV2Selection === 'object' &&
    body.intakeV2Selection.selectedParameters &&
    typeof body.intakeV2Selection.selectedParameters === 'object' &&
    /** @type {Record<string, unknown>} */ (body.intakeV2Selection.selectedParameters).storeId
      ? String(
          /** @type {Record<string, unknown>} */ (body.intakeV2Selection.selectedParameters).storeId,
        )
      : null) ||
    (body?.currentContext &&
    typeof body.currentContext === 'object' &&
    /** @type {Record<string, unknown>} */ (body.currentContext).activeStoreId
      ? String(/** @type {Record<string, unknown>} */ (body.currentContext).activeStoreId)
      : null);

  if (storeId) {
    update.activeStoreId = storeId;
    console.log(`[Context Engine] finalizeIntakeContext: activeStoreId=${storeId}`);
  }

  const campaignId =
    extractCampaignIdFromMission({ outputsJson: result }, result && typeof result === 'object' ? result : {}) ||
    (result?.campaignId ? String(result.campaignId) : null);
  if (campaignId) {
    update.activeCampaignId = campaignId;
  }

  const draftId =
    extractDraftIdFromMission({ outputsJson: result, metadataJson: body?.currentContext }, result && typeof result === 'object' ? result : {}) ||
    (await backfillDraftIdFromMission({ userId, body }));
  if (draftId && !update.activeStoreId) {
    update.activeDraftId = draftId;
  }

  if (classification?.tool === 'create_store' && storeId) {
    update.currentWorkflow = 'store_creation';
  } else if (classification?.tool === 'add_product' && storeId) {
    update.currentWorkflow = 'product_management';
  }

  if (result?.missionId) {
    update.activeMissionId = String(result.missionId);
  }
  if (classification?.tool) {
    const workflowUpdate = extractor.extractFromIntake(
      { ...body, tool: classification.tool },
      userContext,
    );
    Object.assign(update, workflowUpdate);
  }

  if (Object.keys(update).length > 0) {
    await provider.updateContext(userId, sessionId, update);
  }
}
