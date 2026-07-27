/**
 * Link an ingestion seed to a published store after draft publish.
 * Retires claimable discovery cards without faking ownership verification.
 */

import type { IngestedSeedRecord } from './types.js';
import { getSeedRecordById, upsertSeedRecords } from './IngestionRepository.js';
import { applySeedStatusTransition } from './SeedGovernance.js';
import { withActivationDurations } from './activationTiming.js';
import { emitSeedActivationActivity } from './activationActivityEmitter.js';

export function parseDraftInputForSeedLink(input: unknown): {
  seedId: string | null;
  batchId: string | null;
} {
  let parsed: Record<string, unknown> = {};
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      parsed = {};
    }
  } else if (input && typeof input === 'object') {
    parsed = input as Record<string, unknown>;
  }
  const seedId = String(parsed.ingestionSeedId ?? parsed.seedId ?? '').trim() || null;
  const batchId = String(parsed.batchId ?? '').trim() || null;
  return { seedId, batchId };
}

export type LinkSeedAfterPublishParams = {
  draftInput: unknown;
  draftId: string;
  storeId: string;
  publisherUserId: string;
  storefrontUrl?: string | null;
  businessName?: string | null;
};

export type LinkSeedAfterPublishResult = {
  ok: boolean;
  seedId: string | null;
  linked: boolean;
  message: string;
};

export async function linkSeedAfterPublish(
  params: LinkSeedAfterPublishParams,
): Promise<LinkSeedAfterPublishResult> {
  const { seedId, batchId } = parseDraftInputForSeedLink(params.draftInput);
  if (!seedId) {
    return { ok: true, seedId: null, linked: false, message: 'No ingestion seed on draft.' };
  }

  const seed = await getSeedRecordById(seedId);
  if (!seed) {
    return { ok: false, seedId, linked: false, message: `Seed not found: ${seedId}` };
  }

  if (seed.storeId === params.storeId && seed.claimable === false) {
    return { ok: true, seedId, linked: false, message: 'Seed already linked to store.' };
  }

  const now = new Date().toISOString();
  const businessName = params.businessName ?? seed.normalized.businessName ?? 'Business';
  let updatedSeed: IngestedSeedRecord;

  if (seed.verificationStatus === 'verified_owner') {
    const transition = applySeedStatusTransition(seed, 'active');
    if (!transition.ok) {
      return { ok: false, seedId, linked: false, message: transition.message };
    }
    updatedSeed = withActivationDurations({
      ...transition.record,
      ownerUserId: seed.ownerUserId ?? params.publisherUserId,
      storeId: params.storeId,
      draftId: params.draftId,
      publicVisibility: 'full',
      claimable: false,
      activatedAt: seed.activatedAt ?? now,
      operatingStartedAt: seed.operatingStartedAt ?? now,
      updatedAt: now,
    });
  } else if (seed.verificationStatus === 'seeded_claimable') {
    updatedSeed = {
      ...seed,
      ownerUserId: seed.ownerUserId ?? params.publisherUserId,
      storeId: params.storeId,
      draftId: params.draftId,
      claimable: false,
      operatingStartedAt: seed.operatingStartedAt ?? now,
      updatedAt: now,
    };
  } else if (seed.verificationStatus === 'active') {
    updatedSeed = {
      ...seed,
      storeId: params.storeId,
      draftId: params.draftId,
      claimable: false,
      operatingStartedAt: seed.operatingStartedAt ?? now,
      updatedAt: now,
    };
  } else {
    updatedSeed = {
      ...seed,
      storeId: params.storeId,
      draftId: params.draftId,
      claimable: false,
      updatedAt: now,
    };
  }

  await upsertSeedRecords([updatedSeed]);

  const eventMetadata = {
    storeId: params.storeId,
    draftId: params.draftId,
    batchId: batchId ?? updatedSeed.batchId ?? null,
    storefrontUrl: params.storefrontUrl ?? null,
    businessName,
  };

  emitSeedActivationActivity({
    type: 'discovery_seed_converted_to_store',
    seed: updatedSeed,
    actorId: params.publisherUserId,
    severity: 'success',
    title: 'Discovery seed converted to store',
    message: `${businessName} is now a live store on Cardbey.`,
    metadata: {
      ...eventMetadata,
      verificationStatus: updatedSeed.verificationStatus,
      ownershipVerified: seed.verificationStatus === 'verified_owner' || Boolean(seed.verifiedAt),
    },
  });

  emitSeedActivationActivity({
    type: 'business_space_published',
    seed: updatedSeed,
    actorId: params.publisherUserId,
    severity: 'success',
    title: 'Business space published',
    message: `${businessName} is live.`,
    metadata: eventMetadata,
  });

  const { emitPlatformActivity } = await import('../platformActivity/platformActivityEmitter.js');
  void Promise.resolve(
    emitPlatformActivity({
      type: 'store_published',
      severity: 'success',
      actorType: 'user',
      actorId: params.publisherUserId,
      entityType: 'store',
      entityId: params.storeId,
      title: 'Store published',
      message: `${businessName} is now live on Cardbey.`,
      route: params.storefrontUrl ?? null,
      actionLabel: 'Open Store',
      metadata: eventMetadata,
    }),
  ).catch(() => {});

  return { ok: true, seedId, linked: true, message: 'Seed linked to published store.' };
}
