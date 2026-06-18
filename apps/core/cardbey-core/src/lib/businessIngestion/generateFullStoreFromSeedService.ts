/**
 * Generate full draft store from discovery seed — governed Performer runway.
 * Draft only: never publishes, activates, or claims ownership.
 */

import { formatStoreLocation } from '../formatStoreLocation.js';
import { getPrismaClient } from '../prisma.js';
import { createMissionPipeline } from '../missionPipelineService.js';
import { createPerformerRuntimeContext } from '../runtime/performerRuntime/runtimeContext.js';
import { registerRuntimeContext } from '../runtime/performerRuntime/runtimeState.js';
import { markRuntimeOwnedContext } from '../runtime/performerRuntime/runtimeOwnership.js';
import {
  createDraftStoreForUser,
  generateDraft,
  getDraft,
} from '../../services/draftStore/draftStoreService.js';
import { getSeedRecordById } from './IngestionRepository.js';
import { buildSeedStoreDraft, buildSeedStorePreview } from './SeedStoreBuilder.js';
import { emitSeedActivationActivity } from './activationActivityEmitter.js';
import {
  appendPerformerHandoffToSeedSuitcase,
  getPublicBusinessSnapshotForSeed,
  toPublicBusinessSnapshot,
} from './seedSuitcaseService.js';
import { generateBusinessIntelligenceSnapshot } from './generateBusinessIntelligenceSnapshot.js';
import { listEnrichmentCandidates } from './EnrichmentCandidateStore.js';
import { logStoreBuild } from './storeBuildTrace.js';
import { scoreDraftPackageCompleteness } from './scoreDraftPackageCompleteness.js';
import type { IngestedSeedRecord } from './types.js';

export type StoreBuildFailureStage =
  | 'auth_required'
  | 'mission_creation_failed'
  | 'draft_creation_failed'
  | 'draft_generation_failed'
  | 'draft_retrieval_failed'
  | 'draft_quality_failed';

export type GenerateFullStoreFromSeedResult = {
  ok: boolean;
  status: 'completed' | 'blocked' | 'failed';
  message: string;
  failureStage?: StoreBuildFailureStage;
  output?: {
    missionId: string;
    draftStoreId: string;
    performerId: string;
    status: string;
    nextRoute: string;
    completenessScore: number;
  };
  error?: { code?: string; message?: string; stage?: StoreBuildFailureStage };
};

const MIN_DRAFT_COMPLETENESS = 50;

function buildGenerationPrompt(seed: IngestedSeedRecord, snapshotSummary: string): string {
  const n = seed.normalized;
  const parts = [
    n.businessName,
    n.category ? `Category: ${n.category}` : null,
    n.address ? `Address: ${n.address}` : null,
    n.website ? `Website: ${n.website}` : null,
    n.phone ? `Phone: ${n.phone}` : null,
    snapshotSummary,
    'Generate a complete draft store/website with hero, about, services/menu placeholders, contact section, first offer idea, and promotion suggestion. Draft only — owner will review before publishing.',
  ].filter(Boolean);
  return parts.join('. ');
}

function buildNextRoute(missionId: string, seedId: string, draftStoreId: string): string {
  const qs = new URLSearchParams({
    draftId: draftStoreId,
    missionId,
    seedId,
  });
  return `/app/store/draft/review?${qs.toString()}`;
}

function failResult(
  stage: StoreBuildFailureStage,
  message: string,
  code: string,
  trace: {
    seedId?: string;
    missionId?: string | null;
    draftId?: string | null;
    userId?: string | null;
    source?: string;
  },
): GenerateFullStoreFromSeedResult {
  logStoreBuild('STORE_BUILD_FAILED', {
    seedId: trace.seedId,
    missionId: trace.missionId,
    draftId: trace.draftId,
    userId: trace.userId,
    stage,
    message,
    source: trace.source,
  });
  return {
    ok: false,
    status: 'failed',
    message,
    failureStage: stage,
    error: { code, message, stage },
  };
}

