/**
 * Business Activation Runway V2 — public preview + runtime-governed activation.
 * Never exposes ingestion internals in public preview responses.
 */

import { formatStoreLocation } from '../formatStoreLocation.js';
import { getSeedRecordById } from './IngestionRepository.js';
import {
  activateSeedAfterOwnerConfirmation,
  canPubliclyClaim,
} from './ClaimBridgeService.js';
import { resolveDiscoveryCardHero } from './DiscoveryCardHeroResolver.js';
import { buildPublicBusinessSlug } from './businessPublicSlug.js';
import {
  DISCOVERED_BUSINESS_BADGE,
  translateSeedToPublicLifecycle,
} from './publicLifecycle.js';
import type { IngestedSeedRecord, SeedVerificationStatus } from './types.js';
import { createMissionPipeline } from '../missionPipelineService.js';
import { createPerformerRuntimeContext } from '../runtime/performerRuntime/runtimeContext.js';
import { registerRuntimeContext } from '../runtime/performerRuntime/runtimeState.js';
import { markRuntimeOwnedContext } from '../runtime/performerRuntime/runtimeOwnership.js';
import { createSuitcaseItem } from '../../services/suitcase/suitcaseItemService.js';
import { emitSeedActivationActivity } from './activationActivityEmitter.js';
import type { PublicPreparedSuggestion } from './types.js';
import { getPublicPreparedSuggestionsForSeed } from './enrichmentPublic.js';
import {
  getPublicBusinessSnapshotForSeed,
  toPublicBusinessSnapshot,
} from './seedSuitcaseService.js';
import type { PublicBusinessSnapshot } from './types.js';
import { listEnrichmentCandidates } from './EnrichmentCandidateStore.js';
import { generateBusinessIntelligenceSnapshot } from './generateBusinessIntelligenceSnapshot.js';

export type ActivationRunwayStage =
  | 'discovered'
  | 'claimed'
  | 'verified'
  | 'activated'
  | 'operating';

export interface PublicActivationPreview {
  businessName: string;
  category: string | null;
  city: string | null;
  locationLabel: string | null;
  heroImageUrl: string;
  badge: string;
  runwayStage: ActivationRunwayStage;
  runwayStageLabel: string;
  profileSlug: string | null;
  canVerify: boolean;
  canActivate: boolean;
  isComplete: boolean;
  /**
   * V2.2 optional enrichment suggestions prepared for the owner.
   * Backward-compatible: omitted when none exist.
   */
  preparedSuggestions?: PublicPreparedSuggestion[];
  /** Phase V3 — Business Intelligence Snapshot (informational). */
  businessSnapshot?: PublicBusinessSnapshot;
}

export interface ActivateBusinessSpaceRunwayResult {
  ok: boolean;
  status: 'completed' | 'blocked' | 'failed';
  message: string;
  output?: {
    businessSpaceId: string | null;
    performerId: string;
    activationMissionId: string;
    profileSlug: string | null;
    suitcaseItemId: string | null;
  };
  error?: { code?: string; message?: string };
}

export const RUNWAY_STAGE_LABEL: Record<ActivationRunwayStage, string> = {
  discovered: 'Discovered',
  claimed: 'Claimed',
  verified: 'Verified',
  activated: 'Activated',
  operating: 'Operating',
};

function runwayStageFromSeed(seed: IngestedSeedRecord): ActivationRunwayStage {
  switch (seed.verificationStatus) {
    case 'active':
      return seed.storeId ? 'operating' : 'activated';
    case 'verified_owner':
      return 'verified';
    case 'seeded_claimable':
      return 'discovered';
    default:
      return 'discovered';
  }
}

