/**
 * UI Runtime Action Service — Sprint 2.
 * Routes UI-originated mutations through Performer Runtime without rewriting internals.
 */

import { getPrismaClient } from '../../prisma.js';
import { executeRuntimeAction } from './executeRuntimeAction.js';
import { recordRuntimeAuthorityPathUsed } from './runtimeAuthorityGuard.js';
import { updateHeroForStore, buildHeroPreviewPatchFromUrls } from '../../../services/draftStore/heroUpdateService.js';
import {
  buildLogoPreviewPatchFromUrl,
  updateLogoForStore,
} from '../../../services/draftStore/logoUpdateService.js';
import { getDraft } from '../../../services/draftStore/draftStoreService.js';
import { publishDraft } from '../../../services/draftStore/publishDraftService.js';
import {
  getPublishSnapshot,
  verifyPublishIdentity,
  snapshotToPreviewShape,
} from '../../../services/draftStore/publishSnapshotService.js';
import { enforcePublishHeroCanonical } from '../../../services/draftStore/heroPublishInvariant.js';
import { resolveDraftForStore } from '../../draftResolver.js';
import { UPLOAD_ACTIONS, isRuntimeUploadAction } from '../runtimeActionTypes.js';
import {
  executePublishThroughHybridRouter,
  HYBRID_UI_PUBLISH_ACTIONS,
} from '../../routing/uiHybridPublishBridge.js';

/**
 * @typedef {'update_hero_artifact'|'update_avatar_artifact'|'save_draft_preview'|'upload_hero_media'|'upload_logo'|'upload_avatar'|'publish_store'|'publish_cardbey'|'publish_custom_domain'|'publish_campaign'|'publish_explore'|'publish_signage'|'publish_social'|'render_creative_asset'|'activate_business_space'|'accept_enrichment_suggestion'|'generate_full_store_from_seed'} UiRuntimeActionType
 */

/**
 * @param {{
 *   action: UiRuntimeActionType;
 *   payload?: Record<string, unknown>;
 *   missionId?: string|null;
 *   userId?: string|null;
 *   tenantId?: string|null;
 *   storeId?: string|null;
 *   source?: string;
 * }} request
 */