export async function executeGenerateFullStoreFromSeedRunway(params: {
  seedId: string;
  userId?: string | null;
  batchId?: string | null;
  source?: string;
  missionId?: string | null;
}): Promise<GenerateFullStoreFromSeedResult> {
  const seedId = String(params.seedId ?? '').trim();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const batchId = typeof params.batchId === 'string' ? params.batchId.trim() : '';
  const source = typeof params.source === 'string' && params.source.trim() ? params.source.trim() : 'activation_page';

  logStoreBuild('STORE_BUILD_START', { seedId, userId: userId || null, source });

  if (!seedId) {
    return failResult('draft_creation_failed', 'seedId is required.', 'seed_id_required', { seedId, source });
  }

  if (!userId) {
    return failResult(
      'auth_required',
      'Please sign in to let Performer build your draft store.',
      'AUTH_REQUIRED_FOR_AI',
      { seedId, source },
    );
  }

  const seed = await getSeedRecordById(seedId);
  if (!seed?.normalized?.businessName) {
    return failResult('draft_creation_failed', 'Business not found.', 'not_found', {
      seedId,
      userId,
      source,
    });
  }

  const resolvedBatchId = batchId || seed.batchId || seed.campaignId || null;
  let businessSnapshot = await getPublicBusinessSnapshotForSeed(seedId);
  if (!businessSnapshot) {
    const candidates = await listEnrichmentCandidates(seedId);
    const generated = generateBusinessIntelligenceSnapshot(seed, candidates);
    businessSnapshot = toPublicBusinessSnapshot(generated, seedId);
  }

  emitSeedActivationActivity({
    type: 'performer_store_generation_started',
    seed,
    actorId: userId,
    title: 'Performer store generation started',
    message: `Preparing a full draft store for ${seed.normalized.businessName}.`,
    metadata: { batchId: resolvedBatchId, source },
  });

  const runtimeCtx = createPerformerRuntimeContext({
    userId,
    missionId: params.missionId ?? null,
  });
  registerRuntimeContext(runtimeCtx);
  markRuntimeOwnedContext(
    {
      missionId: params.missionId ?? null,
      userId,
      source: 'generate_full_store_from_seed',
      seedId,
    },
    runtimeCtx.runtimeId,
  );

  let missionId = params.missionId?.trim() || '';
  if (!missionId) {
    try {
      const mission = await createMissionPipeline({
        type: 'store',
        title: `Generate store: ${seed.normalized.businessName}`,
        createdBy: userId,
        metadata: {
          source: 'business_activation',
          seedId,
          batchId: resolvedBatchId,
          activationPage: true,
          idempotencyKey: `generate-full-store:${seedId}:${userId}`,
        },
        requiresConfirmation: false,
        executionMode: 'AUTO_RUN',
      });
      missionId = mission?.id ?? '';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Mission creation failed.';
      return failResult('mission_creation_failed', message, 'mission_creation_failed', {
        seedId,
        userId,
        source,
      });
    }
  }

  if (!missionId) {
    return failResult(
      'mission_creation_failed',
      'Mission creation failed.',
      'mission_creation_failed',
      { seedId, userId, source },
    );
  }

  logStoreBuild('STORE_BUILD_MISSION_CREATED', {
    seedId,
    missionId,
    userId,
    source,
  });

  await appendPerformerHandoffToSeedSuitcase(seedId, {
    type: 'performer_store_generation_started',
    seedId,
    missionId,
    createdAt: new Date().toISOString(),
  });

  const locationLabel = formatStoreLocation({
    city: seed.normalized.city,
    state: seed.normalized.state,
    country: seed.normalized.country,
    address: seed.normalized.address,
  });
  const seedDraft = buildSeedStoreDraft(seed);
  const baselinePreview = seedDraft ? buildSeedStorePreview(seedDraft) : null;

  const input = {
    businessName: seed.normalized.businessName,
    businessType: seed.normalized.category ?? 'general',
    location: locationLabel,
    prompt: buildGenerationPrompt(seed, businessSnapshot.summary),
    missionId,
    seedId,
    batchId: resolvedBatchId,
    source: 'business_activation',
    ingestionSeedId: seedId,
    businessSnapshot,
    baselinePreview,
    website: seed.normalized.website ?? null,
    phone: seed.normalized.phone ?? null,
    email: seed.normalized.email ?? null,
  };

  const prisma = getPrismaClient();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  let draftId = '';
  try {
    const draft = await createDraftStoreForUser(prisma, {
      user: { id: userId },
      userId,
      tenantKey: userId,
      input,
      expiresAt,
      mode: 'ai',
      status: 'draft',
    });
    draftId = draft.id;

    logStoreBuild('STORE_BUILD_DRAFT_CREATED', {
      seedId,
      missionId,
      draftId,
      userId,
      source,
    });

    if (baselinePreview) {
      await prisma.draftStore.update({
        where: { id: draft.id },
        data: {
          preview: baselinePreview,
          publishSnapshot: baselinePreview,
          publishSnapshotVersion: 1,
        },
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Draft creation failed.';
    return failResult('draft_creation_failed', message, 'draft_creation_failed', {
      seedId,
      missionId,
      userId,
      source,
    });
  }

  try {
    await generateDraft(draftId, { userId, reactMissionId: missionId });
    logStoreBuild('STORE_BUILD_DRAFT_GENERATED', {
      seedId,
      missionId,
      draftId,
      userId,
      source,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Draft generation failed.';
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : 'draft_generation_failed';
    const stage: StoreBuildFailureStage =
      code === 'AUTH_REQUIRED_FOR_AI' ? 'auth_required' : 'draft_generation_failed';
    emitSeedActivationActivity({
      type: 'performer_store_generation_failed',
      seed,
      actorId: userId,
      severity: 'warning',
      title: 'Performer store generation failed',
      message,
      metadata: { missionId, draftId, batchId: resolvedBatchId, source, stage },
    });
    return failResult(stage, message, code, { seedId, missionId, draftId, userId, source });
  }

  const refreshed = await getDraft(draftId);
  if (!refreshed) {
    return failResult(
      'draft_retrieval_failed',
      'Draft retrieval failed.',
      'draft_retrieval_failed',
      { seedId, missionId, draftId, userId, source },
    );
  }

  if (refreshed.status === 'failed') {
    const message =
      typeof refreshed.error === 'string' && refreshed.error.trim()
        ? refreshed.error
        : 'Draft generation failed.';
    return failResult('draft_generation_failed', message, 'draft_generation_failed', {
      seedId,
      missionId,
      draftId,
      userId,
      source,
    });
  }

  const completeness = scoreDraftPackageCompleteness(refreshed.preview);
  if (completeness.score < MIN_DRAFT_COMPLETENESS) {
    const message = 'Draft created but requires additional generation.';
    logStoreBuild('STORE_BUILD_FAILED', {
      seedId,
      missionId,
      draftId,
      userId,
      stage: 'draft_quality_failed',
      completenessScore: completeness.score,
      message,
      source,
    });
    return {
      ok: false,
      status: 'failed',
      message,
      failureStage: 'draft_quality_failed',
      error: {
        code: 'draft_quality_insufficient',
        message,
        stage: 'draft_quality_failed',
      },
      output: {
        missionId,
        draftStoreId: draftId,
        performerId: runtimeCtx.runtimeId,
        status: refreshed.status ?? 'ready',
        nextRoute: buildNextRoute(missionId, seedId, draftId),
        completenessScore: completeness.score,
      },
    };
  }

  await appendPerformerHandoffToSeedSuitcase(seedId, {
    type: 'performer_store_draft_created',
    seedId,
    missionId,
    draftStoreId: draftId,
    createdAt: new Date().toISOString(),
  });

  emitSeedActivationActivity({
    type: 'performer_store_draft_created',
    seed,
    actorId: userId,
    severity: 'success',
    title: 'Performer draft store created',
    message: `Draft store ready for ${seed.normalized.businessName}.`,
    metadata: { missionId, draftStoreId: draftId, batchId: resolvedBatchId, completenessScore: completeness.score },
  });

  const nextRoute = buildNextRoute(missionId, seedId, draftId);
  logStoreBuild('STORE_BUILD_REDIRECT', {
    seedId,
    missionId,
    draftId,
    userId,
    completenessScore: completeness.score,
    message: nextRoute,
    source,
  });

  return {
    ok: true,
    status: 'completed',
    message: 'Draft created. Review your store.',
    output: {
      missionId,
      draftStoreId: draftId,
      performerId: runtimeCtx.runtimeId,
      status: refreshed.status ?? 'ready',
      nextRoute,
      completenessScore: completeness.score,
    },
  };
}
