/**
 * Enrichment metrics for Control Center V2.2.
 */

import { listSeedRecords } from './IngestionRepository.js';
import { listEnrichmentCandidates } from './EnrichmentCandidateStore.js';
import type { EnrichmentMetrics, IngestedSeedRecord } from './types.js';
import { isLowConfidenceSeedProfile } from './enrichmentPublic.js';
import { LOW_CONFIDENCE_THRESHOLD } from './enrichmentSafety.js';

export async function buildEnrichmentMetrics(
  seedsInput?: IngestedSeedRecord[],
): Promise<EnrichmentMetrics> {
  const [seeds, candidates] = await Promise.all([
    seedsInput ? Promise.resolve(seedsInput) : listSeedRecords(),
    listEnrichmentCandidates(),
  ]);

  const claimableSeeds = seeds.filter((s) => s.verificationStatus === 'seeded_claimable');
  const missingWebsiteCount = claimableSeeds.filter((s) => !s.normalized.website?.trim()).length;
  const lowConfidenceProfileCount = seeds.filter(isLowConfidenceSeedProfile).length;

  return {
    candidatesFound: candidates.length,
    suggestedCount: candidates.filter((c) => c.status === 'suggested').length,
    acceptedCount: candidates.filter((c) => c.status === 'accepted').length,
    rejectedCount: candidates.filter((c) => c.status === 'rejected').length,
    missingWebsiteCount,
    lowConfidenceProfileCount,
  };
}

export { LOW_CONFIDENCE_THRESHOLD };
