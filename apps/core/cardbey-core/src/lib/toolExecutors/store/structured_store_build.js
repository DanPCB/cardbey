/**
 * Structured store pipeline: after logo + hero checkpoints, create DraftStore, run generateDraft,
 * commit to Business (authed users), and set mission.targetId for analyze_store / preview ids on outputsJson.
 */

import { getPrismaClient } from '../../prisma.js';
import { inferCurrencyFromLocationText } from '../../../services/draftStore/currencyInfer.js';
import { createBuildStoreJob } from '../../../services/draftStore/orchestraBuildStore.js';
import { generateDraft, commitDraft } from '../../../services/draftStore/draftStoreService.js';
import { createGuestTempStoreFromDraft } from '../../../services/draftStore/guestTempStore.js';
import { transitionOrchestratorTaskStatus } from '../../../kernel/transitions/transitionService.js';
import { createEmitContextUpdate } from '../../missionPlan/agentMemory.js';
import { mergeMissionContext } from '../../mission.js';
import { mergeCanonicalOutputs } from '../../orchestrator/pipelineCanonicalResults.js';

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

  let qaTier2Pending = [];
  try {
    const { applyStoreBuildQaAutoFix } = await import('../../../services/qa/storeBuildQaAutoFix.js');
    const qaResult = await applyStoreBuildQaAutoFix({
      prisma,
      draftId: draftIdForRun,
      missionId,
      businessName: businessName || 'My store',
      businessType: businessType || 'general',
      metadataJson: meta,
      generationRunId: created.generationRunId,
    });
    qaTier2Pending = Array.isArray(qaResult?.tier2Pending) ? qaResult.tier2Pending : [];
    if (process.env.NODE_ENV !== 'production') {
      console.log('[structured_store_build] store QA auto-fix', {
        missionId,
        draftId: draftIdForRun,
        autoFixed: qaResult?.autoFixed,
        tier2Pending: qaTier2Pending.map((f) => f?.id),
      });
    }
  } catch (qaErr) {
    console.warn('[structured_store_build] store QA auto-fix skipped:', qaErr?.message ?? qaErr);
  }

  let storeId = null;
  let storeSlug = null;
  let guestTempStore = false;
  if (userRow?.id && !isGuestUserId(userRow.id)) {
    try {
      const committed = await commitDraft(draftIdForRun, {
        userId: userRow.id,
        acceptTerms: true,
        businessFields: {},
      });
      storeId = committed?.storeId ?? committed?.businessId ?? null;
      storeSlug = committed?.storeSlug ?? committed?.slug ?? null;
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

  if (!storeId && isGuestUserId(uid)) {
    try {
      const guest = await createGuestTempStoreFromDraft(draftIdForRun, {
        userId: uid,
        generationRunId: created.generationRunId,
      });
      storeId = guest.storeId;
      storeSlug = guest.storeSlug;
      guestTempStore = true;
    } catch (guestErr) {
      console.warn('[structured_store_build] guest temp store failed, retrying:', guestErr?.message ?? guestErr);
      try {
        const guest = await createGuestTempStoreFromDraft(draftIdForRun, {
          userId: uid,
          generationRunId: created.generationRunId,
          slugNameBase: `guest-store-${Date.now()}`,
        });
        storeId = guest.storeId;
        storeSlug = guest.storeSlug;
        guestTempStore = true;
        console.log('[structured_store_build] guest retry succeeded:', {
          storeId: guest.storeId,
          slug: guest.storeSlug,
        });
      } catch (retryErr) {
        console.error('[structured_store_build] guest retry also failed:', retryErr?.message ?? retryErr);
      }
    }
  }

  if (storeId) {
    await prisma.missionPipeline.update({
      where: { id: missionId },
      data: { targetType: 'store', targetId: storeId },
    });
  }

  try {
    const pipeRow = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { outputsJson: true },
    });
    const structuredSlice = {
      ok: true,
      draftId: draftIdForRun,
      generationRunId: created.generationRunId,
      jobId: created.jobId,
      ...(storeId ? { storeId, storeSlug } : {}),
      ...(guestTempStore ? { guestTempStore: true, guestSkippedCommit: false } : {}),
      ...(!guestTempStore && !storeId && isGuestUserId(uid) ? { guestSkippedCommit: true } : {}),
    };
    const outputsJson = mergeCanonicalOutputs(pipeRow?.outputsJson, {
      draftId: draftIdForRun,
      generationRunId: created.generationRunId,
      jobId: created.jobId,
      ...(storeId ? { storeId, storeSlug } : {}),
      ...(guestTempStore ? { guestTempStore: true } : {}),
      structured_store_build: structuredSlice,
    });
    await prisma.missionPipeline.update({
      where: { id: missionId },
      data: { outputsJson },
    });
  } catch (outputsErr) {
    console.warn('[structured_store_build] outputsJson persist skipped:', outputsErr?.message ?? outputsErr);
  }

  try {
    const latest = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { title: true, metadataJson: true },
    });
    const mLatest =
      latest?.metadataJson && typeof latest.metadataJson === 'object' && !Array.isArray(latest.metadataJson)
        ? latest.metadataJson
        : {};
    const inName =
      (typeof _input?.storeName === 'string' && _input.storeName.trim()) ||
      (typeof _input?.businessName === 'string' && _input.businessName.trim()) ||
      '';
    const metaName =
      (typeof mLatest.businessName === 'string' && mLatest.businessName.trim()) ||
      (typeof mLatest.storeName === 'string' && mLatest.storeName.trim()) ||
      '';
    const patchName = (inName || metaName || '').trim();
    const intentModeRaw =
      (typeof _input?.intentMode === 'string' && _input.intentMode.trim().toLowerCase()) ||
      (typeof mLatest.intentMode === 'string' && mLatest.intentMode.trim().toLowerCase()) ||
      '';
    const metaWebsite =
      mLatest.websiteMode === true ||
      mLatest.generateWebsite === true ||
      intentModeRaw === 'website';
    const prefix = metaWebsite ? 'Create mini website' : 'Create store';
    const desired = patchName ? `${prefix}: ${patchName.slice(0, 120)}` : '';
    const curTitle = typeof latest?.title === 'string' ? latest.title.trim() : '';
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[structured_store_build] title patch probe', {
        missionId,
        inputStoreName: _input?.storeName,
        inputBusinessName: _input?.businessName,
        metaBusinessName: mLatest.businessName,
        metaStoreName: mLatest.storeName,
        patchName: patchName || null,
        curTitle: curTitle || null,
        desired: desired || null,
      });
    }
    if (desired && curTitle.toLowerCase() !== desired.toLowerCase()) {
      await prisma.missionPipeline.update({
        where: { id: missionId },
        data: { title: desired },
      });
    }
  } catch (titlePatchErr) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[structured_store_build] title patch skipped:', titlePatchErr?.message || titlePatchErr);
    }
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
      ...(storeSlug ? { storeSlug } : {}),
      ...(guestTempStore ? { guestTempStore: true } : {}),
    },
  }).catch(() => {});

  let productCount = 0;
  let hasImages = false;
  try {
    const draftRow = await prisma.draftStore.findUnique({
      where: { id: draftIdForRun },
      select: { preview: true },
    });
    const preview =
      draftRow?.preview && typeof draftRow.preview === 'object' && !Array.isArray(draftRow.preview)
        ? draftRow.preview
        : {};
    const products = Array.isArray(preview.items) ? preview.items : [];
    productCount = products.length;
    hasImages = products.some(
      (p) => p && typeof p === 'object' && typeof p.imageUrl === 'string' && p.imageUrl.trim().length > 0,
    );
  } catch (previewErr) {
    console.warn('[structured_store_build] COMPLETE preview read failed:', previewErr?.message ?? previewErr);
  }

  console.log('[structured_store_build] COMPLETE:', {
    ok: true,
    storeId,
    storeSlug,
    draftId: draftIdForRun,
    generationRunId: created.generationRunId,
    productCount,
    hasImages,
  });

  return {
    status: 'ok',
    output: {
      ok: true,
      draftId: draftIdForRun,
      generationRunId: created.generationRunId,
      jobId: created.jobId,
      storeId,
      ...(storeSlug ? { storeSlug } : {}),
      ...(guestTempStore ? { guestTempStore: true, guestSkippedCommit: false } : {}),
      guestSkippedCommit: !storeId && isGuestUserId(uid),
      ...(qaTier2Pending.length > 0
        ? { qaTier2Pending: true, qaTier2FixCount: qaTier2Pending.length }
        : {}),
    },
  };
}
