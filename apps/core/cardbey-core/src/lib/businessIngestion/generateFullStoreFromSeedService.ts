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
  createDraft,
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
import type { IngestedSeedRecord } from './types.js';

export type GenerateFullStoreFromSeedResult = {
  ok: boolean;
  status: 'completed' | 'blocked' | 'failed';
  message: string;
  output?: {
    missionId: string;
    draftStoreId: string;
    performerId: string;
    status: string;
    nextRoute: string;
  };
  error?: { code?: string; message?: string };
};

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

  if (!seedId) {
    return {
      ok: false,
      status: 'failed',
      message: 'seedId is required.',
      error: { code: 'seed_id_required', message: 'seedId is required.' },
    };
  }

  const seed = await getSeedRecordById(seedId);
  if (!seed?.normalized?.businessName) {
    return {
      ok: false,
      status: 'failed',
      message: 'Business not found.',
      error: { code: 'not_found', message: 'Business not found.' },
    };
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
    actorId: userId || null,
    title: 'Performer store generation started',
    message: `Preparing a full draft store for ${seed.normalized.businessName}.`,
    metadata: { batchId: resolvedBatchId, source },
  });

  const runtimeCtx = createPerformerRuntimeContext({
    userId: userId || null,
    missionId: params.missionId ?? null,
  });
  registerRuntimeContext(runtimeCtx);
  markRuntimeOwnedContext(
    {
      missionId: params.missionId ?? null,
      userId: userId || null,
      source: 'generate_full_store_from_seed',
      seedId,
    },
    runtimeCtx.runtimeId,
  );

  let missionId = params.missionId?.trim() || '';
  if (!missionId) {
    const mission = await createMissionPipeline({
      type: 'store',
      title: `Generate store: ${seed.normalized.businessName}`,
      createdBy: userId || null,
      metadata: {
        source: 'business_activation',
        seedId,
        batchId: resolvedBatchId,
        activationPage: true,
        idempotencyKey: `generate-full-store:${seedId}:${userId || 'guest'}`,
      },
      requiresConfirmation: false,
      executionMode: 'AUTO_RUN',
    });
    missionId = mission?.id ?? '';
  }

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

  try {
    const draft = userId
      ? await createDraftStoreForUser(prisma, {
          user: { id: userId },
          userId,
          tenantKey: userId,
          input,
          expiresAt,
          mode: 'ai',
          status: 'draft',
        })
      : await createDraft({
          mode: 'ai',
          input,
          meta: {
            ownerUserId: null,
            guestSessionId: `seed:${seedId}`,
          },
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

    await generateDraft(draft.id, { userId: userId || null, missionId });

    const refreshed = await getDraft(draft.id);
    const draftStatus = refreshed?.status ?? 'ready';

    await appendPerformerHandoffToSeedSuitcase(seedId, {
      type: 'performer_store_draft_created',
      seedId,
      missionId,
      draftStoreId: draft.id,
      createdAt: new Date().toISOString(),
    });

    emitSeedActivationActivity({
      type: 'performer_store_draft_created',
      seed,
      actorId: userId || null,
      severity: 'success',
      title: 'Performer draft store created',
      message: `Draft store ready for ${seed.normalized.businessName}.`,
      metadata: { missionId, draftStoreId: draft.id, batchId: resolvedBatchId },
    });

    const nextRoute = buildNextRoute(missionId, seedId, draft.id);

    return {
      ok: true,
      status: 'completed',
      message: 'Draft created. Review your store.',
      output: {
        missionId,
        draftStoreId: draft.id,
        performerId: runtimeCtx.runtimeId,
        status: draftStatus,
        nextRoute,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Store generation failed.';
    emitSeedActivationActivity({
      type: 'performer_store_generation_failed',
      seed,
      actorId: userId || null,
      severity: 'warning',
      title: 'Performer store generation failed',
      message,
      metadata: { missionId, batchId: resolvedBatchId, source },
    });
    return {
      ok: false,
      status: 'failed',
      message,
      error: {
        code:
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: string }).code)
            : 'performer_store_generation_failed',
        message,
      },
    };
  }
}
