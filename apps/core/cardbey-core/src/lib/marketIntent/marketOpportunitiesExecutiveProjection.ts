/**
 * Read-only executive projection of market matching activity.
 * Aggregates existing Launchpad store + pilot review stats — no new matching logic.
 */
import {
  CARDBEY_SEED_2026_MISSION_ID,
  CARDBEY_SEED_2026_PROPOSED_TERMS,
} from './capital/cardbeySeed2026Mission.js';
import { launchpadPersistentMarketGraph } from './capital/persistentMarketGraphStore.js';
import { buildPilotReviewStats, listConnectionEvents } from './matchReviewService.js';

export type ExecutiveMarketDomainRow = {
  id: string;
  label: string;
  active: boolean;
  demandMissionId: string | null;
  demandLabel: string | null;
  supplyCount: number;
  candidateMatchCount: number;
  reviewedCount: number;
  pursueCount: number;
  watchCount: number;
  rejectCount: number;
  insufficientEvidenceCount: number;
  pendingReviewCount: number;
  connectionActionsRecorded: number;
  pursuedWithoutConnectionAction: boolean;
  summaryLine: string;
  insightLine: string | null;
};

export type ExecutiveMarketOpportunitiesProjection = {
  version: 'MARKET_OPPORTUNITIES_EXECUTIVE_V1';
  updatedAt: string;
  domains: ExecutiveMarketDomainRow[];
  totals: {
    reviewedCount: number;
    pursueCount: number;
    watchCount: number;
    rejectCount: number;
  };
  headline: string;
  subheadline: string | null;
  launchpadPath: string;
  launchpadReviewPath: string;
};

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export async function buildExecutiveMarketOpportunitiesProjection(): Promise<ExecutiveMarketOpportunitiesProjection> {
  const pilotStats = buildPilotReviewStats();
  const pursueCount = pilotStats.reviewDistribution?.PURSUE ?? 0;
  const watchCount = pilotStats.reviewDistribution?.WATCH ?? 0;
  const rejectCount = pilotStats.reviewDistribution?.REJECT ?? 0;
  const insufficientEvidenceCount = pilotStats.reviewDistribution?.INSUFFICIENT_EVIDENCE ?? 0;
  const reviewedCount = pilotStats.candidatePairsReviewed ?? 0;

  const [matches, supplyNodes, demandNodes] = await Promise.all([
    launchpadPersistentMarketGraph.listMatches({ eligibleOnly: true, limit: 200 }),
    launchpadPersistentMarketGraph.listNodes({ exchange: 'CAPITAL', exchangeRole: 'SUPPLY', limit: 200 }),
    launchpadPersistentMarketGraph.listNodes({ exchange: 'CAPITAL', exchangeRole: 'DEMAND', limit: 50 }),
  ]);

  const pendingReviewCount = matches.items.filter((m) => m.reviewState === 'pending').length;
  const connectionEvents = listConnectionEvents();
  const connectionActionsRecorded = connectionEvents.length;
  const pursuedWithoutConnectionAction = pursueCount > 0 && connectionActionsRecorded === 0;

  const demandLabel = `A$3M ${CARDBEY_SEED_2026_PROPOSED_TERMS.roundLabel} 2026`;
  const candidateMatchCount = matches.total;

  let summaryLine: string;
  if (reviewedCount > 0) {
    summaryLine = `${reviewedCount} matches reviewed · ${pursueCount} Pursue · ${watchCount} Watch`;
  } else if (candidateMatchCount > 0) {
    summaryLine = `${plural(candidateMatchCount, 'potential investor connection')} identified`;
  } else {
    summaryLine = 'No capital matches loaded — admit cohort from Launchpad Signals';
  }

  let insightLine: string | null = null;
  if (pursuedWithoutConnectionAction) {
    insightLine = `${pursueCount} capital ${pursueCount === 1 ? 'match has' : 'matches have'} been approved for pursuit, but no connection actions have been recorded.`;
  } else if (pendingReviewCount > 0) {
    insightLine = `${plural(pendingReviewCount, 'match', 'matches')} awaiting operator review in Launchpad.`;
  }

  const capitalDomain: ExecutiveMarketDomainRow = {
    id: 'CAPITAL',
    label: 'Capital',
    active: candidateMatchCount > 0 || supplyNodes.total > 0 || demandNodes.total > 0,
    demandMissionId: CARDBEY_SEED_2026_MISSION_ID,
    demandLabel,
    supplyCount: supplyNodes.total,
    candidateMatchCount,
    reviewedCount,
    pursueCount,
    watchCount,
    rejectCount,
    insufficientEvidenceCount,
    pendingReviewCount,
    connectionActionsRecorded,
    pursuedWithoutConnectionAction,
    summaryLine,
    insightLine,
  };

  const headline =
    reviewedCount > 0
      ? `${reviewedCount} matches reviewed · ${pursueCount} Pursue · ${watchCount} Watch`
      : candidateMatchCount > 0
        ? `${candidateMatchCount} potential investor connections identified`
        : 'Market matching ready — load Launchpad cohort';

  const subheadline =
    demandNodes.total > 0 ? `Capital demand: ${demandLabel}` : null;

  return {
    version: 'MARKET_OPPORTUNITIES_EXECUTIVE_V1',
    updatedAt: new Date().toISOString(),
    domains: [capitalDomain],
    totals: {
      reviewedCount,
      pursueCount,
      watchCount,
      rejectCount,
    },
    headline,
    subheadline,
    launchpadPath: '/control-center/launchpad',
    launchpadReviewPath: '/control-center/launchpad?section=review',
  };
}
