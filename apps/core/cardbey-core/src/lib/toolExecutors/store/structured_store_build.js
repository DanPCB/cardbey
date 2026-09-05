/**
 * Structured store pipeline: after logo + hero checkpoints, create DraftStore, run generateDraft,
 * commit to Business (authed users), and set mission.targetId for analyze_store / preview ids on outputsJson.
 */

import { getPrismaClient } from '../../prisma.js';
import { inferCurrencyFromLocationText } from '../../../services/draftStore/currencyInfer.js';
import { createBuildStoreJob } from '../../../services/draftStore/orchestraBuildStore.js';
import { generateDraft } from '../../../services/draftStore/draftStoreService.js';
import { safePublishGeneratedDraft } from '../../storeMission/safePublishGeneratedDraft.js';
import { createGuestTempStoreFromDraft } from '../../../services/draftStore/guestTempStore.js';
import { transitionOrchestratorTaskStatus } from '../../../kernel/transitions/transitionService.js';
import { createEmitContextUpdate } from '../../missionPlan/agentMemory.js';
import { mergeMissionContext } from '../../mission.js';
import { mergeCanonicalOutputs } from '../../orchestrator/pipelineCanonicalResults.js';
import { safeMissionPipelineUpdate } from '../../safePipelineUpdate.js';
import { shouldBlockStoreBuildForMissingArtifact } from '../../artifactCheckpointAuthority.js';
import { guestDraftOptsForActor } from '../../storeMission/guestDraftOpts.js';
import { countCatalogItemsByKind } from '../../commerce/assertCatalogKindConsistency.js';
import { classifyGenerateDraftFailure } from './classifyGenerateDraftFailure.js';
import {
  ensureDraftFailedAfterGenerateError,
  persistStructuredStoreBuildFailureOutputs,
} from './structuredStoreBuildFailureRecovery.js';