export async function executeUiRuntimeAction(request) {
  const req = request && typeof request === 'object' ? request : {};
  const action = typeof req.action === 'string' ? req.action.trim() : '';
  const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
  const missionId = typeof req.missionId === 'string' ? req.missionId.trim() : '';
  const userId = typeof req.userId === 'string' ? req.userId.trim() : '';
  const source = typeof req.source === 'string' && req.source.trim() ? req.source.trim() : 'ui_runtime';

  if (!action) {
    return { ok: false, status: 'failed', error: { code: 'action_required', message: 'action is required' } };
  }

  if (isRuntimeUploadAction(action) && action !== UPLOAD_ACTIONS.PATCH_HERO && action !== UPLOAD_ACTIONS.PATCH_AVATAR && action !== UPLOAD_ACTIONS.SAVE_DRAFT_PREVIEW) {
    return {
      ok: false,
      status: 'failed',
      error: {
        code: 'multipart_upload_required',
        message: `Upload action "${action}" must use POST /api/performer/runtime/ui-action/upload-* multipart route`,
      },
    };
  }

  recordRuntimeAuthorityPathUsed({
    route: `/api/performer/runtime/ui-action/${action}`,
    toolName: action,
    userId: userId || null,
    missionId: missionId || null,
    source,
  });

  const runtimeEnvelope = await executeRuntimeAction({
    actionType: 'execute_action',
    actionId: `ui:${action}`,
    missionId: missionId || null,
    userId: userId || null,
    tenantId: req.tenantId ?? null,
    storeId: req.storeId ?? (typeof payload.storeId === 'string' ? payload.storeId : null),
    source,
    payload: { action, ...payload },
  });

  if (runtimeEnvelope.status === 'blocked') {
    return runtimeEnvelope;
  }

  if (HYBRID_UI_PUBLISH_ACTIONS.has(action)) {
    const prisma = getPrismaClient();
    const hybridResult = await executePublishThroughHybridRouter({
      action,
      payload,
      userId,
      directExecute: async (operationPayload) =>
        handlePublishStore(prisma, {
          payload: operationPayload,
          userId,
          missionId,
          entrypoint: action === 'publish_cardbey' ? 'mini_website_modal' : 'ui_runtime_publish_store',
        }),
    });

    if (hybridResult.status === 'review_complete') {
      return {
        ok: hybridResult.ok !== false,
        status: 'review_complete',
        agentReviewed: true,
        agentAssisted: hybridResult.agentAssisted === true,
        suggestions: hybridResult.suggestions ?? [],
        confirmationRequired: hybridResult.confirmationRequired === true,
        review: hybridResult.review ?? null,
        message: hybridResult.message ?? null,
        metadata: {
          ...(runtimeEnvelope.metadata ?? {}),
          action,
          executionSource: 'hybrid_router',
        },
      };
    }

    if (!hybridResult.ok) {
      return {
        ok: false,
        status: hybridResult.status || 'failed',
        error: hybridResult.error ?? { code: 'hybrid_publish_failed', message: 'Publish failed' },
        agentReviewed: hybridResult.agentReviewed,
        agentAssisted: hybridResult.agentAssisted,
        suggestions: hybridResult.suggestions,
        metadata: {
          ...(runtimeEnvelope.metadata ?? {}),
          action,
          executionSource: 'hybrid_router',
        },
      };
    }

    return {
      ok: true,
      status: 'completed',
      output: hybridResult.output,
      agentReviewed: hybridResult.agentReviewed === true,
      agentAssisted: hybridResult.agentAssisted === true,
      suggestions: hybridResult.suggestions,
      metadata: {
        ...(runtimeEnvelope.metadata ?? {}),
        action,
        executionSource: 'hybrid_router',
      },
    };
  }

  let output;
  try {
    output = await runUiActionAdapter(action, {
      payload,
      missionId,
      userId,
      tenantId: req.tenantId ?? null,
      storeId: req.storeId ?? (typeof payload.storeId === 'string' ? payload.storeId : null),
    });
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      error: {
        code: err?.code ?? 'ui_action_failed',
        message: err?.message ?? 'UI action failed',
      },
      metadata: runtimeEnvelope.metadata,
    };
  }

  return {
    ok: true,
    status: 'completed',
    output,
    metadata: {
      ...(runtimeEnvelope.metadata ?? {}),
      action,
      executionSource: 'performer_runtime',
    },
  };
}

/**
 * Internal adapters — existing publish/hero implementations unchanged.
 *
 * @param {string} action
 * @param {object} ctx
 */
