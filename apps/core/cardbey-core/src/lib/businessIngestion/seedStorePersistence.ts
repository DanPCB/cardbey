/**
 * Optional persistence of seed store drafts into DraftStore + Business.
 * Uses system user; marks provenance as ingestion_seed, claimable/unclaimed.
 */

import { getPrismaClient } from '../prisma.js';
import { hasBusinessColumn } from '../businessColumnCapabilities.js';
import { safePublishGeneratedDraft } from '../storeMission/safePublishGeneratedDraft.js';
import { buildSeedStorePreview } from './SeedStoreBuilder.js';
import type { IngestedSeedRecord, SeedStoreDraft } from './types.js';

function systemUserId(): string | null {
  return process.env.DISCOVERY_SYSTEM_USER_ID?.trim() || process.env.INGESTION_SYSTEM_USER_ID?.trim() || null;
}

export interface PersistSeedStoreResult {
  ok: boolean;
  draftId?: string;
  storeId?: string;
  error?: string;
}

export async function persistSeedStoreDraft(
  draft: SeedStoreDraft,
  seedId: string,
): Promise<PersistSeedStoreResult> {
  const ownerId = systemUserId();
  if (!ownerId) {
    return { ok: false, error: 'INGESTION_SYSTEM_USER_ID or DISCOVERY_SYSTEM_USER_ID not configured' };
  }

  const prisma = getPrismaClient();
  const preview = buildSeedStorePreview(draft);

  const created = await prisma.draftStore.create({
    data: {
      mode: 'template',
      status: 'ready',
      ownerUserId: ownerId,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      address: draft.address,
      phone: draft.phone,
      input: {
        businessName: draft.businessName,
        businessType: draft.businessType,
        source: 'ingestion_seed',
        ingestionSeedId: seedId,
        sourceType: draft.sourceType,
        sourceReference: draft.sourceReference,
        sourceRowId: draft.sourceRowId,
        verificationStatus: draft.verificationStatus,
      },
      preview,
      publishSnapshot: preview,
      publishSnapshotVersion: 1,
    },
  });

  const published = await safePublishGeneratedDraft({
    prisma,
    draftId: created.id,
    userId: ownerId,
  });

  if (!published.ok || !published.storeId) {
    return { ok: false, draftId: created.id, error: published.error ?? 'Publish failed' };
  }

  const ghostPatch: Record<string, unknown> = {};
  if (hasBusinessColumn('provenance')) ghostPatch.provenance = 'ingestion_seed';
  if (hasBusinessColumn('claimStatus')) ghostPatch.claimStatus = 'unclaimed';
  if (Object.keys(ghostPatch).length) {
    await prisma.business.update({
      where: { id: published.storeId },
      data: ghostPatch,
    });
  }

  return { ok: true, draftId: created.id, storeId: published.storeId };
}

export async function attachStoreToSeed(
  seed: IngestedSeedRecord,
  draft: SeedStoreDraft,
): Promise<IngestedSeedRecord> {
  const result = await persistSeedStoreDraft(draft, seed.id);
  if (!result.ok) return seed;
  return {
    ...seed,
    draftId: result.draftId ?? null,
    storeId: result.storeId ?? null,
    updatedAt: new Date().toISOString(),
  };
}