export { classifyGenerateDraftFailure } from './classifyGenerateDraftFailure.js';

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
    (typeof meta.category === 'string' && meta.category.trim()) ||
    (typeof meta.industry === 'string' && meta.industry.trim()) ||
    '';
  const location = (typeof meta.location === 'string' && meta.location.trim()) || '';
  const websiteUrl =
    (typeof meta.websiteUrl === 'string' && meta.websiteUrl.trim()) ||
    (typeof meta.website === 'string' && meta.website.trim()) ||
    '';
  const phone = (typeof meta.phone === 'string' && meta.phone.trim()) || '';
  const email = (typeof meta.email === 'string' && meta.email.trim()) || '';
  const ocrRawText =
    (typeof meta.ocrRawText === 'string' && meta.ocrRawText.trim()) ||
    (typeof meta.ocrText === 'string' && meta.ocrText.trim()) ||
    '';
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
  const checkpointLogoUrl =
    (typeof outputs.logoUrl === 'string' && outputs.logoUrl.trim()) || '';
  const artifactBlock = shouldBlockStoreBuildForMissingArtifact(outputs);
  if (artifactBlock.blocked) {
    // eslint-disable-next-line no-console
    console.log('[artifact-checkpoint:respond-not-sent-yet]', {
      missionId,
      outputKey: artifactBlock.outputKey,
      choice: artifactBlock.choice,
      reason: 'store_build_blocked_until_artifact',
    });
    return {
      status: 'blocked',
      blocker: {
        code: 'ARTIFACT_REQUIRED',
        message: 'Store build cannot start until required upload or library selection is complete.',
        outputKey: artifactBlock.outputKey,
      },
    };
  }
  if (checkpointLogoUrl && process.env.NODE_ENV !== 'production') {
    console.log('[logo-checkpoint:core-output]', { missionId, logoUrl: checkpointLogoUrl });
  }

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
    ...(checkpointLogoUrl ? { logoUrl: checkpointLogoUrl, userUploadedLogo: true } : {}),
    ...(websiteUrl ? { websiteUrl } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(ocrRawText ? { ocrRawText, ocrText: ocrRawText } : {}),
    ...(typeof meta.websiteTemplateId === 'string' && meta.websiteTemplateId.trim()
      ? {
          websiteTemplateId: meta.websiteTemplateId.trim(),
          ...(typeof meta.websiteTemplateSlug === 'string' && meta.websiteTemplateSlug.trim()
            ? { websiteTemplateSlug: meta.websiteTemplateSlug.trim() }
            : {}),
        }
      : {}),
  };

  const {
    buildStoreGenerationBusinessContext,
    attachBusinessContextToDraftInput,
  } = await import('../../../services/draftStore/storeGenerationBusinessContext.js');
  const storeGenCtx = buildStoreGenerationBusinessContext({
    businessName: businessName || 'My store',
    businessType: businessType || undefined,
    storeType: businessType || undefined,
    category: businessType || (typeof meta.category === 'string' ? meta.category : undefined),
    location,
    websiteUrl: websiteUrl || undefined,
    description: meta.businessDescription || meta.description || undefined,
    prompt: syntheticRaw,
    ocrRawText: ocrRawText || undefined,
  });
  // Prefer inferred professional category over silent 'general' → retail scaffolds.
  const lockedType =
    businessType ||
    (storeGenCtx.primaryCTA === 'Book consultation' || storeGenCtx.industry === 'professional_services'
      ? storeGenCtx.subIndustry || storeGenCtx.primaryCategory || 'finance'
      : null) ||
    'general';
  const draftInputWithCtx = attachBusinessContextToDraftInput(
    {
      ...draftInputPatch,
      verticalSlug: storeGenCtx.verticalSlug,
      verticalGroup: storeGenCtx.verticalGroup,
      creationMode: storeGenCtx.creationMode,
      creationModeReason: storeGenCtx.creationModeReason,
    },
    storeGenCtx,
  );

  const jobRequest = {
    tenantId,
    userId: uid,
    businessName: businessName || 'My store',
    businessType: lockedType,
    storeType: lockedType,
    rawInput: syntheticRaw,
    storeId: 'temp',
    includeImages: true,
    generationRunId: null,
    ...(location ? { location } : {}),
    currencyCode,
    intentMode,
    user: userRow ?? undefined,
    ...(websiteUrl ? { websiteUrl } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(ocrRawText ? { ocrRawText } : {}),
    ...(Object.keys(draftInputPatch).length > 0 ? { draftInput: draftInputPatch } : {}),
    ...(typeof meta.websiteTemplateId === 'string' && meta.websiteTemplateId.trim()
      ? {
          websiteTemplateId: meta.websiteTemplateId.trim(),
          ...(typeof meta.websiteTemplateSlug === 'string' && meta.websiteTemplateSlug.trim()
            ? { websiteTemplateSlug: meta.websiteTemplateSlug.trim() }
            : {}),
        }
      : {}),
  };

  const created = await createBuildStoreJob(prisma, {
    ...jobRequest,
    ...guestDraftOptsForActor(isGuestUserId(uid) ? { role: 'guest', id: uid } : userRow, uid),
  });
  if (!created?.jobId || !created?.generationRunId || !created?.draftId) {
    return {
      status: 'failed',
      error: { code: 'JOB_CREATE_FAILED', message: 'createBuildStoreJob did not return job/draft ids' },
    };
  }

  const draftIdForRun = created.createdDraftId || created.draftId;

  console.log('[structured_store_build] START:', {
    missionId,
    storeName: businessName || null,
    businessType: businessType || null,
    intentMode,
    draftStoreId: draftIdForRun,
    generationRunId: created.generationRunId,
    jobId: created.jobId,
    stepStatus: 'running',
  });

  const { runCriticalSqliteWriteWithP1008Retry } = await import('../../sqliteCriticalWrite.js');
  await runCriticalSqliteWriteWithP1008Retry(
    () =>
      prisma.orchestratorTask.update({
        where: { id: created.jobId },
        data: { missionId },
      }),
    { label: 'orchestratorTask.update.missionId', logPrefix: '[structured_store_build]' },
  ).catch(() => {});

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
    const socialImport =
      meta.socialImport && typeof meta.socialImport === 'object' ? meta.socialImport : {};
    const rawProducts = Array.isArray(socialImport.products) ? socialImport.products : [];
    if (rawProducts.length > 0) {
      const { sanitizePreloadedCatalogItems } = await import(
        '../../../services/draftStore/preloadedCatalogFromItems.js'
      );
      const sanitized = sanitizePreloadedCatalogItems(
        rawProducts.map((p) => ({
          name: p?.name,
          description: p?.description ?? null,
          price: p?.price ?? null,
          imageUrl: p?.imageUrl ?? null,
          imageSource: p?.imageSource ?? null,
          category: p?.category ?? null,
          source: p?.source ?? 'social_import',
        })),
      );
      if (sanitized?.length) {
        const draftRow = await prisma.draftStore.findUnique({
          where: { id: draftIdForRun },
          select: { input: true },
        });
        const prevIn =
          draftRow?.input && typeof draftRow.input === 'object' && !Array.isArray(draftRow.input)
            ? draftRow.input
            : {};
        await prisma.draftStore.update({
          where: { id: draftIdForRun },
          data: {
            input: {
              ...prevIn,
              preloadedCatalogItems: sanitized,
            },
          },
        });
        await mergeMissionContext(missionId, { preloadedCatalogItems: sanitized }, { prisma }).catch(() => {});
      }
    }
  } catch (preloadErr) {
    console.warn('[structured_store_build] preloaded catalog patch skipped:', preloadErr?.message ?? preloadErr);
  }

  try {
    const { buildContactIntakeFromMissionMeta, applyStoreContactIntakeToDraft } = await import(
      '../../../services/draftStore/storeContactIntake.js'
    );
    const contactIntake = buildContactIntakeFromMissionMeta(meta);
    if (contactIntake) {
      await applyStoreContactIntakeToDraft(prisma, draftIdForRun, contactIntake);
    }
  } catch (contactErr) {
    console.warn('[structured_store_build] contact intake apply skipped:', contactErr?.message ?? contactErr);
  }

  try {
    await generateDraft(draftIdForRun, {
      userId: uid,
      reactMissionId: missionId,
      emitContextUpdate: createEmitContextUpdate(missionId, 'orchestra', { prisma, mergeMissionContext }),
    });
  } catch (err) {
    const classified = classifyGenerateDraftFailure(err);
    console.error('[structured_store_build] GENERATE_DRAFT_FAILED:', {
      missionId,
      storeName: businessName || null,
      draftStoreId: draftIdForRun,
      generationRunId: created.generationRunId,
      stepStatus: 'failed',
      error: classified.developerMessage,
      failureCode: classified.code,
      developerCode: classified.developerCode,
      stack: err?.stack,
    });
    await ensureDraftFailedAfterGenerateError(
      prisma,
      draftIdForRun,
      classified,
      created.generationRunId,
    );
    await persistStructuredStoreBuildFailureOutputs(prisma, missionId, {
      draftId: draftIdForRun,
      generationRunId: created.generationRunId,
      jobId: created.jobId,
      classified,
    });
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
        error: classified.message,
        failureCode: classified.code,
        developerMessage: classified.developerMessage,
        generationRunId: created.generationRunId,
        draftId: draftIdForRun,
      },
    }).catch(() => {});
    return {
      status: 'failed',
      error: {
        code: classified.code,
        message: classified.message,
        developerMessage: classified.developerMessage,
        developerCode: classified.developerCode,
      },
      output: {
        ok: false,
        draftId: draftIdForRun,
        generationRunId: created.generationRunId,
        jobId: created.jobId,
        failureCode: classified.code,
        errorCode: classified.code,
      },
    };
  }

  try {
    const { buildContactIntakeFromMissionMeta, applyStoreContactIntakeToDraft } = await import(
      '../../../services/draftStore/storeContactIntake.js'
    );
    const contactIntakeAfter = buildContactIntakeFromMissionMeta(meta);
    if (contactIntakeAfter) {
      await applyStoreContactIntakeToDraft(prisma, draftIdForRun, contactIntakeAfter);
    }
  } catch (contactAfterErr) {
    console.warn('[structured_store_build] contact intake re-apply skipped:', contactAfterErr?.message ?? contactAfterErr);
  }

  if (checkpointLogoUrl) {
    try {
      const { applyCheckpointLogoToDraft } = await import('../../../services/draftStore/logoUpdateService.js');
      await applyCheckpointLogoToDraft({
        prisma,
        draftId: draftIdForRun,
        logoUrl: checkpointLogoUrl,
      });
    } catch (logoErr) {
      console.warn('[structured_store_build] checkpoint logo apply skipped:', logoErr?.message ?? logoErr);
    }
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

  try {
    const draftAfterQa = await prisma.draftStore.findUnique({
      where: { id: draftIdForRun },
      select: { preview: true, input: true },
    });
    const previewAfterQa =
      draftAfterQa?.preview && typeof draftAfterQa.preview === 'object' && !Array.isArray(draftAfterQa.preview)
        ? draftAfterQa.preview
        : {};
    const itemsAfterQa = Array.isArray(previewAfterQa.items) ? previewAfterQa.items.map((x) => ({ ...x })) : [];
    const missingImages =
      itemsAfterQa.length > 0 &&
      itemsAfterQa.some((p) => !p?.imageUrl || !String(p.imageUrl).trim());
    if (missingImages) {
      const { fillMissingDraftItemImages } = await import('../../../services/draftStore/fillMissingDraftItemImages.js');
      const { patched } = await fillMissingDraftItemImages({
        items: itemsAfterQa,
        categories: Array.isArray(previewAfterQa.categories) ? previewAfterQa.categories : [],
        storeName: previewAfterQa.storeName || businessName,
        storeType: previewAfterQa.storeType || businessType,
        location: previewAfterQa.location ?? location ?? null,
        generationProfile:
          previewAfterQa.meta?.generationProfile ??
          draftAfterQa?.input?.generationProfile ??
          draftAfterQa?.input?.classificationProfile ??
          null,
      });
      if (patched > 0) {
        const { patchDraftPreview } = await import('../../../services/draftStore/draftStoreService.js');
        await patchDraftPreview(draftIdForRun, { items: itemsAfterQa });
        console.log('[structured_store_build] post-QA image backfill patched', {
          missionId,
          draftId: draftIdForRun,
          patched,
        });
      }
    }
    const heroMissing = !previewAfterQa.heroImageUrl && !previewAfterQa.hero?.imageUrl;
    if (heroMissing) {
      try {
        const heroMod = await import('../../../services/mi/heroGenerationService.ts');
        const generateHeroForDraft = heroMod.generateHeroForDraft ?? heroMod.default?.generateHeroForDraft;
        if (typeof generateHeroForDraft === 'function') {
          const { hero } = await generateHeroForDraft({
            storeName: previewAfterQa.storeName || businessName,
            businessType: previewAfterQa.storeType || businessType,
            storeType: previewAfterQa.storeType || businessType,
            verticalSlug: previewAfterQa.meta?.verticalSlug ?? null,
            verticalGroup: previewAfterQa.meta?.verticalGroup ?? null,
          });
          const heroUrl = hero?.imageUrl ?? null;
          if (heroUrl) {
            const { patchDraftPreview } = await import('../../../services/draftStore/draftStoreService.js');
            const { applyPipelineGeneratedHeroImage } = await import(
              '../../../services/draftStore/draftPreviewHeroSync.js'
            );
            const heroPreview = { ...previewAfterQa };
            if (applyPipelineGeneratedHeroImage(heroPreview, heroUrl, { writer: 'structured_store_build', draftId: draftIdForRun })) {
              await patchDraftPreview(draftIdForRun, {
                heroImageUrl: heroPreview.heroImageUrl,
                hero: heroPreview.hero,
              });
            }
          }
        }
      } catch (heroBackfillErr) {
        console.warn('[structured_store_build] post-QA hero backfill skipped:', heroBackfillErr?.message ?? heroBackfillErr);
      }
    }
  } catch (imageBackfillErr) {
    console.warn('[structured_store_build] post-QA image backfill skipped:', imageBackfillErr?.message ?? imageBackfillErr);
  }

  if (checkpointLogoUrl) {
    try {
      const { applyCheckpointLogoToDraft } = await import('../../../services/draftStore/logoUpdateService.js');
      await applyCheckpointLogoToDraft({
        prisma,
        draftId: draftIdForRun,
        logoUrl: checkpointLogoUrl,
      });
    } catch (logoErr) {
      console.warn('[structured_store_build] checkpoint logo re-apply after QA skipped:', logoErr?.message ?? logoErr);
    }
  }

  let storeId = null;
  let storeSlug = null;
  let guestTempStore = false;
  if (userRow?.id && !isGuestUserId(userRow.id)) {
    const publishResult = await safePublishGeneratedDraft({
      prisma,
      draftId: draftIdForRun,
      userId: userRow.id,
      missionId: missionId ?? undefined,
      correlationId: created.generationRunId,
      taskId: created.jobId,
    });

    if (!publishResult.ok) {
      try {
        const pipeRow = await prisma.missionPipeline.findUnique({
          where: { id: missionId },
          select: { outputsJson: true },
        });
        const publishPendingSlice = {
          ok: false,
          publishFailed: true,
          retryable: publishResult.retryable === true,
          draftId: draftIdForRun,
          generationRunId: created.generationRunId,
          jobId: created.jobId,
          error: publishResult.error ?? null,
        };
        const outputsJson = mergeCanonicalOutputs(pipeRow?.outputsJson, {
          draftId: draftIdForRun,
          generationRunId: created.generationRunId,
          jobId: created.jobId,
          publishFailed: true,
          structured_store_build: publishPendingSlice,
        });
        await safeMissionPipelineUpdate(
          prisma,
          {
            where: { id: missionId },
            data: { outputsJson },
          },
          { missionId, label: 'structured_store_build.publish_pending_outputs' },
        );
      } catch (outputsErr) {
        console.warn('[structured_store_build] publish_pending outputs persist skipped:', outputsErr?.message ?? outputsErr);
      }

      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: created.jobId,
        toStatus: 'completed',
        fromStatus: 'running',
        actorType: 'worker',
        correlationId: created.generationRunId,
        reason: 'PUBLISH_PENDING',
        result: {
          ok: false,
          publishFailed: true,
          retryable: publishResult.retryable === true,
          draftId: draftIdForRun,
          error: publishResult.error ?? null,
          generationRunId: created.generationRunId,
        },
      }).catch(() => {});

      return {
        status: 'publish_pending',
        draftId: draftIdForRun,
        output: {
          ok: false,
          publishFailed: true,
          retryable: publishResult.retryable === true,
          draftId: draftIdForRun,
          generationRunId: created.generationRunId,
          jobId: created.jobId,
        },
        error: {
          code: 'PUBLISH_PENDING',
          message: publishResult.error ?? 'Publish failed',
        },
      };
    }

    storeId = publishResult.storeId ?? null;
    storeSlug = publishResult.storeSlug ?? null;
    if (checkpointLogoUrl && storeId) {
      try {
        const { applyCheckpointLogoToDraft } = await import('../../../services/draftStore/logoUpdateService.js');
        await applyCheckpointLogoToDraft({
          prisma,
          draftId: draftIdForRun,
          logoUrl: checkpointLogoUrl,
          storeId,
        });
      } catch (logoErr) {
        console.warn('[structured_store_build] checkpoint logo business sync skipped:', logoErr?.message ?? logoErr);
      }
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
    if (checkpointLogoUrl && storeId) {
      try {
        const { applyCheckpointLogoToDraft } = await import('../../../services/draftStore/logoUpdateService.js');
        await applyCheckpointLogoToDraft({
          prisma,
          draftId: draftIdForRun,
          logoUrl: checkpointLogoUrl,
          storeId,
        });
      } catch (logoErr) {
        console.warn('[structured_store_build] guest checkpoint logo sync skipped:', logoErr?.message ?? logoErr);
      }
    }
  }

  if (storeId) {
    await safeMissionPipelineUpdate(
      prisma,
      {
        where: { id: missionId },
        data: { targetType: 'store', targetId: storeId },
      },
      { missionId, label: 'structured_store_build.target' },
    );
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
      ...(checkpointLogoUrl ? { logoUrl: checkpointLogoUrl, logoApplied: true } : {}),
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
    await safeMissionPipelineUpdate(
      prisma,
      {
        where: { id: missionId },
        data: { outputsJson },
      },
      { missionId, label: 'structured_store_build.outputs' },
    );
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
      await safeMissionPipelineUpdate(
        prisma,
        {
          where: { id: missionId },
          data: { title: desired },
        },
        { missionId, label: 'structured_store_build.title' },
      );
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
  let serviceCount = 0;
  let catalogItemCount = 0;
  let catalogKind = 'product';
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
    const products = Array.isArray(preview.items)
      ? preview.items
      : Array.isArray(preview.catalog?.products)
        ? preview.catalog.products
        : [];
    const counts = countCatalogItemsByKind(products);
    catalogItemCount = counts.catalogItemCount;
    serviceCount = counts.serviceCount;
    productCount = counts.productCount;
    catalogKind =
      preview.meta?.catalogKind ??
      preview.meta?.businessCommerceProfile?.catalogKind ??
      (serviceCount > 0 && productCount === 0 ? 'service' : 'product');
    hasImages = products.some(
      (p) => p && typeof p === 'object' && typeof p.imageUrl === 'string' && p.imageUrl.trim().length > 0,
    );
  } catch (previewErr) {
    console.warn('[structured_store_build] COMPLETE preview read failed:', previewErr?.message ?? previewErr);
  }

  const previewUrl =
    draftIdForRun && created.generationRunId
      ? `/preview/website/${encodeURIComponent(draftIdForRun)}?generationRunId=${encodeURIComponent(created.generationRunId)}`
      : null;

  console.log('[structured_store_build] COMPLETE:', {
    ok: true,
    missionId,
    storeName: businessName || null,
    storeId,
    storeSlug,
    draftStoreId: draftIdForRun,
    generationRunId: created.generationRunId,
    catalogKind,
    catalogItemCount,
    serviceCount,
    productCount,
    hasImages,
    previewUrl,
    stepStatus: 'completed',
    projectionUpdated: true,
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