async function runUiActionAdapter(action, ctx) {
  const prisma = getPrismaClient();
  const { payload, missionId, userId, storeId } = ctx;

  switch (action) {
    case 'update_hero_artifact':
      return handleUpdateHeroArtifact(prisma, { payload, userId, storeId, missionId });

    case 'update_avatar_artifact':
      return handleUpdateAvatarArtifact(prisma, { payload, userId, storeId, missionId });

    case 'save_draft_preview':
      return handleSaveDraftPreview(prisma, { payload, userId, missionId });

    case 'publish_store':
    case 'publish_cardbey':
      return handlePublishStore(prisma, {
        payload,
        userId,
        missionId,
        entrypoint: action === 'publish_cardbey' ? 'mini_website_modal' : 'ui_runtime_publish_store',
      });

    case 'publish_custom_domain':
      return handlePublishCustomDomain();

    case 'render_creative_asset':
      return handleRenderCreativeAsset({ payload, userId, missionId });

    case 'publish_signage': {
      const { publishToDevices } = await import('../../../engines/signage/index.js');
      const { getEventEmitter } = await import('../../../engines/signage/events.js');
      const input = payload.input && typeof payload.input === 'object' ? payload.input : payload;
      const engineCtx = {
        services: {
          db: prisma,
          events: getEventEmitter(),
        },
      };
      const result = await publishToDevices(input, engineCtx);
      if (!result.ok) {
        const err = new Error(result.error ?? 'signage_publish_failed');
        err.code = 'publish_signage_failed';
        throw err;
      }
      return result.data ?? result;
    }

    case 'publish_campaign':
    case 'publish_explore':
    case 'publish_social': {
      const toolName =
        action === 'publish_campaign'
          ? 'launch_campaign'
          : action === 'publish_explore'
            ? 'publish_explore'
            : 'publish_social';
      const { executeMissionAction } = await import('../../execution/executeMissionAction.js');
      const { markRuntimeOwnedContext } = await import('./runtimeOwnership.js');
      const ownedCtx = markRuntimeOwnedContext(
        {
          missionId,
          userId,
          storeId: storeId ?? payload.storeId ?? null,
          source: `ui_${action}`,
        },
        `ui-${missionId || 'anon'}`,
      );
      const result = await executeMissionAction({
        actionType: 'dispatch_tool',
        missionId,
        userId,
        storeId: storeId ?? payload.storeId ?? null,
        source: `ui_${action}`,
        payload: {
          toolName,
          input: payload,
          context: ownedCtx,
        },
      });
      if (result.status === 'failed' || result.status === 'blocked') {
        const err = new Error(result.error?.message ?? result.blocker?.message ?? `${action} failed`);
        err.code = result.error?.code ?? result.blocker?.code ?? `${action}_failed`;
        throw err;
      }
      return result.output ?? result;
    }

    case 'activate_business_space':
      return handleActivateBusinessSpace({ payload, userId, missionId });

    case 'setup_loyalty_program':
    case 'apply_loyalty_program':
    case 'publish_loyalty_program':
    case 'save_loyalty_draft':
    case 'save_to_suitcase':
    case 'publish_later': {
      const { executeSetupLoyaltyProgramRuntimeTool } = await import('./setupLoyaltyProgramRuntimeTool.js');
      const { persistLoyaltyProgramDraftToStore } = await import(
        '../../toolExecutors/loyalty/persistLoyaltyProgramDraftToStore.js'
      );
      const draft =
        payload.draft && typeof payload.draft === 'object'
          ? payload.draft
          : payload.loyaltyProgramDraft && typeof payload.loyaltyProgramDraft === 'object'
            ? payload.loyaltyProgramDraft
            : null;
      const preseededDraft =
        payload.preseededDraft && typeof payload.preseededDraft === 'object'
          ? payload.preseededDraft
          : null;
      if (action === 'save_loyalty_draft') {
        return persistLoyaltyProgramDraftToStore({
          missionId,
          storeId: storeId ?? payload.storeId ?? null,
          userId,
          tenantId: ctx.tenantId ?? null,
          draft: draft ?? preseededDraft ?? {},
          activate: false,
          source: typeof payload.source === 'string' ? payload.source : 'loyalty_program_draft_card',
        });
      }
      if (action === 'save_to_suitcase') {
        const { saveGeneratedLoyaltyToSuitcase } = await import(
          '../../toolExecutors/loyalty/saveGeneratedLoyaltyToSuitcase.js'
        );
        const { buildGeneratedLoyaltyProgramArtifact } = await import(
          '../../toolExecutors/loyalty/generatedLoyaltyProgramService.js'
        );
        const artifact = await buildGeneratedLoyaltyProgramArtifact({
          missionId,
          storeId: storeId ?? payload.storeId ?? null,
          draft: draft ?? preseededDraft ?? {},
        });
        return saveGeneratedLoyaltyToSuitcase({
          ownerId: userId,
          missionId,
          storeId: storeId ?? payload.storeId ?? null,
          artifact,
        });
      }
      if (action === 'publish_later') {
        return {
          ok: true,
          status: 'deferred',
          message: 'Loyalty program draft saved for later.',
        };
      }
      const publishNow = action === 'publish_loyalty_program';
      return executeSetupLoyaltyProgramRuntimeTool({
        missionId,
        storeId: storeId ?? payload.storeId ?? null,
        userId,
        tenantId: ctx.tenantId ?? null,
        source: typeof payload.source === 'string' ? payload.source : 'performer_quick_action',
        requirements: typeof payload.requirements === 'string' ? payload.requirements : null,
        confirmed:
          publishNow || action === 'apply_loyalty_program' || payload.confirmed === true || payload.apply === true,
        draft,
        loyaltyProgramDraft: draft,
        preseededDraft,
        payload: {
          ...(payload && typeof payload === 'object' ? payload : {}),
          ...(publishNow ? { publishNow: true, confirmed: true, apply: true } : {}),
        },
      });
    }

    case 'accept_enrichment_suggestion':
      return handleAcceptEnrichmentSuggestion({ payload, userId, missionId });

    case 'generate_full_store_from_seed':
      return handleGenerateFullStoreFromSeed({ payload, userId, missionId, source });

    default: {
      const err = new Error(`Unknown UI runtime action: ${action}`);
      err.code = 'unknown_ui_action';
      throw err;
    }
  }
}

