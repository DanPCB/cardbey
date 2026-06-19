/**
 * Melbourne Batch 0 idempotent restore helpers.
 * Used by `pnpm restore:melbourne-batch0` after staging deploys.
 */

import type { IngestedSeedRecord } from './discovery-data-audit.ts';
import { MELBOURNE_BATCH0_ID, isMelbourneBatch0Seed } from './fixture-seed-cleanup.ts';

export { MELBOURNE_BATCH0_ID };

export const MELBOURNE_BATCH0_EXPECTED_DISCOVERED = 10;

export const MELBOURNE_BATCH0_BUSINESS_NAMES = [
  'Brunetti Carlton',
  "Pellegrini's Espresso Bar",
  'Readings Carlton',
  'Heartland Beauty Fitzroy',
  'Grub Food Van',
  'Rose Street Artists Market',
  'Fitzroy Vet Hospital',
  'Yoga 213',
  'Lune Croissanterie Fitzroy',
  'Minano Handroll Bar',
] as const;

export type MelbourneBatchRestoreMetrics = {
  discovered: number;
  pendingQa: number;
  claimable: number;
  verified: number;
  activated: number;
  operating: number;
  duplicateNames: string[];
};

export type GovernanceSnapshot = {
  id: string;
  businessName: string | null;
  verificationStatus: string;
  claimable: boolean;
  storeId: string | null;
};

export type MelbourneBatchRestoreReport = {
  batchId: string;
  before: MelbourneBatchRestoreMetrics;
  after: MelbourneBatchRestoreMetrics;
  seedsCreated: number;
  seedsUpdated: number;
  seedsSkippedExisting: number;
  governancePreserved: boolean;
  preservedRows: Array<{
    id: string;
    businessName: string | null;
    statusBefore: string;
    statusAfter: string;
    preserved: boolean;
  }>;
  acceptance: MelbourneBatchRestoreAcceptance;
};

export type MelbourneBatchRestoreAcceptance = {
  ok: boolean;
  checks: Array<{ label: string; expected: string; actual: string; pass: boolean }>;
};

