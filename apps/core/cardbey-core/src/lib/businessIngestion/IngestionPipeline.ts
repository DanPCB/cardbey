/**
 * Business Ingestion pipeline orchestrator.
 * fetch → normalize → deduplicate → score → seed governance → store creation
 */

import { randomUUID } from 'node:crypto';
import { businessNormalizer } from './BusinessNormalizer.js';
import { entityResolver } from './EntityResolver.js';
import { businessQualityScorer } from './BusinessQualityScorer.js';
import { buildIngestedSeedRecord } from './SeedGovernance.js';
import { buildSeedStoreDraft, seedStoreBuilder } from './SeedStoreBuilder.js';
import { appendIngestionRun, listSeedRecords, saveSeedRecords, upsertSeedRecords } from './IngestionRepository.js';
import { reconcileIngestionSeeds, buildSourceKey } from './seedIdempotency.js';
import { attachStoreToSeed } from './seedStorePersistence.js';
import type {
  BusinessFeedAdapter,
  IngestedSeedRecord,
  IngestionRunMetrics,
  QualityTier,
  SeedStoreDraft,
} from './types.js';

export interface IngestionPipelineOptions {
  /** Persist seed records to JSON store (default true). */
  persistSeeds?: boolean;
  /** Create DraftStore/Business rows when system user is configured (default false). */
  persistStores?: boolean;
  /** Skip records classified as duplicate (default true). */
  skipDuplicates?: boolean;
}

export interface IngestionPipelineResult {
  metrics: IngestionRunMetrics;
  seeds: IngestedSeedRecord[];
  drafts: SeedStoreDraft[];
  skippedDuplicates: number;
}

export class IngestionPipeline {
  async run(
    adapter: BusinessFeedAdapter,
    options: IngestionPipelineOptions = {},
  ): Promise<IngestionPipelineResult> {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    const persistSeeds = options.persistSeeds !== false;
    const persistStores = options.persistStores === true;
    const skipDuplicates = options.skipDuplicates !== false;

    const rawRecords = await adapter.fetch();
    const normalized = businessNormalizer.normalizeMany(rawRecords);
    const resolved = entityResolver.resolveBatch(normalized);

    const qualityBreakdown: Record<QualityTier, number> = {
      high_quality: 0,
      medium_quality: 0,
      low_quality: 0,
    };

    const seeds: IngestedSeedRecord[] = [];
    const drafts: SeedStoreDraft[] = [];
    let duplicatesRemoved = 0;
    let possibleDuplicates = 0;

    for (const item of resolved) {
      if (item.status === 'duplicate' && skipDuplicates) {
        duplicatesRemoved++;
        continue;
      }
      if (item.status === 'possible_duplicate') possibleDuplicates++;

      const quality = businessQualityScorer.score(item.record, item.status);
      qualityBreakdown[quality.tier]++;

      const seed = buildIngestedSeedRecord({
        normalized: item.record,
        resolution: item.status,
        matchEvidence: item.matchEvidence,
        qualityScore: quality.qualityScore,
        qualityTier: quality.tier,
      });

      const draft = seedStoreBuilder.buildFromSeed(seed);
      if (draft) drafts.push(draft);

      seeds.push(seed);
    }

    let finalSeeds = seeds;
    if (persistStores) {
      finalSeeds = [];
      for (const seed of seeds) {
        const draft = buildSeedStoreDraft(seed);
        if (draft && persistStores) {
          finalSeeds.push(await attachStoreToSeed(seed, draft));
        } else {
          finalSeeds.push(seed);
        }
      }
    }

    let seedsCreated = 0;
    let seedsUpdated = 0;
    let seedsSkippedExisting = 0;

    if (persistSeeds && finalSeeds.length) {
      const existing = await listSeedRecords();
      const reconciled = reconcileIngestionSeeds(finalSeeds, existing);
      seedsCreated = reconciled.seedsCreated;
      seedsUpdated = reconciled.seedsUpdated;
      seedsSkippedExisting = reconciled.seedsSkippedExisting;
      finalSeeds = reconciled.seeds;

      const byId = new Map(existing.map((s) => [s.id, s]));
      for (const seed of reconciled.seeds) {
        byId.set(seed.id, seed);
      }

      const canonicalIds = new Set(reconciled.seeds.map((s) => s.id));
      const canonicalSourceKeys = new Set(
        reconciled.seeds.map((s) => buildSourceKey(s.normalized)),
      );
      const compacted = [...byId.values()].filter((seed) => {
        const sk = buildSourceKey(seed.normalized);
        if (canonicalSourceKeys.has(sk) && !canonicalIds.has(seed.id)) {
          return false;
        }
        return true;
      });

      await saveSeedRecords(compacted);
    } else if (persistSeeds) {
      seedsCreated = 0;
    } else {
      seedsCreated = finalSeeds.length;
    }

    const businessStoresPersisted = finalSeeds.filter((s) => s.storeId).length;

    const completedAt = new Date().toISOString();
    const metrics: IngestionRunMetrics = {
      runId,
      sourceType: adapter.sourceType,
      sourceReference: adapter.sourceReference,
      startedAt,
      completedAt,
      recordsFetched: rawRecords.length,
      recordsNormalized: normalized.length,
      duplicatesRemoved,
      possibleDuplicates,
      uniqueRecords: seeds.length,
      seedsCreated,
      seedsUpdated,
      seedsSkippedExisting,
      businessStoresPersisted,
      qualityBreakdown,
      sourceBreakdown: { [adapter.sourceType]: rawRecords.length },
      claimRate: 0,
      verificationRate: 0,
    };

    if (persistSeeds) {
      await appendIngestionRun(metrics);
    }

    return {
      metrics,
      seeds: finalSeeds,
      drafts,
      skippedDuplicates: duplicatesRemoved,
    };
  }
}

export const ingestionPipeline = new IngestionPipeline();

export async function runIngestion(
  adapter: BusinessFeedAdapter,
  options?: IngestionPipelineOptions,
): Promise<IngestionPipelineResult> {
  return ingestionPipeline.run(adapter, options);
}