async function handleUpdateHeroArtifact(prisma, { payload, userId, storeId, missionId }) {
  const draftId = typeof payload.draftId === 'string' ? payload.draftId.trim() : '';
  const generationRunId =
    typeof payload.generationRunId === 'string' ? payload.generationRunId.trim() : null;
  const imageUrl =
    (typeof payload.heroImageUrl === 'string' && payload.heroImageUrl.trim()) ||
    (typeof payload.imageUrl === 'string' && payload.imageUrl.trim()) ||
    null;
  const videoUrl = typeof payload.videoUrl === 'string' ? payload.videoUrl.trim() : null;
  const source = typeof payload.source === 'string' ? payload.source.trim() : 'ui_runtime';

  let draft = null;
  if (draftId) {
    draft = await getDraft(draftId);
  } else if (storeId) {
    const resolved = await resolveDraftForStore(prisma, storeId, generationRunId);
    draft = resolved?.draft ?? null;
  }

  if (!draft?.id) {
    const err = new Error('Draft not found for hero update');
    err.code = 'draft_not_found';
    throw err;
  }

  const existingPreview =
    typeof draft.preview === 'string'
      ? (() => {
          try {
            return JSON.parse(draft.preview);
          } catch {
            return {};
          }
        })()
      : draft.preview || {};

  const heroPatch = buildHeroPreviewPatchFromUrls({
    imageUrl,
    videoUrl,
    source,
    existingPreview,
    heroWriteIntent: payload.heroWriteIntent,
    allowReplaceVideoWithImage: payload.allowReplaceVideoWithImage === true,
  });

  if (!Object.keys(heroPatch).length) {
    const err = new Error('No hero fields to update');
    err.code = 'no_hero_patch';
    throw err;
  }

  const storeIdParam =
    storeId && storeId !== 'temp' ? storeId : draft.committedStoreId;

  const heroResult = await updateHeroForStore({
    prisma,
    userId,
    storeId: storeIdParam,
    draftId: draft.id,
    generationRunId,
    missionId: missionId || payload.missionId || null,
    previewPatch: heroPatch,
    source,
  });

  return {
    draftId: draft.id,
    ...heroResult,
    hero: heroPatch.hero,
    heroImageUrl: heroResult?.heroImageUrl ?? heroPatch.heroImageUrl,
    heroVideoUrl: heroResult?.heroVideoUrl ?? heroPatch.heroVideo,
    heroMediaType: heroResult?.heroMediaType ?? heroPatch.heroMediaType ?? null,
  };
}

async function handleUpdateAvatarArtifact(prisma, { payload, userId, storeId, missionId }) {
  const draftId = typeof payload.draftId === 'string' ? payload.draftId.trim() : '';
  const generationRunId =
    typeof payload.generationRunId === 'string' ? payload.generationRunId.trim() : null;
  const avatarImageUrl =
    (typeof payload.avatarImageUrl === 'string' && payload.avatarImageUrl.trim()) ||
    (typeof payload.imageUrl === 'string' && payload.imageUrl.trim()) ||
    null;

  if (!avatarImageUrl) {
    const err = new Error('Provide avatarImageUrl or imageUrl');
    err.code = 'no_avatar_url';
    throw err;
  }

  let draft = null;
  if (draftId) {
    draft = await getDraft(draftId);
  } else if (storeId) {
    const resolved = await resolveDraftForStore(prisma, storeId, generationRunId);
    draft = resolved?.draft ?? null;
  }

  if (!draft?.id) {
    const err = new Error('Draft not found for avatar update');
    err.code = 'draft_not_found';
    throw err;
  }

  const storeIdParam =
    storeId && storeId !== 'temp' ? storeId : draft.committedStoreId ?? storeId;

  const logoResult = await updateLogoForStore({
    prisma,
    userId,
    storeId: storeIdParam,
    draftId: draft.id,
    generationRunId,
    logoUrl: avatarImageUrl,
  });

  const updated = await getDraft(draft.id);
  const existingPreview =
    typeof updated.preview === 'string'
      ? (() => {
          try {
            return JSON.parse(updated.preview);
          } catch {
            return {};
          }
        })()
      : updated.preview || {};
  const previewPatch = buildLogoPreviewPatchFromUrl(avatarImageUrl, existingPreview);

  return {
    ok: true,
    draftId: updated.id,
    status: updated.status,
    ...logoResult,
    avatarUrl: previewPatch.avatarUrl ?? avatarImageUrl,
    avatar:
      previewPatch.avatar ??
      { imageUrl: avatarImageUrl, url: avatarImageUrl, source: 'upload', type: 'image' },
    avatarImageUrl: logoResult.avatarImageUrl ?? avatarImageUrl,
    missionId: missionId || null,
  };
}

