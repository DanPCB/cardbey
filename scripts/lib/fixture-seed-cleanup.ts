/**
 * Fixture / sample discovery seed cleanup — seeds + ingestion JSON only.
 * Never deletes stores, users, drafts, or Prisma runtime data.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  EnrichmentCandidate,
  IngestedSeedRecord,
  IngestionClaimRequest,
  SeedSuitcase,
} from './discovery-data-audit.ts';
import { ingestionDir, isTestSourceReference, loadIngestionArtifacts } from './discovery-data-audit.ts';

export const MELBOURNE_BATCH0_ID = 'MELBOURNE_BATCH0_20260617';

const SAMPLE_BUSINESS_RE = /^sample business/i;

export type IngestionArtifactContext = {
  seeds: IngestedSeedRecord[];
  claims: IngestionClaimRequest[];
  enrichmentCandidates: EnrichmentCandidate[];
  suitcases: SeedSuitcase[];
};

export type FixtureSeedRow = {
  id: string;
  businessName: string | null;
  batchId: string | null;
  sourceType: string;
  sourceReference: string;
  verificationStatus: string;
  reason: string;
};

export type FixtureSeedMetrics = {
  discovered: number;
  pendingQa: number;
  claimable: number;
  verified: number;
  activated: number;
};

export type FixtureSeedCleanupPlan = {
  generatedAt: string;
  totalSeeds: number;
  candidateCount: number;
  preserveCount: number;
  deleteCount: number;
  seedIds: string[];
  claimIds: string[];
  enrichmentCandidateIds: string[];
  seedIdsForSuitcaseRemoval: string[];
  deleteCandidates: FixtureSeedRow[];
  preserved: FixtureSeedRow[];
  metricsBefore: FixtureSeedMetrics;
  metricsAfter: FixtureSeedMetrics;
  rollback: {
    generatedAt: string;
    seeds: IngestedSeedRecord[];
    claims: IngestionClaimRequest[];
    enrichmentCandidates: EnrichmentCandidate[];
    suitcases: SeedSuitcase[];
  };
};

export function isMelbourneBatch0Seed(seed: IngestedSeedRecord): boolean {
  const ref = seed.normalized?.sourceReference ?? '';
  return (
    seed.batchId === MELBOURNE_BATCH0_ID ||
    seed.campaignId === MELBOURNE_BATCH0_ID ||
    ref.includes(MELBOURNE_BATCH0_ID)
  );
}

export function hasIngestionRuntimeFootprint(
  seed: IngestedSeedRecord,
  ctx: IngestionArtifactContext,
): boolean {
  if (ctx.claims.some((c) => c.seedId === seed.id)) return true;
  if (ctx.suitcases.some((s) => s.seedId === seed.id)) return true;
  return ctx.enrichmentCandidates.some((c) => c.seedId === seed.id);
}

export function mustPreserveFixtureSeed(
  seed: IngestedSeedRecord,
  ctx: IngestionArtifactContext,
): { preserve: boolean; reason: string } {
  if (isMelbourneBatch0Seed(seed)) return { preserve: true, reason: 'melbourne_batch0' };
  if (seed.storeId) return { preserve: true, reason: 'linked_store' };
  if (seed.draftId) return { preserve: true, reason: 'linked_draft' };
  if (seed.ownerUserId) return { preserve: true, reason: 'has_owner' };
  if (['verified_owner', 'active'].includes(seed.verificationStatus)) {
    return { preserve: true, reason: `status_${seed.verificationStatus}` };
  }
  if (seed.verifiedAt || seed.activatedAt || seed.claimStartedAt) {
    return { preserve: true, reason: 'activation_timeline' };
  }
  if (hasIngestionRuntimeFootprint(seed, ctx)) {
    return { preserve: true, reason: 'ingestion_runtime_footprint' };
  }

  const ref = seed.normalized?.sourceReference ?? '';
  const name = seed.normalized?.businessName ?? '';
  const srcType = seed.normalized?.sourceType ?? '';

  const isRealDiscoverySource =
    (srcType === 'places_discovery' ||
      srcType === 'website_discovery' ||
      srcType === 'registry_api' ||
      srcType === 'partner_feed' ||
      srcType === 'licensed_feed' ||
      srcType === 'owner_submission' ||
      srcType === 'csv') &&
    !isTestSourceReference(ref) &&
    !SAMPLE_BUSINESS_RE.test(name) &&
    !ref.toLowerCase().includes('sample-opendata');

  if (isRealDiscoverySource && !seed.isTestData) {
    return { preserve: true, reason: 'real_discovery_source' };
  }

  return { preserve: false, reason: '' };
}

export function fixtureSeedDeleteReason(seed: IngestedSeedRecord): string | null {
  if (seed.isTestData) return 'tagged_isTestData';
  if (SAMPLE_BUSINESS_RE.test(seed.normalized?.businessName ?? '')) return 'sample_business_name';
  if (isTestSourceReference(seed.normalized?.sourceReference)) return 'test_source_reference';
  const ref = seed.normalized?.sourceReference ?? '';
  const srcType = seed.normalized?.sourceType ?? '';
  if (srcType === 'open_data_url' && /sample-opendata|fixtures?[/\\]/i.test(ref)) {
    return 'open_data_fixture_file';
  }
  if (
    seed.createdBySource &&
    ['mock_seed', 'qa_test', 'runtime_test', 'activation_test'].includes(seed.createdBySource)
  ) {
    return `createdBySource_${seed.createdBySource}`;
  }
  if (seed.verificationStatus === 'rejected' || seed.verificationStatus === 'duplicate') {
    return `status_${seed.verificationStatus}`;
  }
  return null;
}

export function isFixtureSeedDeleteCandidate(
  seed: IngestedSeedRecord,
  ctx: IngestionArtifactContext,
): { delete: boolean; reason: string } {
  const preserved = mustPreserveFixtureSeed(seed, ctx);
  if (preserved.preserve) return { delete: false, reason: preserved.reason };

  const deleteReason = fixtureSeedDeleteReason(seed);
  if (deleteReason) return { delete: true, reason: deleteReason };

  return { delete: false, reason: 'not_classified_fixture' };
}

export function computeSeedMetrics(seeds: IngestedSeedRecord[]): FixtureSeedMetrics {
  return {
    discovered: seeds.length,
    pendingQa: seeds.filter((s) => s.verificationStatus === 'seeded_pending_qa').length,
    claimable: seeds.filter((s) => s.verificationStatus === 'seeded_claimable').length,
    verified: seeds.filter((s) => s.verificationStatus === 'verified_owner').length,
    activated: seeds.filter((s) => s.verificationStatus === 'active').length,
  };
}

function toRow(seed: IngestedSeedRecord, reason: string): FixtureSeedRow {
  return {
    id: seed.id,
    businessName: seed.normalized?.businessName ?? null,
    batchId: seed.batchId ?? null,
    sourceType: seed.normalized?.sourceType ?? '',
    sourceReference: seed.normalized?.sourceReference ?? '',
    verificationStatus: seed.verificationStatus,
    reason,
  };
}

export async function buildFixtureSeedCleanupPlan(): Promise<FixtureSeedCleanupPlan> {
  const ctx = await loadIngestionArtifacts();
  const deleteCandidates: FixtureSeedRow[] = [];
  const preserved: FixtureSeedRow[] = [];
  const seedIds: string[] = [];

  for (const seed of ctx.seeds) {
    const verdict = isFixtureSeedDeleteCandidate(seed, ctx);
    if (verdict.delete) {
      deleteCandidates.push(toRow(seed, verdict.reason));
      seedIds.push(seed.id);
    } else {
      preserved.push(toRow(seed, verdict.reason));
    }
  }

  const deleteSet = new Set(seedIds);
  const remaining = ctx.seeds.filter((s) => !deleteSet.has(s.id));

  return {
    generatedAt: new Date().toISOString(),
    totalSeeds: ctx.seeds.length,
    candidateCount: deleteCandidates.length,
    preserveCount: preserved.length,
    deleteCount: seedIds.length,
    seedIds,
    claimIds: ctx.claims.filter((c) => deleteSet.has(c.seedId)).map((c) => c.id),
    enrichmentCandidateIds: ctx.enrichmentCandidates
      .filter((c) => deleteSet.has(c.seedId))
      .map((c) => c.id),
    seedIdsForSuitcaseRemoval: [...deleteSet],
    deleteCandidates,
    preserved,
    metricsBefore: computeSeedMetrics(ctx.seeds),
    metricsAfter: computeSeedMetrics(remaining),
    rollback: {
      generatedAt: new Date().toISOString(),
      seeds: ctx.seeds.filter((s) => deleteSet.has(s.id)),
      claims: ctx.claims.filter((c) => deleteSet.has(c.seedId)),
      enrichmentCandidates: ctx.enrichmentCandidates.filter((c) => deleteSet.has(c.seedId)),
      suitcases: ctx.suitcases.filter((s) => deleteSet.has(s.seedId)),
    },
  };
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch {
    return fallback;
  }
}

export async function executeFixtureSeedCleanup(
  plan: FixtureSeedCleanupPlan,
  options: { apply: boolean; rollbackPath?: string },
): Promise<void> {
  if (options.rollbackPath) {
    await fs.mkdir(path.dirname(options.rollbackPath), { recursive: true });
    await fs.writeFile(options.rollbackPath, JSON.stringify(plan.rollback, null, 2), 'utf8');
  }

  if (!options.apply) return;

  const dir = ingestionDir();
  const deleteSeedIds = new Set(plan.seedIds);

  const candidatesPath = path.join(dir, 'enrichment-candidates.json');
  const allCandidates = await readJsonFile<EnrichmentCandidate[]>(candidatesPath, []);
  const removeCandidateIds = new Set(plan.enrichmentCandidateIds);
  await fs.writeFile(
    candidatesPath,
    JSON.stringify(allCandidates.filter((c) => !removeCandidateIds.has(c.id)), null, 2),
    'utf8',
  );

  for (const seedId of plan.seedIdsForSuitcaseRemoval) {
    await fs.unlink(path.join(dir, 'seedSuitcase', `${seedId}.json`)).catch(() => undefined);
  }

  const claimsPath = path.join(dir, 'claims.json');
  const allClaims = await readJsonFile<IngestionClaimRequest[]>(claimsPath, []);
  const removeClaimIds = new Set(plan.claimIds);
  await fs.writeFile(
    claimsPath,
    JSON.stringify(allClaims.filter((c) => !removeClaimIds.has(c.id)), null, 2),
    'utf8',
  );

  const seedsPath = path.join(dir, 'seeds.json');
  const allSeeds = await readJsonFile<IngestedSeedRecord[]>(seedsPath, []);
  await fs.writeFile(
    seedsPath,
    JSON.stringify(allSeeds.filter((s) => !deleteSeedIds.has(s.id)), null, 2),
    'utf8',
  );
}

export function formatFixtureSeedDryRunMarkdown(plan: FixtureSeedCleanupPlan): string {
  const sampleDeletes = plan.deleteCandidates.slice(0, 25);
  const samplePreserves = plan.preserved
    .filter((p) => p.reason === 'melbourne_batch0')
    .slice(0, 15);

  return `# Fixture Seed Cleanup — Dry Run

Generated: ${plan.generatedAt}

**No mutations performed.** Seeds + ingestion JSON only (no stores, users, or runtime DB deletes).

## Summary

| Metric | Count |
|--------|------:|
| Total seeds | ${plan.totalSeeds} |
| Delete candidates | ${plan.candidateCount} |
| Preserve | ${plan.preserveCount} |
| **Would delete** | **${plan.deleteCount}** |

## Metrics projection

| Stage | Before | After |
|-------|-------:|------:|
| Discovered | ${plan.metricsBefore.discovered} | ${plan.metricsAfter.discovered} |
| Pending QA | ${plan.metricsBefore.pendingQa} | ${plan.metricsAfter.pendingQa} |
| Claimable | ${plan.metricsBefore.claimable} | ${plan.metricsAfter.claimable} |
| Verified | ${plan.metricsBefore.verified} | ${plan.metricsAfter.verified} |
| Activated | ${plan.metricsBefore.activated} | ${plan.metricsAfter.activated} |

## Would delete (sample)

${sampleDeletes.map((r) => `- \`${r.id}\` — ${r.businessName ?? 'unnamed'} (${r.reason})`).join('\n') || '_none_'}

${plan.deleteCandidates.length > 25 ? `\n_…and ${plan.deleteCandidates.length - 25} more_\n` : ''}

## Melbourne Batch 0 preserved (sample)

${samplePreserves.map((r) => `- \`${r.id}\` — ${r.businessName ?? 'unnamed'}`).join('\n') || '_none in current dataset_'}

## Preserved (all)

${plan.preserved.map((r) => `- \`${r.id}\` — ${r.businessName ?? 'unnamed'} (${r.reason || 'preserve'})`).join('\n') || '_none_'}

## Related ingestion artifacts

| Artifact | Count |
|----------|------:|
| Claims | ${plan.claimIds.length} |
| Enrichment candidates | ${plan.enrichmentCandidateIds.length} |
| Seed suitcases | ${plan.seedIdsForSuitcaseRemoval.length} |
`;
}

export function printFixtureSeedSummary(plan: FixtureSeedCleanupPlan): void {
  console.log('FIXTURE SEED CLEANUP PLAN');
  console.log(`  Total seeds:        ${plan.totalSeeds}`);
  console.log(`  Delete candidates:  ${plan.candidateCount}`);
  console.log(`  Preserve:           ${plan.preserveCount}`);
  console.log(`  Would delete:       ${plan.deleteCount}`);
  console.log('');
  console.log('Metrics projection:');
  console.log(
    `  Discovered:  ${plan.metricsBefore.discovered} → ${plan.metricsAfter.discovered}`,
  );
  console.log(
    `  Pending QA:  ${plan.metricsBefore.pendingQa} → ${plan.metricsAfter.pendingQa}`,
  );
  console.log(
    `  Claimable:   ${plan.metricsBefore.claimable} → ${plan.metricsAfter.claimable}`,
  );
}