export function buildPublicActivationPreview(seed: IngestedSeedRecord): PublicActivationPreview | null {
  const n = seed.normalized;
  if (!n.businessName) return null;

  const publicLifecycle = translateSeedToPublicLifecycle(seed.verificationStatus);
  if (!publicLifecycle && !canPubliclyClaim(seed).ok) return null;

  const locationLabel = formatStoreLocation({
    city: n.city,
    state: n.state,
    country: n.country,
    address: n.address,
  });
  const hero = resolveDiscoveryCardHero(seed);
  const runwayStage = runwayStageFromSeed(seed);
  const claimGate = canPubliclyClaim(seed);

  return {
    businessName: n.businessName,
    category: n.category,
    city: n.city,
    locationLabel,
    heroImageUrl: hero.heroImageUrl,
    badge: DISCOVERED_BUSINESS_BADGE,
    runwayStage,
    runwayStageLabel: RUNWAY_STAGE_LABEL[runwayStage],
    profileSlug: buildPublicBusinessSlug(seed),
    canVerify: claimGate.ok || seed.verificationStatus === 'verified_owner',
    canActivate: seed.verificationStatus === 'verified_owner',
    isComplete: seed.verificationStatus === 'active',
  };
}

export async function getPublicActivationPreviewBySeedId(
  seedId: string,
): Promise<{ ok: boolean; preview: PublicActivationPreview | null; message?: string }> {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, preview: null, message: 'Business not found.' };
  const preview = buildPublicActivationPreview(seed);
  if (!preview) return { ok: false, preview: null, message: 'Activation preview unavailable.' };
  try {
    const suggestions = await getPublicPreparedSuggestionsForSeed(seedId);
    let businessSnapshot = await getPublicBusinessSnapshotForSeed(seedId);
    if (!businessSnapshot) {
      const candidates = await listEnrichmentCandidates(seedId);
      const generated = generateBusinessIntelligenceSnapshot(seed, candidates);
      businessSnapshot = toPublicBusinessSnapshot(generated, seedId);
    }
    return {
      ok: true,
      preview: {
        ...preview,
        ...(Array.isArray(suggestions) && suggestions.length > 0
          ? { preparedSuggestions: suggestions }
          : {}),
        businessSnapshot,
      },
    };
  } catch {
    // Optional enrichment / BI view — never blocks activation preview.
  }
  return { ok: true, preview };
}

function assertActivationAllowed(
  seed: IngestedSeedRecord,
  userId: string,
): { ok: boolean; message: string } {
  if (seed.verificationStatus !== 'verified_owner') {
    return {
      ok: false,
      message: 'Complete ownership verification before activating your Business Space.',
    };
  }
  if (seed.ownerUserId && seed.ownerUserId !== userId) {
    return { ok: false, message: 'Only the verified owner may activate this Business Space.' };
  }
  return { ok: true, message: 'OK' };
}

/**
 * Runtime-governed activation runway — sole path for Business Space creation from discovery.
 */
