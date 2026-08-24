/**
 * Canonical seeding / GTM funnel metrics — single source of truth.
 * Used by GET /api/business-ingestion/metrics and aliased by GET /api/intelligence/metrics.
 */

import { buildIngestionDashboardMetrics } from './IngestionRepository.js';
import { listQaQueue } from './QaPromotionService.js';
import { buildClaimQueueMetrics } from './ClaimBridgeService.js';
import { buildEnrichmentMetrics } from './BusinessEnrichmentAgent.js';
import { buildControlCenterIngestionSnapshot } from './buildControlCenterIngestionSnapshot.js';

export const SEEDING_METRICS_SOURCE = 'business-ingestion';

/**
 * @returns {Promise<{
 *   ok: true,
 *   sourceOfTruth: string,
 *   metrics: Record<string, unknown>,
 *   discoverySeeds: number,
 *   claimable: number,
 *   claimed: number,
 *   activated: number,
 * }>}
 */
export async function buildCanonicalSeedingMetrics() {
  const metrics = await buildIngestionDashboardMetrics();
  const qaPending = await listQaQueue({ status: 'seeded_pending_qa' });
  const autoSuggested = qaPending.filter((s) => s.autoApprovalSuggested).length;
  const claimQueue = await buildClaimQueueMetrics();
  const enrichment = await buildEnrichmentMetrics().catch(() => null);
  const { buildDiscoveryIntelligenceMetrics } = await import('./businessEvolutionService.js');
  const discoveryIntelligence = await buildDiscoveryIntelligenceMetrics().catch(() => null);
  const { buildAllPilotBatchMetrics } = await import('./buildPilotBatchMetrics.js');
  const pilotBatches = await buildAllPilotBatchMetrics().catch(() => []);

  const by = metrics.byVerificationStatus || {};
  const discoverySeeds = Number(metrics.totalSeeds) || 0;
  const claimable = Number(by.seeded_claimable) || 0;
  const claimed = Number(by.verified_owner) || 0;
  const activated = Number(by.active) || 0;

  const controlCenter = buildControlCenterIngestionSnapshot({
    totalSeeds: metrics.totalSeeds,
    byVerificationStatus: metrics.byVerificationStatus,
    bySourceType: metrics.bySourceType,
    recentRuns: metrics.recentRuns,
    qaPendingCount: qaPending.length,
    claimQueue,
    enrichment,
    discoveryIntelligence,
  });

  const packed = {
    ...metrics,
    qaPendingCount: qaPending.length,
    qaAutoSuggestedCount: autoSuggested,
    claimQueue,
    pendingClaims: claimQueue.pendingClaims,
    verifiedClaims: claimQueue.verifiedClaims,
    rejectedClaims: claimQueue.rejectedClaims,
    duplicateBlocked: claimQueue.duplicateBlocked,
    activatedSeeds: claimQueue.activatedSeeds,
    activationRate: claimQueue.activationRate,
    operatingConversionRate: claimQueue.operatingConversionRate,
    averageVerificationDurationMs: claimQueue.averageVerificationDurationMs,
    averageActivationDurationMs: claimQueue.averageActivationDurationMs,
    stalledActivationCount: claimQueue.stalledActivationCount,
    enrichment,
    discoveryIntelligence,
    controlCenter,
    pilotBatches,
    // Audit / GTM funnel aliases
    discoverySeeds,
    claimable,
    claimed,
    activated,
  };

  return {
    ok: true,
    sourceOfTruth: SEEDING_METRICS_SOURCE,
    canonicalPath: '/api/business-ingestion/metrics',
    metrics: packed,
    discoverySeeds,
    claimable,
    claimed,
    activated,
  };
}
