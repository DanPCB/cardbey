/**
 * Repair helpers — link claimable ingestion seeds to already-published stores.
 */

import type { IngestedSeedRecord } from './discovery-data-audit.ts';
import {
  findPublishedStoreForSeed,
  normalizeBusinessIdentityName,
  type PublishedStoreIdentity,
} from '../../apps/core/cardbey-core/src/lib/businessIngestion/publishedStoreSeedMatch.js';

export type SeedStoreLinkRepairCandidate = {
  seedId: string;
  seedBusinessName: string | null;
  seedStatus: string;
  seedStoreId: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
  draftId: string | null;
  matchReason: 'name' | 'slug';
};

export type SeedStoreLinkRepairPlan = {
  candidates: SeedStoreLinkRepairCandidate[];
  skippedAlreadyLinked: number;
  skippedNoMatch: number;
};

export function isRepairableSeed(seed: IngestedSeedRecord): boolean {
  if (seed.storeId) return false;
  if (seed.verificationStatus === 'rejected' || seed.verificationStatus === 'duplicate') {
    return false;
  }
  return seed.claimable === true || seed.verificationStatus === 'seeded_claimable';
}

export function planSeedStoreLinkRepairs(input: {
  seeds: IngestedSeedRecord[];
  stores: PublishedStoreIdentity[];
  draftIdByStoreId?: Map<string, string | null>;
}): SeedStoreLinkRepairPlan {
  const { seeds, stores, draftIdByStoreId = new Map() } = input;
  const publishedStores = stores.filter((s) => s.publishedAt != null);
  let skippedAlreadyLinked = 0;
  let skippedNoMatch = 0;
  const candidates: SeedStoreLinkRepairCandidate[] = [];
  const claimedStoreIds = new Set<string>();

  for (const seed of seeds) {
    if (seed.storeId) {
      skippedAlreadyLinked += 1;
      continue;
    }
    if (!isRepairableSeed(seed)) continue;

    const match = findPublishedStoreForSeed(seed, publishedStores);
    if (!match) {
      skippedNoMatch += 1;
      continue;
    }
    if (claimedStoreIds.has(match.id)) continue;
    claimedStoreIds.add(match.id);

    const seedName = normalizeBusinessIdentityName(seed.normalized.businessName);
    const storeName = normalizeBusinessIdentityName(match.name);
    candidates.push({
      seedId: seed.id,
      seedBusinessName: seed.normalized.businessName ?? null,
      seedStatus: seed.verificationStatus,
      seedStoreId: seed.storeId,
      storeId: match.id,
      storeName: match.name,
      storeSlug: match.slug,
      draftId: draftIdByStoreId.get(match.id) ?? null,
      matchReason: seedName === storeName ? 'name' : 'slug',
    });
  }

  return { candidates, skippedAlreadyLinked, skippedNoMatch };
}

export function formatSeedStoreLinkRepairReport(plan: SeedStoreLinkRepairPlan, apply: boolean): string {
  const now = new Date().toISOString();
  const lines = [
    `# Seed ↔ Store Link Repair`,
    '',
    `Generated: ${now}`,
    `Mode: ${apply ? '**APPLIED**' : '**DRY RUN**'}`,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|------:|',
    `| Repair candidates | ${plan.candidates.length} |`,
    `| Skipped (already linked) | ${plan.skippedAlreadyLinked} |`,
    `| Skipped (no published match) | ${plan.skippedNoMatch} |`,
    '',
  ];

  if (plan.candidates.length) {
    lines.push('## Candidates', '');
    for (const c of plan.candidates) {
      lines.push(
        `- **${c.seedBusinessName ?? c.seedId}** — seed \`${c.seedId}\` (${c.seedStatus}) → store \`${c.storeId}\` (\`${c.storeSlug}\`) via ${c.matchReason}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
