/**
 * Transfer ingested seed store ownership to verified claimant (V1.2).
 * Preserves ingestion provenance metadata on the Business row.
 */

import { getPrismaClient } from '../prisma.js';
import { hasBusinessColumn } from '../businessColumnCapabilities.js';
import { buildSeedStoreDraft } from './SeedStoreBuilder.js';
import { persistSeedStoreDraft } from './seedStorePersistence.js';
import type { IngestedSeedRecord } from './types.js';

export interface OwnershipTransferResult {
  ok: boolean;
  storeId?: string;
  draftId?: string;
  error?: string;
}

export async function ensureSeedStoreExists(
  seed: IngestedSeedRecord,
): Promise<{ storeId: string; draftId: string | null } | null> {
  if (seed.storeId) {
    return { storeId: seed.storeId, draftId: seed.draftId };
  }
  const draft = buildSeedStoreDraft(seed);
  if (!draft) return null;
  const persisted = await persistSeedStoreDraft(draft, seed.id);
  if (!persisted.ok || !persisted.storeId) return null;
  return { storeId: persisted.storeId, draftId: persisted.draftId ?? null };
}

export async function transferSeedStoreToOwner(
  seed: IngestedSeedRecord,
  ownerUserId: string,
): Promise<OwnershipTransferResult> {
  const ensured = await ensureSeedStoreExists(seed);
  if (!ensured) {
    return { ok: false, error: 'Failed to create or locate store for seed.' };
  }

  const prisma = getPrismaClient();
  const patch: Record<string, unknown> = { userId: ownerUserId };
  if (hasBusinessColumn('claimStatus')) patch.claimStatus = 'claimed';
  if (hasBusinessColumn('provenance')) patch.provenance = 'ingestion_seed';

  await prisma.business.update({
    where: { id: ensured.storeId },
    data: patch,
  });

  if (ensured.draftId) {
    await prisma.draftStore.updateMany({
      where: { id: ensured.draftId },
      data: { ownerUserId },
    });
  }

  return { ok: true, storeId: ensured.storeId, draftId: ensured.draftId ?? undefined };
}
