import { describe, expect, it, beforeEach } from 'vitest';
import { admitCapitalMissionAndCohort } from '../capital/capitalResourceNetworkService.js';
import { launchpadPersistentMarketGraph } from '../capital/persistentMarketGraphStore.js';
import {
  __resetMatchReviewMemory,
  buildPilotReviewStats,
  listConnectionEvents,
  recordConnectionFunnelEvent,
  submitMatchReview,
} from '../matchReviewService.js';

describe('Live Match Review Pilot V1', () => {
  beforeEach(async () => {
    __resetMatchReviewMemory();
    await launchpadPersistentMarketGraph.clearMemory();
    await admitCapitalMissionAndCohort({ replace: true });
  });

  it('records operator review without mutating structural band', async () => {
    const { items } = await launchpadPersistentMarketGraph.listMatches({ limit: 5 });
    expect(items.length).toBeGreaterThan(0);
    const match = items[0]!;
    const bandBefore = match.reciprocalBand;

    const result = await submitMatchReview({
      pairKey: match.pairKey,
      decision: 'PURSUE',
      reason: 'GOOD_RECIPROCAL_FIT',
      confirmed: true,
      reviewerId: 'op_test',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralBandUnchanged).toBe(bandBefore);
    expect(result.sends).toBe(false);
    expect(result.review.structuralTruth.reciprocalBand).toBe(bandBefore);
    expect(result.review.structuralTruth.immutable).toBe(true);
    expect(result.review.marketTruth.decision).toBe('PURSUE');

    const after = await launchpadPersistentMarketGraph.listMatches({ limit: 200 });
    const row = after.items.find((m) => m.pairKey === match.pairKey);
    expect(row?.reciprocalBand).toBe(bandBefore);
    expect(row?.reviewState).toBe('pursue');
    expect(row?.match.reciprocalBand).toBe(bandBefore);
  });

  it('requires confirmation gate', async () => {
    const { items } = await launchpadPersistentMarketGraph.listMatches({ limit: 1 });
    const blocked = await submitMatchReview({
      pairKey: items[0]!.pairKey,
      decision: 'REJECT',
      confirmed: false,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.requiresConfirmation).toBe(true);
  });

  it('emits MATCH_REVIEWED and MATCH_PURSUED for PURSUE only', async () => {
    const { items } = await launchpadPersistentMarketGraph.listMatches({ limit: 1 });
    await submitMatchReview({
      pairKey: items[0]!.pairKey,
      decision: 'PURSUE',
      reason: 'GOOD_RECIPROCAL_FIT',
      confirmed: true,
    });
    const types = listConnectionEvents(items[0]!.pairKey).map((e) => e.eventType);
    expect(types).toContain('MATCH_REVIEWED');
    expect(types).toContain('MATCH_PURSUED');
  });

  it('connection funnel requires prior PURSUE', async () => {
    const { items } = await launchpadPersistentMarketGraph.listMatches({ limit: 1 });
    const pairKey = items[0]!.pairKey;
    const blocked = await recordConnectionFunnelEvent({
      pairKey,
      eventType: 'CONNECTION_PREPARED',
      confirmed: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('pursue_required');

    await submitMatchReview({ pairKey, decision: 'PURSUE', confirmed: true });
    const ok = await recordConnectionFunnelEvent({
      pairKey,
      eventType: 'CONNECTION_PREPARED',
      confirmed: true,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.sends).toBe(false);
    expect(ok.autoOutreach).toBe(false);
  });

  it('pilot stats track band by operator decision', async () => {
    const { items } = await launchpadPersistentMarketGraph.listMatches({ limit: 3 });
    for (const m of items) {
      await submitMatchReview({
        pairKey: m.pairKey,
        decision: m.reciprocalBand === 'STRONG_RECIPROCAL' ? 'PURSUE' : 'WATCH',
        reason: 'GOOD_RECIPROCAL_FIT',
        confirmed: true,
      });
    }
    const stats = buildPilotReviewStats();
    expect(stats.candidatePairsReviewed).toBeGreaterThanOrEqual(3);
    expect(stats.unauthorizedContact).toBe(0);
    expect(stats.autonomousOutreach).toBe(0);
    expect((stats.reviewDistribution.PURSUE || 0) + (stats.reviewDistribution.WATCH || 0)).toBeGreaterThan(0);
  });

  it('preserves three truth layers on review record', async () => {
    const { items } = await launchpadPersistentMarketGraph.listMatches({ limit: 1 });
    const result = await submitMatchReview({
      pairKey: items[0]!.pairKey,
      decision: 'REJECT',
      reason: 'WRONG_NEED',
      confirmed: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.semanticTruth.layer).toBe('G1_G2');
    expect(result.review.structuralTruth.layer).toBe('MarketMatch_V1');
    expect(result.review.marketTruth.layer).toBe('operator_review');
  });
});
