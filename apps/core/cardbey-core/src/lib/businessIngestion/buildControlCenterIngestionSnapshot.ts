/**
 * Normalized Discovery Agent / Business Ingestion metrics for Control Center.
 * Read-only snapshot — derived from ingestion store, claim queue, and enrichment.
 */

import type { EnrichmentMetrics, IngestionRunMetrics, DiscoveryIntelligenceMetrics } from './types.js';

export type ControlCenterIngestionSnapshot = {
  sourcesActive: number;
  lastRunAt: string | null;
  lastRunStatus: 'completed' | 'empty' | 'no_runs';
  recordsFetched: number | null;
  uniqueRecords: number | null;
  discovered: number;
  pendingQa: number;
  claimable: number;
  verified: number;
  activated: number;
  verificationStalled: number;
  enrichmentCandidates: number;
  enrichmentAccepted: number;
  averageVerificationDurationMs: number | null;
  averageActivationDurationMs: number | null;
  stalledActivationCount: number;
  /** Phase V3 — Discovery Intelligence funnel */
  snapshotsGenerated: number;
  activationReportViews: number;
  activationReportOpenRate: number | null;
  activationConversionAfterReportView: number | null;
  reportViewed: number;
  operating: number;
  averageVisibilityImprovement: number | null;
  averageOpportunityCompletion: number | null;
  activatedBusinessesWithBiProgress: number;
  topUnresolvedOpportunityTypes: string[];
};

type SnapshotInput = {
  totalSeeds: number;
  byVerificationStatus: Record<string, number>;
  bySourceType: Record<string, number>;
  recentRuns: IngestionRunMetrics[];
  qaPendingCount: number;
  claimQueue: {
    averageVerificationDurationMs?: number | null;
    averageActivationDurationMs?: number | null;
    stalledActivationCount?: number;
    activatedSeeds?: number;
  };
  enrichment: EnrichmentMetrics | null;
  discoveryIntelligence?: DiscoveryIntelligenceMetrics | null;
};

function num(value: unknown): number {
  return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

function inferLastRunStatus(run: IngestionRunMetrics | undefined): ControlCenterIngestionSnapshot['lastRunStatus'] {
  if (!run) return 'no_runs';
  if (run.uniqueRecords === 0 && run.recordsFetched === 0) return 'empty';
  return 'completed';
}

export function buildControlCenterIngestionSnapshot(input: SnapshotInput): ControlCenterIngestionSnapshot {
  const byStatus = input.byVerificationStatus ?? {};
  const bySource = input.bySourceType ?? {};
  const runs = input.recentRuns ?? [];
  const latestRun = runs[0];
  const sourceTypes = new Set<string>([
    ...Object.keys(bySource),
    ...runs.map((r) => r.sourceType).filter(Boolean),
  ]);

  const enrichment = input.enrichment;
  const intel = input.discoveryIntelligence;

  return {
    sourcesActive: sourceTypes.size,
    lastRunAt: latestRun?.completedAt ?? latestRun?.startedAt ?? null,
    lastRunStatus: inferLastRunStatus(latestRun),
    recordsFetched: latestRun?.recordsFetched ?? null,
    uniqueRecords: latestRun?.uniqueRecords ?? null,
    discovered: num(input.totalSeeds),
    pendingQa: num(input.qaPendingCount ?? byStatus.seeded_pending_qa),
    claimable: num(byStatus.seeded_claimable),
    verified: num(byStatus.verified_owner),
    activated: num(byStatus.active ?? input.claimQueue.activatedSeeds),
    verificationStalled: num(input.claimQueue.stalledActivationCount),
    enrichmentCandidates: num(enrichment?.suggestedCount),
    enrichmentAccepted: num(enrichment?.acceptedCount),
    averageVerificationDurationMs: input.claimQueue.averageVerificationDurationMs ?? null,
    averageActivationDurationMs: input.claimQueue.averageActivationDurationMs ?? null,
    stalledActivationCount: num(input.claimQueue.stalledActivationCount),
    snapshotsGenerated: num(intel?.snapshotsGenerated),
    activationReportViews: num(intel?.activationReportViews),
    activationReportOpenRate: intel?.activationReportOpenRate ?? null,
    activationConversionAfterReportView: intel?.activationConversionAfterReportView ?? null,
    reportViewed: num(intel?.reportViewedSeeds),
    operating: num(byStatus.active),
    averageVisibilityImprovement: intel?.averageVisibilityImprovement ?? null,
    averageOpportunityCompletion: intel?.averageOpportunityCompletion ?? null,
    activatedBusinessesWithBiProgress: num(intel?.activatedBusinessesWithBiProgress),
    topUnresolvedOpportunityTypes: intel?.topUnresolvedOpportunityTypes ?? [],
  };
}