async function handleSaveDraftPreview(prisma, { payload, userId, missionId }) {
  const draftId = typeof payload.draftId === 'string' ? payload.draftId.trim() : '';
  const preview = payload.preview && typeof payload.preview === 'object' ? payload.preview : null;

  if (!draftId) {
    const err = new Error('draftId is required');
    err.code = 'draft_id_required';
    throw err;
  }
  if (!preview) {
    const err = new Error('preview object is required');
    err.code = 'preview_required';
    throw err;
  }

  const existingDraft = await getDraft(draftId);
  if (!existingDraft) {
    const err = new Error('Draft store not found or expired');
    err.code = 'draft_not_found';
    throw err;
  }

  const { canAccessDraftStore } = await import('../../draftOwnership.js');
  const allowed = await canAccessDraftStore(existingDraft, {
    userId,
    tenantKey: userId,
    isSuperAdmin: false,
  });
  if (!allowed) {
    const err = new Error('You do not have access to this draft.');
    err.code = 'forbidden';
    throw err;
  }

  const { patchDraftPreview } = await import('../../../services/draftStore/draftStoreService.js');
  const patched = await patchDraftPreview(draftId, preview);

  return {
    ok: true,
    draftId: patched.id,
    status: patched.status,
    preview: patched.preview,
    mode: patched.mode,
    input: patched.input,
    error: patched.error,
    missionId: missionId || null,
  };
}

async function handlePublishStore(prisma, { payload, userId, missionId, entrypoint = 'ui_runtime_publish_store' }) {
  const storeId = typeof payload.storeId === 'string' ? payload.storeId.trim() : '';
  const draftId =
    (typeof payload.draftId === 'string' && payload.draftId.trim()) ||
    (typeof payload.draftStoreId === 'string' && payload.draftStoreId.trim()) ||
    '';
  const generationRunId =
    typeof payload.generationRunId === 'string' ? payload.generationRunId.trim() : null;
  let hasSnapshotContract =
    draftId &&
    (payload.expectedSnapshotVersion != null ||
      typeof payload.expectedSourceFingerprint === 'string');
  let resolvedPublishSnapshot = null;

  if (draftId && !hasSnapshotContract) {
    const { isPublishSnapshotV1Enabled } = await import(
      '../../../services/draftStore/publishSnapshotService.js'
    );
    if (isPublishSnapshotV1Enabled()) {
      try {
        const { snapshot } = await getPublishSnapshot(prisma, draftId);
        if (snapshot?.version != null) {
          hasSnapshotContract = true;
          resolvedPublishSnapshot = snapshot;
          payload = {
            ...payload,
            expectedDraftId: draftId,
            expectedGenerationRunId: snapshot.generationRunId ?? generationRunId,
            expectedSnapshotVersion: snapshot.version,
            expectedSourceFingerprint: snapshot.sourceFingerprint,
            storeId: storeId || snapshot.storeId || 'temp',
          };
        }
      } catch {
        /* fall through to legacy publish */
      }
    }
  }

  if (hasSnapshotContract) {
    const published = await handlePublishStoreFromSnapshot(prisma, {
      payload,
      userId,
      missionId,
      draftId,
      resolvedSnapshot: resolvedPublishSnapshot,
      entrypoint: entrypoint === 'mini_website_modal' ? 'mini_website_modal' : 'ui_runtime_publish_snapshot',
    });
    if (entrypoint === 'mini_website_modal') {
      const { publicWebBase } = await import('../../../utils/publicWebBase.js');
      const webBase = publicWebBase();
      const slug = published.slug ?? null;
      const publicUrl =
        published.storefrontUrl ??
        (slug
          ? `${webBase}/s/${encodeURIComponent(slug)}`
          : published.storeId
            ? `${webBase}/preview/store/${published.storeId}?view=public`
            : null);
      return {
        ...published,
        url: publicUrl,
        publishedSiteId: published.storeId ?? null,
        storefrontUrl: publicUrl,
      };
    }
    return published;
  }

  const resolvedStoreId = storeId || (draftId ? 'temp' : '');
  if (!resolvedStoreId) {
    const err = new Error('storeId is required');
    err.code = 'store_id_required';
    throw err;
  }

  const result = await publishDraft(prisma, {
    storeId: resolvedStoreId,
    userId,
    draftId: draftId || null,
    generationRunId,
    entrypoint,
  });

  return { ...result, missionId: missionId || null };
}