export async function executeActivateBusinessSpaceRunway(params: {
  seedId: string;
  userId: string;
  confirmed?: boolean;
  missionId?: string | null;
  actorIsPlatformAdmin?: boolean;
}): Promise<ActivateBusinessSpaceRunwayResult> {
  const seedId = String(params.seedId ?? '').trim();
  const userId = String(params.userId ?? '').trim();
  if (!seedId || !userId) {
    return {
      ok: false,
      status: 'failed',
      message: 'Seed and authenticated user are required.',
      error: { code: 'invalid_params', message: 'Missing seedId or userId' },
    };
  }
  if (params.confirmed !== true) {
    return {
      ok: false,
      status: 'blocked',
      message: 'Owner confirmation is required before activation.',
      error: { code: 'confirmation_required', message: 'confirmed: true required' },
    };
  }

  const seed = await getSeedRecordById(seedId);
  if (!seed) {
    return {
      ok: false,
      status: 'failed',
      message: 'Business not found.',
      error: { code: 'not_found', message: 'Business not found' },
    };
  }

  const gate = assertActivationAllowed(seed, userId);
  if (!gate.ok && !params.actorIsPlatformAdmin) {
    emitSeedActivationActivity({
      type: 'activation_failed',
      seed,
      actorId: userId,
      severity: 'warning',
      title: 'Activation failed',
      message: gate.message,
      metadata: { code: 'activation_not_allowed' },
    });
    return {
      ok: false,
      status: 'blocked',
      message: gate.message,
      error: { code: 'activation_not_allowed', message: gate.message },
    };
  }

  emitSeedActivationActivity({
    type: 'business_activation_started',
    seed,
    actorId: userId,
    title: 'Business activation started',
    message: `${seed.normalized.businessName ?? 'Business'} activation runway started.`,
    metadata: { missionId: params.missionId ?? null },
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
      source: 'activate_business_space',
      seedId,
    },
    runtimeCtx.runtimeId,
  );

  let activationMissionId = params.missionId?.trim() || '';
  if (!activationMissionId) {
    const mission = await createMissionPipeline({
      type: 'store',
      title: `Activate Business Space: ${seed.normalized.businessName ?? 'Business'}`,
      createdBy: userId,
      metadata: {
        source: 'business_activation_runway',
        seedId,
        activationRunway: true,
        idempotencyKey: `activate-business-space:${seedId}:${userId}`,
      },
      requiresConfirmation: true,
      executionMode: 'MANUAL',
    });
    activationMissionId = mission?.id ?? '';
  }

  const activation = await activateSeedAfterOwnerConfirmation({
    seedId,
    ownerUserId: userId,
    confirmed: true,
    actorIsPlatformAdmin: params.actorIsPlatformAdmin,
  });

  if (!activation.ok || !activation.seed) {
    emitSeedActivationActivity({
      type: 'activation_failed',
      seed: activation.seed ?? seed,
      actorId: userId,
      severity: 'warning',
      title: 'Activation failed',
      message: activation.message,
      metadata: { duplicateBlocked: activation.duplicateBlocked ?? false },
    });
    return {
      ok: false,
      status: activation.duplicateBlocked ? 'blocked' : 'failed',
      message: activation.message,
      error: { code: 'activation_failed', message: activation.message },
    };
  }

  let suitcaseItemId: string | null = null;
  let biBriefing: import('./types.js').BusinessIntelligenceBriefing | null = null;
  try {
    const { migrateSeedSuitcaseToBusinessSpace } = await import('./seedSuitcaseService.js');
    const migration = await migrateSeedSuitcaseToBusinessSpace({
      seedId,
      storeId: activation.seed.storeId ?? '',
    });
    biBriefing = migration.briefing;
  } catch {
    biBriefing = null;
  }

  try {
    const suitcase = await createSuitcaseItem({
      ownerId: userId,
      sourceType: 'mission_output',
      contentType: 'json',
      title: `Business Space activated: ${activation.seed.normalized.businessName ?? 'Business'}`,
      idempotencyKey: `activation-runway:${seedId}:${userId}`,
      metadata: {
        seedId,
        storeId: activation.seed.storeId,
        missionId: activationMissionId,
        runway: 'business_activation_v2',
        biBriefing,
        seedSuitcaseMigrated: Boolean(biBriefing),
      },
    });
    suitcaseItemId = suitcase?.item?.id ?? null;
  } catch {
    suitcaseItemId = null;
  }

  const profileSlug = buildPublicBusinessSlug(activation.seed);

  return {
    ok: true,
    status: 'completed',
    message: 'Your Business Space is ready.',
    output: {
      businessSpaceId: activation.seed.storeId ?? null,
      performerId: runtimeCtx.runtimeId,
      activationMissionId,
      profileSlug,
      suitcaseItemId,
    },
  };
}

export async function recordPerformerOpenedAfterActivation(params: {
  seedId: string;
  userId: string;
  businessSpaceId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const seedId = String(params.seedId ?? '').trim();
  const userId = String(params.userId ?? '').trim();
  if (!seedId || !userId) {
    return { ok: false, message: 'seedId and userId are required.' };
  }

  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, message: 'Business not found.' };
  if (seed.ownerUserId && seed.ownerUserId !== userId) {
    return { ok: false, message: 'Only the verified owner may record this event.' };
  }

  emitSeedActivationActivity({
    type: 'performer_opened_after_activation',
    seed,
    actorId: userId,
    severity: 'success',
    title: 'Performer opened after activation',
    message: `${seed.normalized.businessName ?? 'Business'} owner opened Performer.`,
    metadata: { businessSpaceId: params.businessSpaceId ?? seed.storeId ?? null },
  });

  return { ok: true, message: 'Recorded.' };
}
