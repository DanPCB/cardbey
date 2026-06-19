/**
 * DiscoveryPromotionPipeline — BusinessCandidate → governed BusinessSeed (IngestedSeedRecord).
 * Never creates DraftStore/Business rows (persistStores: false).
 */

import { IngestionPipeline } from '../../businessIngestion/IngestionPipeline.js';
import { listSeedRecords } from '../../businessIngestion/IngestionRepository.js';
import type { IngestedSeedRecord } from '../../businessIngestion/types.js';
import { candidateToRawRecord, providerToSourceType } from '../adapters/candidateToRawRecord.js';
import { StaticRawRecordsAdapter } from '../adapters/StaticRawRecordsAdapter.js';
import { businessIdentityEngine } from '../dedupe/BusinessIdentityEngine.js';
import { businessCandidateNormalizer } from '../normalization/candidateNormalizer.js';
import { applyDiscoveryScores } from '../scoring/discoveryScore.js';
import type { BusinessCandidate, ScoredCandidate } from '../types/index.js';

export interface PromotionResult {
  accepted: ScoredCandidate[];
  rejectedDuplicates: ScoredCandidate[];
  reviewRequired: ScoredCandidate[];
  seeds: IngestedSeedRecord[];
  seedsCreated: number;
  seedsUpdated: number;
}

function toScored(
  candidate: BusinessCandidate,
  identityScore: number,
): ScoredCandidate {
  const identityDecision = businessIdentityEngine.classify(identityScore);
  return {
    ...candidate,
    discoveryScore: (candidate.metadata.discoveryScore as number) ?? 0,
    identityScore,
    identityDecision,
    metadata: {
      ...candidate.metadata,
      identityScore,
      identityDecision,
    },
  };
}

export class DiscoveryPromotionPipeline {
  private readonly ingestionPipeline = new IngestionPipeline();

  /** Normalize, score, dedupe within batch + against existing seed corpus. */
  async filterCandidates(candidates: BusinessCandidate[]): Promise<{
    promotable: ScoredCandidate[];
    rejectedDuplicates: ScoredCandidate[];
    reviewRequired: ScoredCandidate[];
  }> {
    const normalized = businessCandidateNormalizer.normalizeMany(candidates);
    const scored = applyDiscoveryScores(normalized);

    const existingSeeds = await listSeedRecords();
    const seedCorpus: BusinessCandidate[] = existingSeeds.map((s) => ({
      providerId: 'manual',
      externalId: s.id,
      businessName: s.normalized.businessName,
      category: s.normalized.category,
      address: s.normalized.address,
      city: s.normalized.city,
      state: s.normalized.state,
      postcode: null,
      country: s.normalized.country,
      latitude: null,
      longitude: null,
      phone: s.normalized.phone,
      email: s.normalized.email,
      website: s.normalized.website,
      socialProfiles: [],
      sourceUrl: s.normalized.sourceReference,
      discoveredAt: s.createdAt,
      confidence: 1,
      metadata: {},
    }));

    const promotable: ScoredCandidate[] = [];
    const rejectedDuplicates: ScoredCandidate[] = [];
    const reviewRequired: ScoredCandidate[] = [];
    const acceptedCorpus: BusinessCandidate[] = [...seedCorpus];

    for (const candidate of scored) {
      const identityScore = businessIdentityEngine.bestMatchScore(
        candidate,
        acceptedCorpus,
        candidate.externalId,
      );
      const scoredCandidate = toScored(candidate, identityScore);
      const decision = scoredCandidate.identityDecision;

      if (decision === 'duplicate') {
        rejectedDuplicates.push(scoredCandidate);
        continue;
      }
      if (decision === 'review_required') {
        reviewRequired.push(scoredCandidate);
      }
      promotable.push(scoredCandidate);
      acceptedCorpus.push(scoredCandidate);
    }

    return { promotable, rejectedDuplicates, reviewRequired };
  }

  async promote(
    candidates: BusinessCandidate[],
    options: { batchId?: string | null; campaignId?: string | null } = {},
  ): Promise<PromotionResult> {
    const { promotable, rejectedDuplicates, reviewRequired } =
      await this.filterCandidates(candidates);

    if (!promotable.length) {
      return {
        accepted: promotable,
        rejectedDuplicates,
        reviewRequired,
        seeds: [],
        seedsCreated: 0,
        seedsUpdated: 0,
      };
    }

    const rawRecords = promotable.map(candidateToRawRecord);
    const providerId = promotable[0]?.providerId ?? 'osm';
    const adapter = new StaticRawRecordsAdapter(
      rawRecords,
      providerToSourceType(providerId),
      `discovery-engine:${providerId}`,
    );

    // RUNTIME AUTHORITY: persistStores must remain false — seeds only, no DraftStore/Business
    const result = await this.ingestionPipeline.run(adapter, {
      persistSeeds: true,
      persistStores: false,
      skipDuplicates: true,
      batchId: options.batchId ?? `discovery-${providerId}`,
      campaignId: options.campaignId ?? null,
    });

    return {
      accepted: promotable,
      rejectedDuplicates,
      reviewRequired,
      seeds: result.seeds,
      seedsCreated: result.metrics.seedsCreated,
      seedsUpdated: result.metrics.seedsUpdated,
    };
  }
}

export const discoveryPromotionPipeline = new DiscoveryPromotionPipeline();

export async function countSeedsByProvider(): Promise<Record<string, number>> {
  const seeds = await listSeedRecords();
  const breakdown: Record<string, number> = {};
  for (const seed of seeds) {
    const provider = seed.normalized.sourceType ?? 'unknown';
    breakdown[provider] = (breakdown[provider] ?? 0) + 1;
  }
  return breakdown;
}