function handlePublishCustomDomain() {
  const err = new Error('Custom domain publishing is not available yet. Use Publish on Cardbey.');
  err.code = 'not_implemented';
  throw err;
}

async function handleRenderCreativeAsset({ payload, userId, missionId }) {
  const { randomUUID } = await import('crypto');
  const { registerGeneratedArtifactV1 } = await import('../../artifacts/generatedArtifactAuthority.js');
  const artifactId = `gart-${randomUUID()}`;
  const settings =
    payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const attach = payload.attach === true || payload.publish === true;
  const artifactType = attach ? 'generated_video' : 'generated_graphic';

  if (!missionId) {
    const err = new Error('Active mission is required for server render');
    err.code = 'mission_id_required';
    throw err;
  }
  if (!userId) {
    const err = new Error('Authentication required for server render');
    err.code = 'auth_required';
    throw err;
  }

  const record = await registerGeneratedArtifactV1({
    artifactId,
    artifactType,
    missionId,
    ownerUserId: userId,
    source: typeof payload.source === 'string' ? payload.source : 'content_studio_render',
    status: 'processing',
    payload: {
      settings,
      hasRenderSlide: Boolean(payload.renderSlide),
      attach,
    },
  });

  return {
    id: record.artifactId,
    artifactId: record.artifactId,
    status: record.status,
    artifactType: record.artifactType,
    message: 'Render recorded via runtime authority; client export may continue if server render unavailable',
    capabilityGap: true,
  };
}

async function handlePublishStoreFromSnapshot(
  prisma,
  {
    payload,
    userId,
    missionId,
    draftId,
    entrypoint = 'ui_runtime_publish_snapshot',
    resolvedSnapshot = null,
  },
) {
  const draft = await getDraft(draftId);
  if (!draft) {
    const err = new Error('Draft not found');
    err.code = 'draft_not_found';
    throw err;
  }

  const snapshot =
    resolvedSnapshot ?? (await getPublishSnapshot(prisma, draftId)).snapshot;
  verifyPublishIdentity(snapshot, {
    expectedDraftId: payload.expectedDraftId ?? draftId,
    expectedGenerationRunId: payload.expectedGenerationRunId ?? payload.generationRunId ?? null,
    expectedSnapshotVersion: payload.expectedSnapshotVersion ?? snapshot.version,
    expectedSourceFingerprint: payload.expectedSourceFingerprint ?? snapshot.sourceFingerprint,
  });

  const previewRaw =
    typeof draft.preview === 'string'
      ? (() => {
          try {
            return JSON.parse(draft.preview);
          } catch {
            return {};
          }
        })()
      : draft.preview || {};
  enforcePublishHeroCanonical(previewRaw, { source: 'ui_runtime_publish_draft_preview' });
  const previewOverride = snapshotToPreviewShape(snapshot);
  if (previewRaw.heroVideoUrl || previewRaw.heroMediaType === 'video') {
    previewOverride.heroVideoUrl = previewRaw.heroVideoUrl;
    previewOverride.heroVideo = previewRaw.heroVideo;
    previewOverride.heroMediaType = previewRaw.heroMediaType;
    previewOverride.heroPosterUrl = previewRaw.heroPosterUrl;
    previewOverride.heroPoster = previewRaw.heroPoster;
    if (previewRaw.hero && typeof previewRaw.hero === 'object') {
      previewOverride.hero = { ...previewRaw.hero };
    }
  }
  enforcePublishHeroCanonical(previewOverride, { source: 'ui_runtime_publish_snapshot' });

  const storeId =
    typeof payload.storeId === 'string' && payload.storeId.trim()
      ? payload.storeId.trim()
      : snapshot.storeId && snapshot.storeId !== 'temp'
        ? snapshot.storeId
        : 'temp';

  const result = await publishDraft(prisma, {
    storeId,
    draftId,
    generationRunId:
      payload.expectedGenerationRunId ||
      payload.generationRunId ||
      snapshot.generationRunId,
    userId,
    entrypoint,
    canonicalPreviewOverride: previewOverride,
    expectedStoreId:
      storeId && storeId !== 'temp'
        ? storeId
        : snapshot.storeId && snapshot.storeId !== 'temp'
          ? snapshot.storeId
          : undefined,
  });

  return { ...result, missionId: missionId || snapshot.missionId || null };
}

