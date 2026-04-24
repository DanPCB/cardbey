/**
 * Structured store pipeline: after logo + hero checkpoints, create DraftStore, run generateDraft,
 * commit to Business (authed users), and set mission.targetId for analyze_store / preview ids on outputsJson.
 */

import { getPrismaClient } from '../../prisma.js';
import { inferCurrencyFromLocationText } from '../../../services/draftStore/currencyInfer.js';
import { createBuildStoreJob } from '../../../services/draftStore/orchestraBuildStore.js';
import { generateDraft, commitDraft } from '../../../services/draftStore/draftStoreService.js';
import { transitionOrchestratorTaskStatus } from '../../../kernel/transitions/transitionService.js';
import { createEmitContextUpdate } from '../../missionPlan/agentMemory.js';
import { mergeMissionContext } from '../../mission.js';

function isGuestUserId(id) {
  return id != null && typeof id === 'string' && id.trim().toLowerCase().startsWith('guest_');
}

/**
 * @param {object} _input
 * @param {object} context
 * @param {string} [context.missionId]
 * @param {string} [context.userId]
 * @param {string} [context.tenantId]
 */
export async function execute(_input = {}, context = {}) {
  const missionId = typeof context?.missionId === 'string' ? context.missionId.trim() : '';
  if (!missionId) {
    return { status: 'failed', error: { code: 'MISSING_MISSION', message: 'structured_store_build requires context.missionId' } };
  }

  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
  });
  if (!mission) {
    return { status: 'failed', error: { code: 'MISSION_NOT_FOUND', message: 'Mission pipeline not found' } };
  }
  if (String(mission.type || '').toLowerCase() !== 'store') {
    return {
      status: 'ok',
      output: { ok: true, skipped: true, reason: 'not_store_type', missionType: mission.type },
    };
  }

  const meta = mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)
    ? mission.metadataJson
    : {};
  const outputs =
    mission.outputsJson && typeof mission.outputsJson === 'object' && !Array.isArray(mission.outputsJson)
      ? mission.outputsJson
      : {};

  const businessName =
    (typeof meta.businessName === 'string' && meta.businessName.trim()) ||
    (typeof meta.storeName === 'string' && meta.storeName.trim()) ||
    (typeof mission.title === 'string' && mission.title.trim()) ||
    '';
  const businessType =
    (typeof meta.businessType === 'string' && meta.businessType.trim()) ||
    (typeof meta.storeType === 'string' && meta.storeType.trim()) ||
    '';
  const location = (typeof meta.location === 'string' && meta.location.trim()) || '';
  const metaWebsite =
    meta.websiteMode === true ||
    meta.generateWebsite === true ||
    (typeof meta.intentMode === 'string' && meta.intentMode.trim().toLowerCase() === 'website');
  const intentMode =
    (typeof meta.intentMode === 'string' && meta.intentMode.trim().toLowerCase() === 'website') || metaWebsite
      ? 'website'
      : 'store';

  const logoChoice = outputs.logoChoice != null ? String(outputs.logoChoice) : '';
  const heroImageChoice = outputs.heroImageChoice != null ? String(outputs.heroImageChoice) : '';

  const uid = typeof context.userId === 'string' && context.userId.trim() ? context.userId.trim() : mission.createdBy;
  const userRow =
    uid && !isGuestUserId(uid)
      ? await prisma.user.findUnique({
          where: { id: uid },
          include: { businesses: true },
        })
      : null;
  const tenantFromUser =
    userRow?.businesses && Array.isArray(userRow.businesses) && userRow.businesses.length > 0
      ? userRow.businesses[0]?.id ?? null
      : null;
  const tenantId =
    (typeof context.tenantId === 'string' && context.tenantId.trim()) ||
    (typeof mission.tenantId === 'string' && mission.tenantId.trim()) ||
    tenantFromUser ||
    uid;

  if (!tenantId || !uid) {
    return {
      status: 'failed',
      error: { code: 'MISSING_ACTOR', message: 'structured_store_build requires tenantId and userId' },
    };
  }

  const currencyCode =
    (typeof meta.currencyCode === 'string' && meta.currencyCode.trim().toUpperCase()) ||
    inferCurrencyFromLocationText(location) ||
    'AUD';

  const syntheticRaw =
    (typeof meta.rawUserText === 'string' && meta.rawUserText.trim()) ||
    `Create a store for ${businessName || 'my business'}${location ? ` in ${location}` : ''}`.trim();

  const draftInputPatch = {
    ...(logoChoice ? { logoChoice } : {}),
    ...(heroImageChoice ? { heroImageChoice } : {}),
  };

  const jobRequest = {
    tenantId,
    userId: uid,
    businessName: businessName || 'My store',
    businessType: businessType || 'general',
    storeType: businessType || 'general',
    rawInput: syntheticRaw,
    storeId: 'temp',
    includeImages: true,
    generationRunId: null,
    ...(location ? { location } : {}),
    currencyCode,
    intentMode,
    user: userRow ?? undefined,
    ...(Object.keys(draftInputPatch).length > 0 ? { draftInput: draftInputPatch } : {}),
  };

  const created = await createBuildStoreJob(prisma, jobRequest);
  if (!created?.jobId || !created?.generationRunId || !created?.draftId) {
    return {
      status: 'failed',
      error: { code: 'JOB_CREATE_FAILED', message: 'createBuildStoreJob did not return job/draft ids' },
    };
  }

  const draftIdForRun = created.createdDraftId || created.draftId;

  await prisma.orchestratorTask
    .update({
      where: { id: created.jobId },
      data: { missionId },
    })
    .catch(() => {});

  const trRun = await transitionOrchestratorTaskStatus({
    prisma,
    taskId: created.jobId,
    toStatus: 'running',
    fromStatus: 'queued',
    actorType: 'worker',
    correlationId: created.generationRunId,
    reason: 'STRUCTURED_STORE_BUILD',
  });
  if (!trRun.ok && process.env.NODE_ENV !== 'production') {
    console.warn('[structured_store_build] transition queued→running skipped', { jobId: created.jobId });
  }

  try {
    await generateDraft(draftIdForRun, {
      userId: uid,
      reactMissionId: missionId,
      emitContextUpdate: createEmitContextUpdate(missionId, 'orchestra', { prisma, mergeMissionContext }),
    });
  } catch (err) {
    const message = err?.message || String(err);
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: created.jobId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: 'worker',
      correlationId: created.generationRunId,
      reason: 'STRUCTURED_STORE_BUILD',
      result: { ok: false, error: message, generationRunId: created.generationRunId, draftId: draftIdForRun },
    }).catch(() => {});
    return {
      status: 'failed',
      error: { code: 'GENERATE_DRAFT_FAILED', message },
    };
  }

  let storeId = null;
  if (userRow?.id && !isGuestUserId(userRow.id)) {
    try {
      const committed = await commitDraft(draftIdForRun, {
        userId: userRow.id,
        acceptTerms: true,
        businessFields: {},
      });
      storeId = committed?.storeId ?? committed?.businessId ?? null;
    } catch (commitErr) {
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: created.jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        correlationId: created.generationRunId,
        reason: 'STRUCTURED_STORE_BUILD',
        result: {
          ok: false,
          error: commitErr?.message || String(commitErr),
          generationRunId: created.generationRunId,
          draftId: draftIdForRun,
        },
      }).catch(() => {});
      return {
        status: 'failed',
        error: {
          code: 'COMMIT_DRAFT_FAILED',
          message: commitErr?.message || String(commitErr),
        },
      };
    }
  }

  if (storeId) {
    await prisma.missionPipeline.update({
      where: { id: missionId },
      data: { targetType: 'store', targetId: storeId },
    });
  }

  await transitionOrchestratorTaskStatus({
    prisma,
    taskId: created.jobId,
    toStatus: 'completed',
    fromStatus: 'running',
    actorType: 'worker',
    correlationId: created.generationRunId,
    reason: 'STRUCTURED_STORE_BUILD',
    result: {
      ok: true,
      generationRunId: created.generationRunId,
      draftId: draftIdForRun,
      ...(storeId ? { storeId } : {}),
    },
  }).catch(() => {});

  return {
    status: 'ok',
    output: {
      ok: true,
      draftId: draftIdForRun,
      generationRunId: created.generationRunId,
      jobId: created.jobId,
      storeId,
      guestSkippedCommit: !storeId && isGuestUserId(uid),
    },
  };
}
