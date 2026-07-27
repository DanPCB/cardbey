/**
 * Mission execution hooks for Context Engine.
 */

import {
  getContextExtractor,
  getContextProvider,
  isContextEngineEnabled,
} from './contextEngine.js';
import {
  extractCampaignIdFromMission,
  extractDraftIdFromMission,
  extractStoreIdFromMission,
  normalizeGuestSessionId,
  sessionIdFromMissionMetadata,
} from './contextMissionExtract.js';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {{ createdBy?: string | null; metadataJson?: unknown; outputsJson?: unknown }} pipeline
 * @param {string} missionId
 * @param {Record<string, unknown>} [result]
 */
async function resolveMissionSessionId(prisma, pipeline, missionId, result = {}) {
  const fromMeta = sessionIdFromMissionMetadata(pipeline.metadataJson);
  if (fromMeta) return fromMeta;

  const meta = asObject(pipeline.metadataJson);
  const outputs = { ...asObject(pipeline.outputsJson), ...asObject(result) };
  const guestFromMeta = normalizeGuestSessionId(meta.guestSessionId ?? outputs.guestSessionId);
  if (guestFromMeta) return guestFromMeta;

  const draftId = extractDraftIdFromMission(pipeline, result);
  if (draftId) {
    try {
      const draft = await prisma.draftStore.findUnique({
        where: { id: draftId },
        select: { guestSessionId: true },
      });
      const guestFromDraft = normalizeGuestSessionId(draft?.guestSessionId);
      if (guestFromDraft) return guestFromDraft;
    } catch {
      // non-fatal
    }
  }

  const userId = String(pipeline.createdBy ?? '').trim();
  if (userId && !userId.startsWith('guest_')) {
    try {
      const session = await prisma.conversationSession.findFirst({
        where: { userId, status: 'active' },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
      });
      if (session?.id) return session.id;
    } catch {
      // non-fatal
    }
  }

  return `mission:${missionId}`;
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {{ includeOutputs?: boolean }} [opts]
 */
async function loadMissionContextKeys(prisma, missionId, opts = {}) {
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      type: true,
      targetId: true,
      targetType: true,
      currentStepId: true,
      metadataJson: true,
      createdBy: true,
      ...(opts.includeOutputs ? { outputsJson: true } : {}),
    },
  });
  if (!pipeline) return null;

  const userId = String(pipeline.createdBy ?? '').trim() || null;
  const sessionId = await resolveMissionSessionId(
    prisma,
    pipeline,
    missionId,
    opts.includeOutputs && pipeline.outputsJson && typeof pipeline.outputsJson === 'object'
      ? /** @type {Record<string, unknown>} */ (pipeline.outputsJson)
      : {},
  );

  return { pipeline, userId, sessionId };
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 */
export async function onMissionStarted(prisma, missionId) {
  if (!isContextEngineEnabled()) return;

  const keys = await loadMissionContextKeys(prisma, missionId);
  if (!keys?.userId) return;

  const { pipeline, userId, sessionId } = keys;
  const provider = getContextProvider();
  const extractor = getContextExtractor();
  const current = await provider.getOrCreateContext(userId, sessionId);
  const update = extractor.extractFromMission(
    {
      id: pipeline.id,
      type: pipeline.type,
      currentStepId: pipeline.currentStepId,
      targetId: pipeline.targetId,
      targetType: pipeline.targetType,
      metadataJson: pipeline.metadataJson,
    },
    current,
  );

  await provider.updateContext(userId, sessionId, update);
  await provider.recordInteraction(
    userId,
    sessionId,
    { type: 'mission_created', missionId: pipeline.id },
    { status: 'started' },
    'mission_start',
    1.0,
  );
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {{ id: string; checkpointType?: string; prompt?: string; options?: unknown[] }} step
 */
export async function onMissionCheckpoint(prisma, missionId, step) {
  if (!isContextEngineEnabled()) return;

  const keys = await loadMissionContextKeys(prisma, missionId);
  if (!keys?.userId) return;

  const { userId, sessionId } = keys;
  const provider = getContextProvider();

  await provider.updateContext(userId, sessionId, {
    pendingCheckpoints: [
      {
        stepId: step.id,
        type: /** @type {'upload' | 'confirmation' | 'input' | 'selection'} */ (
          step.checkpointType ?? 'input'
        ),
        prompt: step.prompt ?? '',
        timestamp: new Date().toISOString(),
        options: step.options,
      },
    ],
    currentStepId: step.id,
  });
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {string} stepId
 */
export async function onMissionCheckpointResolved(prisma, missionId, stepId) {
  if (!isContextEngineEnabled()) return;

  const keys = await loadMissionContextKeys(prisma, missionId);
  if (!keys?.userId) return;

  const { pipeline, userId, sessionId } = keys;
  const provider = getContextProvider();

  await provider.updateContext(userId, sessionId, {
    pendingCheckpoints: [],
    currentStepId: pipeline.currentStepId,
  });

  await provider.recordInteraction(
    userId,
    sessionId,
    { type: 'checkpoint', missionId, stepId },
    { status: 'resolved' },
    'checkpoint_resolved',
    1.0,
  );
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {Record<string, unknown>} [result]
 */
export async function onMissionCompleted(prisma, missionId, result = {}) {
  if (!isContextEngineEnabled()) return;

  const keys = await loadMissionContextKeys(prisma, missionId, { includeOutputs: true });
  if (!keys?.userId) return;

  const { pipeline, userId, sessionId } = keys;
  // Re-resolve session with full completion payload (draft guest session, etc.)
  const resolvedSessionId = await resolveMissionSessionId(prisma, pipeline, missionId, result);
  const provider = getContextProvider();
  const extractor = getContextExtractor();
  const current = await provider.getContext(userId, resolvedSessionId);

  const storeId = extractStoreIdFromMission(pipeline, result);
  const campaignId = extractCampaignIdFromMission(pipeline, result);
  const draftId = extractDraftIdFromMission(pipeline, result);

  /** @type {Record<string, unknown>} */
  const update = {
    activeMissionId: null,
    currentStepId: null,
    pendingCheckpoints: [],
    currentWorkflow: null,
  };

  if (storeId) {
    update.activeStoreId = storeId;
    console.log(`[Context Engine] Setting activeStoreId: ${storeId} (session=${resolvedSessionId})`);
  } else if (draftId) {
    update.activeDraftId = draftId;
    console.log(`[Context Engine] Setting activeDraftId: ${draftId} (session=${resolvedSessionId})`);
  } else if (pipeline.type === 'store' || pipeline.type === 'store_creation') {
    console.warn(
      '[Context Engine] No storeId or draftId found in mission completion.',
      { missionId, targetId: pipeline.targetId, outputKeys: Object.keys(result ?? {}) },
    );
  }

  if (campaignId) {
    update.activeCampaignId = campaignId;
    console.log(`[Context Engine] Setting activeCampaignId: ${campaignId} (session=${resolvedSessionId})`);
  }

  const toolName =
    pipeline.type === 'store' || pipeline.type === 'store_creation'
      ? 'create_store'
      : pipeline.type === 'campaign' || pipeline.type === 'campaign_creation'
        ? 'create_campaign'
        : pipeline.type;
  const toolUpdate = extractor.extractFromToolExecution(
    { tool: toolName, success: true, result: { ...result, storeId, campaignId } },
    current,
  );
  Object.assign(update, toolUpdate);
  update.activeMissionId = null;
  update.currentWorkflow = null;

  await provider.updateContext(userId, resolvedSessionId, update);

  await provider.recordInteraction(
    userId,
    resolvedSessionId,
    { type: 'mission_complete', missionId },
    { status: 'completed', result: { storeId, campaignId, draftId } },
    'mission_complete',
    1.0,
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Context Engine] Mission completed. Updated context:', {
      sessionId: resolvedSessionId,
      activeStoreId: update.activeStoreId ?? null,
      activeDraftId: update.activeDraftId ?? null,
      activeCampaignId: update.activeCampaignId ?? null,
    });
  }
}
