import { describe, expect, it } from 'vitest';
import { buildControlCenterIngestionSnapshot } from '../buildControlCenterIngestionSnapshot.js';

describe('buildControlCenterIngestionSnapshot', () => {
  it('normalizes ingestion metrics for Control Center', () => {
    const snapshot = buildControlCenterIngestionSnapshot({
      totalSeeds: 50,
      byVerificationStatus: {
        seeded_pending_qa: 5,
        seeded_claimable: 10,
        verified_owner: 8,
        active: 3,
      },
      bySourceType: { csv: 20, open_data_url: 30 },
      recentRuns: [
        {
          runId: 'run-1',
          sourceType: 'csv',
          sourceReference: 'file.csv',
          startedAt: '2026-06-16T09:00:00.000Z',
          completedAt: '2026-06-16T09:05:00.000Z',
          recordsFetched: 100,
          recordsNormalized: 90,
          duplicatesRemoved: 5,
          possibleDuplicates: 2,
          uniqueRecords: 85,
          seedsCreated: 10,
          seedsUpdated: 2,
          seedsSkippedExisting: 1,
          businessStoresPersisted: 0,
          qualityBreakdown: { high: 1, medium: 1, low: 1, unverified: 1 },
          sourceBreakdown: { csv: 100 },
          claimRate: 0.2,
          verificationRate: 0.1,
        },
      ],
      qaPendingCount: 5,
      claimQueue: {
        stalledActivationCount: 2,
        activatedSeeds: 3,
        averageVerificationDurationMs: 1000,
        averageActivationDurationMs: 2000,
      },
      enrichment: {
        candidatesFound: 4,
        suggestedCount: 3,
        acceptedCount: 1,
        rejectedCount: 0,
        missingWebsiteCount: 2,
        lowConfidenceProfileCount: 1,
      },
    });

    expect(snapshot.sourcesActive).toBe(2);
    expect(snapshot.discovered).toBe(50);
    expect(snapshot.pendingQa).toBe(5);
    expect(snapshot.claimable).toBe(10);
    expect(snapshot.activated).toBe(3);
    expect(snapshot.stalledActivationCount).toBe(2);
    expect(snapshot.enrichmentCandidates).toBe(3);
    expect(snapshot.enrichmentAccepted).toBe(1);
    expect(snapshot.lastRunStatus).toBe('completed');
    expect(snapshot.recordsFetched).toBe(100);
    expect(snapshot.snapshotsGenerated).toBe(0);
  });

  it('includes discovery intelligence funnel metrics', () => {
    const snapshot = buildControlCenterIngestionSnapshot({
      totalSeeds: 20,
      byVerificationStatus: { seeded_claimable: 5, verified_owner: 3, active: 2 },
      bySourceType: { csv: 10 },
      recentRuns: [],
      qaPendingCount: 2,
      claimQueue: { stalledActivationCount: 0, activatedSeeds: 2 },
      enrichment: null,
      discoveryIntelligence: {
        snapshotsGenerated: 8,
        activationReportViews: 12,
        activationReportOpenRate: 0.5,
        activationConversionAfterReportView: 0.25,
        reportViewedSeeds: 4,
        activatedAfterReportView: 1,
        averageVisibilityImprovement: 5,
        averageOpportunityCompletion: 0.5,
        activatedBusinessesWithBiProgress: 3,
        topUnresolvedOpportunityTypes: ['Launch welcome offer'],
      },
    });

    expect(snapshot.snapshotsGenerated).toBe(8);
    expect(snapshot.activationReportViews).toBe(12);
    expect(snapshot.activationReportOpenRate).toBe(0.5);
    expect(snapshot.reportViewed).toBe(4);
    expect(snapshot.operating).toBe(2);
    expect(snapshot.averageVisibilityImprovement).toBe(5);
    expect(snapshot.activatedBusinessesWithBiProgress).toBe(3);
  });
});