export function normalizeBatchBusinessName(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function filterMelbourneBatch0Seeds(seeds: IngestedSeedRecord[]): IngestedSeedRecord[] {
  return seeds.filter(isMelbourneBatch0Seed);
}

export function findDuplicateBatchNames(seeds: IngestedSeedRecord[]): string[] {
  const seen = new Map<string, string>();
  const dupes = new Set<string>();
  for (const seed of seeds) {
    const name = normalizeBatchBusinessName(seed.normalized?.businessName);
    if (!name) continue;
    if (seen.has(name)) dupes.add(name);
    else seen.set(name, seed.id);
  }
  return [...dupes].sort();
}

export function buildMelbourneBatchRestoreMetrics(
  seeds: IngestedSeedRecord[],
): MelbourneBatchRestoreMetrics {
  const batch = filterMelbourneBatch0Seeds(seeds);
  return {
    discovered: batch.length,
    pendingQa: batch.filter((s) => s.verificationStatus === 'seeded_pending_qa').length,
    claimable: batch.filter((s) => s.verificationStatus === 'seeded_claimable').length,
    verified: batch.filter((s) => s.verificationStatus === 'verified_owner').length,
    activated: batch.filter((s) => s.verificationStatus === 'active').length,
    operating: batch.filter((s) => s.verificationStatus === 'active' && Boolean(s.storeId)).length,
    duplicateNames: findDuplicateBatchNames(batch),
  };
}

export function captureGovernanceSnapshot(seeds: IngestedSeedRecord[]): GovernanceSnapshot[] {
  return filterMelbourneBatch0Seeds(seeds)
    .filter((s) =>
      ['seeded_claimable', 'verified_owner', 'active'].includes(s.verificationStatus),
    )
    .map((s) => ({
      id: s.id,
      businessName: s.normalized?.businessName ?? null,
      verificationStatus: s.verificationStatus,
      claimable: s.claimable === true,
      storeId: s.storeId ?? null,
    }));
}

const PRESERVED_STATUSES = new Set(['seeded_claimable', 'verified_owner', 'active']);

export function validateGovernancePreserved(
  before: GovernanceSnapshot[],
  afterSeeds: IngestedSeedRecord[],
): {
  ok: boolean;
  rows: MelbourneBatchRestoreReport['preservedRows'];
} {
  const afterById = new Map(filterMelbourneBatch0Seeds(afterSeeds).map((s) => [s.id, s]));
  const rows = before.map((snap) => {
    const current = afterById.get(snap.id);
    const statusAfter = current?.verificationStatus ?? 'missing';
    const preserved =
      current != null &&
      PRESERVED_STATUSES.has(snap.verificationStatus) &&
      current.verificationStatus === snap.verificationStatus &&
      current.claimable === snap.claimable &&
      (current.storeId ?? null) === snap.storeId;
    return {
      id: snap.id,
      businessName: snap.businessName,
      statusBefore: snap.verificationStatus,
      statusAfter,
      preserved,
    };
  });
  return { ok: rows.every((r) => r.preserved), rows };
}

export function validateMelbourneBatchRestoreAcceptance(
  after: MelbourneBatchRestoreMetrics,
): MelbourneBatchRestoreAcceptance {
  const checks = [
    {
      label: 'Discovered',
      expected: String(MELBOURNE_BATCH0_EXPECTED_DISCOVERED),
      actual: String(after.discovered),
      pass: after.discovered === MELBOURNE_BATCH0_EXPECTED_DISCOVERED,
    },
    {
      label: 'No duplicate business names',
      expected: '0',
      actual: String(after.duplicateNames.length),
      pass: after.duplicateNames.length === 0,
    },
  ];
  return { ok: checks.every((c) => c.pass), checks };
}

export function buildBatchNameIndex(
  batchSeeds: IngestedSeedRecord[],
): Map<string, IngestedSeedRecord> {
  const index = new Map<string, IngestedSeedRecord>();
  for (const seed of batchSeeds) {
    const name = normalizeBatchBusinessName(seed.normalized?.businessName);
    if (name && !index.has(name)) index.set(name, seed);
  }
  return index;
}

type ReconcileSeedFns = {
  reconcileIngestionSeeds: (
    incoming: IngestedSeedRecord[],
    existing: IngestedSeedRecord[],
  ) => {
    seeds: IngestedSeedRecord[];
    seedsCreated: number;
    seedsUpdated: number;
    seedsSkippedExisting: number;
  };
  findExistingSeed: (
    incoming: IngestedSeedRecord,
    index: {
      bySourceKey: Map<string, IngestedSeedRecord>;
      byIdentity: Map<string, IngestedSeedRecord>;
    },
  ) => IngestedSeedRecord | null;
  indexExistingSeeds: (existing: IngestedSeedRecord[]) => {
    bySourceKey: Map<string, IngestedSeedRecord>;
    byIdentity: Map<string, IngestedSeedRecord>;
  };
  mergeIncomingSeed: (
    existing: IngestedSeedRecord,
    incoming: IngestedSeedRecord,
  ) => IngestedSeedRecord;
  factualDigest: (seed: IngestedSeedRecord) => string;
};

/** Reconcile pilot seeds — source/identity match first, then batch business name. */
export function reconcileMelbourneBatchRestore(
  incoming: IngestedSeedRecord[],
  existing: IngestedSeedRecord[],
  fns: ReconcileSeedFns,
): {
  seeds: IngestedSeedRecord[];
  seedsCreated: number;
  seedsUpdated: number;
  seedsSkippedExisting: number;
} {
  const batchExisting = filterMelbourneBatch0Seeds(existing);
  const nameIndex = buildBatchNameIndex(batchExisting);
  const index = fns.indexExistingSeeds(existing);
  const out: IngestedSeedRecord[] = [];
  let seedsCreated = 0;
  let seedsUpdated = 0;
  let seedsSkippedExisting = 0;

  for (const candidate of incoming) {
    let match = fns.findExistingSeed(candidate, index);
    if (!match) {
      const name = normalizeBatchBusinessName(candidate.normalized?.businessName);
      match = name ? nameIndex.get(name) ?? null : null;
    }

    if (!match) {
      out.push(candidate);
      seedsCreated++;
      const sk = candidate.normalized
        ? `${candidate.normalized.sourceType}|${candidate.normalized.sourceReference}|${candidate.normalized.sourceRowId}`
        : candidate.id;
      index.bySourceKey.set(sk, candidate);
      continue;
    }

    const merged = fns.mergeIncomingSeed(match, candidate);
    if (fns.factualDigest(merged) === fns.factualDigest(match)) {
      out.push(match);
      seedsSkippedExisting++;
      continue;
    }

    out.push(merged);
    seedsUpdated++;
    const sk = merged.normalized
      ? `${merged.normalized.sourceType}|${merged.normalized.sourceReference}|${merged.normalized.sourceRowId}`
      : merged.id;
    index.bySourceKey.set(sk, merged);
  }

  return { seeds: out, seedsCreated, seedsUpdated, seedsSkippedExisting };
}

export function formatMelbourneBatchRestoreReport(report: MelbourneBatchRestoreReport): string {
  const lines: string[] = [
    '# Melbourne Batch 0 Restore Report',
    '',
    `Batch ID: \`${report.batchId}\``,
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Counts',
    '',
    '| Metric | Before | After |',
    '|--------|-------:|------:|',
    `| Discovered | ${report.before.discovered} | ${report.after.discovered} |`,
    `| Pending QA | ${report.before.pendingQa} | ${report.after.pendingQa} |`,
    `| Claimable | ${report.before.claimable} | ${report.after.claimable} |`,
    `| Verified | ${report.before.verified} | ${report.after.verified} |`,
    `| Activated | ${report.before.activated} | ${report.after.activated} |`,
    `| Operating | ${report.before.operating} | ${report.after.operating} |`,
    `| Duplicate names | ${report.before.duplicateNames.length} | ${report.after.duplicateNames.length} |`,
    '',
    '## Restore actions',
    '',
    `| Action | Count |`,
    `|--------|------:|`,
    `| Seeds created | ${report.seedsCreated} |`,
    `| Seeds updated | ${report.seedsUpdated} |`,
    `| Seeds skipped (unchanged) | ${report.seedsSkippedExisting} |`,
    '',
    '## Acceptance',
    '',
    '| Check | Expected | Actual | Status |',
    '|-------|----------|--------|--------|',
  ];

  for (const check of report.acceptance.checks) {
    lines.push(
      `| ${check.label} | ${check.expected} | ${check.actual} | ${check.pass ? 'PASS' : 'FAIL'} |`,
    );
  }
  lines.push(
    `| Existing claimable/verified/activated preserved | yes | ${report.governancePreserved ? 'yes' : 'no'} | ${report.governancePreserved ? 'PASS' : 'FAIL'} |`,
  );

  if (report.preservedRows.length) {
    lines.push('', '## Preserved governance rows', '');
    for (const row of report.preservedRows) {
      lines.push(
        `- **${row.businessName ?? row.id}** — ${row.statusBefore} → ${row.statusAfter} — ${row.preserved ? 'preserved' : 'CHANGED'}`,
      );
    }
  }

  if (report.after.duplicateNames.length) {
    lines.push('', '## Duplicate names (must be empty)', '');
    for (const name of report.after.duplicateNames) {
      lines.push(`- ${name}`);
    }
  }

  lines.push('', `**Overall:** ${report.acceptance.ok && report.governancePreserved ? 'PASS' : 'REVIEW REQUIRED'}`);
  return lines.join('\n');
}
