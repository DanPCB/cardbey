/**
 * Pure helpers for multi-market QA Review batch cards.
 * Discovered on the card must reflect persisted inventory, not provider hit counts.
 */

export type MmQaBatchMetricInput = {
  batchId: string;
  campaignId?: string | null;
  countryCode?: string;
  territoryId?: string;
  categoryId?: string;
  locality?: string | null;
  dryRun?: boolean;
  jobStatus?: string;
  discoveredCount?: number;
  completedAt?: string | null;
  createdAt?: string | null;
  requestedLimit?: number;
};

export type MmQaCandidateMetrics = {
  total?: number;
  byStatus?: Record<string, number>;
};

export function buildMultiMarketQaBatchCard(
  job: MmQaBatchMetricInput,
  metrics: MmQaCandidateMetrics,
): {
  batchId: string;
  campaignId: string;
  countryCode?: string;
  territoryId?: string;
  categoryId?: string;
  locality?: string | null;
  dryRun: boolean;
  jobStatus?: string;
  /** Persisted candidates for this batchId (inventory). */
  discovered: number;
  /** Provider hits from the discovery job (may exceed inventory when duplicates skipped). */
  providerHits: number;
  pendingQa: number;
  claimable: number;
  reportViewed: number;
  verified: number;
  activated: number;
  operating: number;
  biSnapshots: number;
  seedSuitcases: number;
  completedAt?: string | null;
  createdAt?: string | null;
} {
  const byStatus = metrics.byStatus || {};
  const pendingQa =
    Number(byStatus.PENDING_QA || 0) + Number(byStatus.DISCOVERED || 0);
  const inventoryTotal = Number(metrics.total) || 0;
  return {
    batchId: job.batchId,
    campaignId: job.campaignId || job.batchId,
    countryCode: job.countryCode,
    territoryId: job.territoryId,
    categoryId: job.categoryId,
    locality: job.locality,
    dryRun: job.dryRun === true,
    jobStatus: job.jobStatus,
    discovered: inventoryTotal,
    providerHits: Number(job.discoveredCount) || 0,
    pendingQa,
    claimable: Number(byStatus.CLAIMABLE || 0),
    reportViewed: 0,
    verified: Number(byStatus.VERIFIED || 0),
    activated: Number(byStatus.ACTIVE || 0),
    operating: 0,
    biSnapshots: 0,
    seedSuitcases: 0,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
  };
}

export function sortMultiMarketQaBatchCards<
  T extends {
    pendingQa: number;
    dryRun?: boolean;
    completedAt?: string | null;
    createdAt?: string | null;
  },
>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    if (b.pendingQa !== a.pendingQa) return b.pendingQa - a.pendingQa;
    const aDry = a.dryRun === true ? 1 : 0;
    const bDry = b.dryRun === true ? 1 : 0;
    if (aDry !== bDry) return aDry - bDry;
    const aAt = a.completedAt || a.createdAt || '';
    const bAt = b.completedAt || b.createdAt || '';
    return bAt.localeCompare(aAt);
  });
}
