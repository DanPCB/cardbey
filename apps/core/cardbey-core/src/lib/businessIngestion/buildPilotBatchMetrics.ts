/**
 * Batch-scoped pilot funnel metrics (Melbourne Batch 0, etc.).
 */

import { listSeedRecords } from './IngestionRepository.js';
import { listAllSeedSuitcases } from './seedSuitcaseStore.js';
import type { IngestedSeedRecord, PilotBatchMetrics } from './types.js';

export const MELBOURNE_BATCH0_ID = 'MELBOURNE_BATCH0_20260617';

function matchesBatch(seed: IngestedSeedRecord, batchId: string): boolean {
  if (seed.batchId === batchId) return true;
  return seed.normalized.sourceReference === batchId;
}

export function filterSeedsByBatch(seeds: IngestedSeedRecord[], batchId: string): IngestedSeedRecord[] {
  return seeds.filter((s) => matchesBatch(s, batchId));
}

export async function buildPilotBatchMetrics(batchId: string): Promise<PilotBatchMetrics | null> {
  const seeds = filterSeedsByBatch(await listSeedRecords(), batchId);
  if (!seeds.length) return null;

  const suitcases = await listAllSeedSuitcases();
  const seedIds = new Set(seeds.map((s) => s.id));
  const batchSuitcases = suitcases.filter((s) => seedIds.has(s.seedId));

  const campaignId = seeds.find((s) => s.campaignId)?.campaignId ?? batchId;

  return {
    batchId,
    campaignId,
    discovered: seeds.length,
    pendingQa: seeds.filter((s) => s.verificationStatus === 'seeded_pending_qa').length,
    claimable: seeds.filter((s) => s.verificationStatus === 'seeded_claimable').length,
    reportViewed: batchSuitcases.filter((s) => (s.reportViewCount ?? 0) > 0).length,
    verified: seeds.filter((s) => s.verificationStatus === 'verified_owner').length,
    activated: seeds.filter((s) => s.verificationStatus === 'active' && !s.storeId).length,
    operating: seeds.filter((s) => s.verificationStatus === 'active' && Boolean(s.storeId)).length,
    biSnapshots: batchSuitcases.filter((s) => s.biSnapshot).length,
    seedSuitcases: batchSuitcases.length,
  };
}

export async function buildAllPilotBatchMetrics(): Promise<PilotBatchMetrics[]> {
  const seeds = await listSeedRecords();
  const batchIds = new Set<string>();
  for (const seed of seeds) {
    if (seed.batchId) batchIds.add(seed.batchId);
    else if (seed.normalized.sourceReference?.startsWith('MELBOURNE_BATCH')) {
      batchIds.add(seed.normalized.sourceReference);
    }
  }

  const metrics: PilotBatchMetrics[] = [];
  for (const batchId of batchIds) {
    const row = await buildPilotBatchMetrics(batchId);
    if (row) metrics.push(row);
  }
  return metrics.sort((a, b) => a.batchId.localeCompare(b.batchId));
}
