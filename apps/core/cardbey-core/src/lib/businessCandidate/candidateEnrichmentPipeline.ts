/**
 * Candidate enrichment pipeline — media discovery → BI brief.
 * Never creates Store, publishes, or contacts owners.
 */

import type { BusinessCandidateRecord } from '../types.js';
import { isProtectedBatch0 } from '../batch001Config.js';
import { runMediaDiscoveryForCandidate } from '../media/mediaDiscoveryAgent.js';
import { generateBusinessIntelligenceBrief } from '../brief/generateBusinessIntelligenceBrief.js';

export async function enrichCandidateForPublicDisplay(
  candidate: BusinessCandidateRecord,
): Promise<{ mediaDiscovered: boolean; briefGenerated: boolean }> {
  if (isProtectedBatch0(candidate.batchId)) {
    return { mediaDiscovered: false, briefGenerated: false };
  }

  await runMediaDiscoveryForCandidate(candidate);
  const brief = await generateBusinessIntelligenceBrief(candidate.id);
  return { mediaDiscovered: true, briefGenerated: brief != null };
}