async function handleActivateBusinessSpace({ payload, userId, missionId }) {
  const seedId = typeof payload.seedId === 'string' ? payload.seedId.trim() : '';
  if (!seedId) {
    const err = new Error('seedId is required');
    err.code = 'seed_id_required';
    throw err;
  }
  if (!userId) {
    const err = new Error('Authentication required');
    err.code = 'auth_required';
    throw err;
  }
  const { executeActivateBusinessSpaceCapability } = await import('./executeActivateBusinessSpaceCapability.js');
  const result = await executeActivateBusinessSpaceCapability({
    missionId: missionId || null,
    seedId,
    userId,
    confirmed: payload.confirmed === true,
  });
  if (!result.ok) {
    const err = new Error(result.message ?? 'Activation failed');
    err.code = result.code ?? 'activate_business_space_failed';
    throw err;
  }
  return result;
}

async function handleAcceptEnrichmentSuggestion({ payload, userId, missionId }) {
  const seedId = typeof payload.seedId === 'string' ? payload.seedId.trim() : '';
  if (!seedId) {
    const err = new Error('seedId is required');
    err.code = 'seed_id_required';
    throw err;
  }
  if (!userId) {
    const err = new Error('Authentication required');
    err.code = 'auth_required';
    throw err;
  }
  const candidateIds = Array.isArray(payload.candidateIds)
    ? payload.candidateIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  const { executeAcceptEnrichmentCapability } = await import('./executeAcceptEnrichmentCapability.js');
  const result = await executeAcceptEnrichmentCapability({
    missionId: missionId || null,
    seedId,
    userId,
    candidateIds,
    confirmed: payload.confirmed === true,
  });
  if (!result.ok) {
    const err = new Error(result.message ?? 'Accept enrichment failed');
    err.code = result.code ?? 'accept_enrichment_failed';
    throw err;
  }
  return result;
}

async function handleGenerateFullStoreFromSeed({ payload, userId, missionId, source }) {
  const seedId = typeof payload.seedId === 'string' ? payload.seedId.trim() : '';
  if (!seedId) {
    const err = new Error('seedId is required');
    err.code = 'seed_id_required';
    throw err;
  }
  const batchId = typeof payload.batchId === 'string' ? payload.batchId.trim() : '';
  const actionSource =
    typeof payload.source === 'string' && payload.source.trim() ? payload.source.trim() : source;
  const { executeGenerateFullStoreFromSeedCapability } = await import(
    './executeGenerateFullStoreFromSeedCapability.js'
  );
  const result = await executeGenerateFullStoreFromSeedCapability({
    missionId: missionId || null,
    seedId,
    userId: userId || null,
    batchId: batchId || null,
    source: actionSource,
  });
  if (!result.ok) {
    const err = new Error(result.message ?? 'Store generation failed');
    err.code = result.code ?? 'performer_store_generation_failed';
    throw err;
  }
  return result;
}
