/**
 * Phase V3 — Business Intelligence Briefing for Performer opening.
 * Informational handoff only — execution routes through Runtime Authority.
 */

import type { BusinessIntelligenceBriefing, BusinessIntelligenceSnapshot } from './types.js';

export function buildBusinessIntelligenceBriefing(
  snapshot: BusinessIntelligenceSnapshot,
  seedId: string,
): BusinessIntelligenceBriefing {
  const opportunityCount = snapshot.opportunities.length;
  return {
    openingLine: `We analyzed your business and identified ${opportunityCount} opportunit${opportunityCount === 1 ? 'y' : 'ies'}.`,
    strengths: snapshot.strengths,
    weaknesses: snapshot.weaknesses,
    opportunities: snapshot.opportunities,
    recommendedActions: snapshot.recommendedActions.map((a) => a.label),
    snapshotId: snapshot.snapshotId,
    migratedFromSeedId: seedId,
  };
}
