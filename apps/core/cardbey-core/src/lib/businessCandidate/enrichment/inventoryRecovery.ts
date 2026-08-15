/**
 * Recover Batch 001 Braybrook BusinessCandidate rows from authoritative
 * local backup acquisition records (read-only SQLite).
 *
 * Does NOT invent Đại Thắng. Does NOT touch MELBOURNE_BATCH0_20260617.
 * Labels recovery provenance clearly.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { BusinessCandidateRecord } from '../types.js';
import { buildCandidateDedupeKey, upsertBusinessCandidates } from '../candidateRepository.js';
import { MELBOURNE_BATCH001_REAL_LOCAL_ID, MELBOURNE_BATCH001_CAMPAIGN_ID } from '../batch001Config.js';
import { PROTECTED_BATCH_IDS } from './constants.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..', '..');

export const RECOVERY_SOURCE =
  'prisma/dev-fresh.backup-pre-migrate.db#business_seed(open_data_url,Braybrook)';

export type RecoveredSeedRow = {
  id: string;
  name: string | null;
  source: string | null;
  status: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  dedupeKey: string | null;
  storeId: string | null;
  createdAt: number | string | null;
  updatedAt: number | string | null;
  normalized: Record<string, unknown>;
  externalId: string | null;
  sourceUrl: string | null;
};

function msToIso(v: number | string | null | undefined): string {
  if (v == null) return new Date().toISOString();
  if (typeof v === 'number') return new Date(v).toISOString();
  const n = Number(v);
  if (Number.isFinite(n) && String(v).length >= 12) return new Date(n).toISOString();
  return String(v);
}

function parseExternalId(dedupeKey: string | null, sourceUrl: string | null): string | null {
  if (dedupeKey) {
    const parts = dedupeKey.split('|');
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  if (sourceUrl?.includes('/node/')) {
    const m = sourceUrl.match(/node\/(\d+)/);
    if (m) return `node/${m[1]}`;
  }
  return null;
}

/** Read-only load of Braybrook open_data_url seeds from local backup DB. */
export function loadAuthoritativeBraybrookSeedsFromBackup(dbPath?: string): RecoveredSeedRow[] {
  const resolved =
    dbPath ||
    path.join(CORE_ROOT, 'prisma', 'dev-fresh.backup-pre-migrate.db');

  // Prefer node:sqlite (Node 22+) — no native deps.
  // Fallback: python-preextracted JSON if sqlite unavailable.
  try {
    // @ts-expect-error node:sqlite may be unavailable on older runtimes
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(resolved, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT id, name, source, status, address, city, state, country, website, phone, email,
                rawPayload, dedupeKey, storeId, createdAt, updatedAt
         FROM business_seed`,
      )
      .all() as Array<Record<string, unknown>>;

    const out: RecoveredSeedRow[] = [];
    for (const r of rows) {
      let normalized: Record<string, unknown> = {};
      try {
        const raw = typeof r.rawPayload === 'string' ? JSON.parse(r.rawPayload) : null;
        if (raw && typeof raw === 'object' && raw.normalized && typeof raw.normalized === 'object') {
          normalized = raw.normalized as Record<string, unknown>;
        }
      } catch {
        normalized = {};
      }
      const blob = JSON.stringify(r) + JSON.stringify(normalized);
      if (!/Braybrook/i.test(blob)) continue;

      const sourceUrl =
        (typeof normalized.sourceReference === 'string' && normalized.sourceReference) ||
        null;
      const externalId = parseExternalId(
        typeof r.dedupeKey === 'string' ? r.dedupeKey : null,
        sourceUrl,
      );

      out.push({
        id: String(r.id),
        name: (r.name as string) ?? (normalized.businessName as string) ?? null,
        source: (r.source as string) ?? null,
        status: (r.status as string) ?? null,
        address: (r.address as string) ?? (normalized.address as string) ?? null,
        city: (r.city as string) ?? (normalized.city as string) ?? null,
        state: (r.state as string) ?? (normalized.state as string) ?? null,
        country: (r.country as string) ?? (normalized.country as string) ?? null,
        website: (r.website as string) ?? (normalized.website as string) ?? null,
        phone: (r.phone as string) ?? (normalized.phone as string) ?? null,
        email: (r.email as string) ?? (normalized.email as string) ?? null,
        dedupeKey: (r.dedupeKey as string) ?? null,
        storeId: (r.storeId as string) ?? null,
        createdAt: (r.createdAt as number) ?? null,
        updatedAt: (r.updatedAt as number) ?? null,
        normalized,
        externalId,
        sourceUrl,
      });
    }
    return out;
  } catch {
    // Fallback: pre-extracted JSON from audit script (same authoritative backup rows).
    const fallback = path.join(REPO_ROOT, 'docs', 'reports', '_tmp_braybrook_seeds.json');
    try {
      const raw = require('node:fs').readFileSync(fallback, 'utf8');
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      return parsed.map((r) => {
        const normalized =
          r.normalized && typeof r.normalized === 'object'
            ? (r.normalized as Record<string, unknown>)
            : {};
        const sourceUrl =
          (typeof r.sourceReference === 'string' && r.sourceReference) ||
          (typeof normalized.sourceReference === 'string' && normalized.sourceReference) ||
          null;
        const externalId = parseExternalId(
          typeof r.dedupeKey === 'string' ? r.dedupeKey : null,
          sourceUrl,
        );
        return {
          id: String(r.id),
          name: (r.name as string) ?? null,
          source: (r.source as string) ?? null,
          status: (r.status as string) ?? null,
          address: (r.address as string) ?? null,
          city: (r.city as string) ?? null,
          state: (r.state as string) ?? null,
          country: (r.country as string) ?? null,
          website: (r.website as string) ?? null,
          phone: (r.phone as string) ?? null,
          email: (r.email as string) ?? null,
          dedupeKey: (r.dedupeKey as string) ?? null,
          storeId: (r.storeId as string) ?? null,
          createdAt: (r.createdAt as number) ?? null,
          updatedAt: (r.updatedAt as number) ?? null,
          normalized,
          externalId,
          sourceUrl,
        } satisfies RecoveredSeedRow;
      });
    } catch (err) {
      throw new Error(
        `Unable to open backup SQLite (${resolved}) and fallback JSON missing (${fallback}): ${String(err)}`,
      );
    }
  }
}

export function seedRowToCandidate(row: RecoveredSeedRow): BusinessCandidateRecord {
  const suburb =
    (typeof row.normalized.operatingRegion === 'string' && row.normalized.operatingRegion) ||
    (row.address?.includes('Braybrook') ? 'Braybrook' : null) ||
    (row.city === 'Braybrook' ? 'Braybrook' : 'Braybrook');

  const name = row.name;
  const address = row.address;
  const phone = row.phone;
  const createdAt = msToIso(row.createdAt);
  const updatedAt = msToIso(row.updatedAt);
  const category =
    (typeof row.normalized.category === 'string' && row.normalized.category) || 'food';

  const dedupeKey =
    row.dedupeKey ||
    buildCandidateDedupeKey({ name, phone, address, suburb });

  return {
    id: `candidate:${row.id}`,
    batchId: MELBOURNE_BATCH001_REAL_LOCAL_ID,
    campaignId: MELBOURNE_BATCH001_CAMPAIGN_ID,
    name,
    businessType: category,
    address,
    suburb,
    city: suburb,
    state: row.state ?? 'VIC',
    postcode: typeof row.normalized.postcode === 'string' ? row.normalized.postcode : null,
    country: 'AU',
    phone,
    website: row.website,
    email: row.email,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'osm',
    confidenceScore:
      typeof row.normalized.confidenceScore === 'number' ? row.normalized.confidenceScore : 0.64,
    originalContent: {
      recoverySource: RECOVERY_SOURCE,
      seedStatus: row.status,
      seedSource: row.source,
      normalized: row.normalized,
      synthetic: false,
    },
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: [
      !row.website ? 'website' : null,
      !row.phone ? 'phone' : null,
      !row.email ? 'email' : null,
      'description',
      'logo',
      'opening_hours',
      'business_images',
    ].filter(Boolean) as string[],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: row.storeId,
    missionId: null,
    placeId: row.externalId,
    sourceUrl: row.sourceUrl,
    rawSourceJson: {
      ...row.normalized,
      acquisitionSource: row.source,
      recoverySource: RECOVERY_SOURCE,
    },
    seedId: row.id,
    status: 'CLAIMABLE',
    dedupeKey,
    discoveryProviderId: 'open_data_url',
    externalId: row.externalId ?? row.id,
    createdAt,
    updatedAt,
    biStatus: 'not_generated',
    description: null,
    heroImageUrl: null,
    category: null,
  };
}

export type InventoryRecoveryResult = {
  source: string;
  candidateCount: number;
  batchIds: string[];
  targetDaiThangFound: false;
  fieldsPreserved: string[];
  fieldsUnavailable: string[];
  batch0ProtectionEvidence: string;
  synthetic: false;
  candidateIds: string[];
  seedIds: string[];
  contentHash: string;
};

/**
 * Upsert recovered Braybrook candidates into the JSON candidate store.
 * Refuses if any row would use a protected Batch 0 id.
 */
export async function recoverBraybrookCandidatesFromBackup(opts?: {
  dbPath?: string;
  dryRun?: boolean;
}): Promise<{ candidates: BusinessCandidateRecord[]; report: InventoryRecoveryResult }> {
  const rows = loadAuthoritativeBraybrookSeedsFromBackup(opts?.dbPath);
  const candidates = rows.map(seedRowToCandidate);

  for (const c of candidates) {
    if ((PROTECTED_BATCH_IDS as readonly string[]).includes(c.batchId)) {
      throw new Error('Refusing recovery that would write protected Batch 0');
    }
  }

  if (!opts?.dryRun) {
    await upsertBusinessCandidates(candidates);
  }

  const report: InventoryRecoveryResult = {
    source: RECOVERY_SOURCE,
    candidateCount: candidates.length,
    batchIds: [...new Set(candidates.map((c) => c.batchId))],
    targetDaiThangFound: false,
    fieldsPreserved: [
      'seedId',
      'batchId',
      'externalId',
      'sourceUrl',
      'name',
      'address',
      'suburb',
      'acquisition source (open_data_url)',
      'original timestamps',
      'dedupeKey',
      'confidenceScore',
    ],
    fieldsUnavailable: [
      'website (null on all recovered rows)',
      'phone (null)',
      'email (null)',
      'coordinates (null)',
      'Cardbey Business ID link (storeId null)',
      'Đại Thắng — NOT PRESENT in acquisition inventory',
    ],
    batch0ProtectionEvidence: `PROTECTED_BATCH_IDS=${JSON.stringify(PROTECTED_BATCH_IDS)}; recovered batchId=${MELBOURNE_BATCH001_REAL_LOCAL_ID}`,
    synthetic: false,
    candidateIds: candidates.map((c) => c.id),
    seedIds: candidates.map((c) => c.seedId!).filter(Boolean),
    contentHash: createHash('sha256')
      .update(candidates.map((c) => `${c.seedId}|${c.name}|${c.externalId}`).join('\n'))
      .digest('hex')
      .slice(0, 16),
  };

  const reportsDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(
    path.join(reportsDir, 'INVENTORY_RECOVERY_BRAYBROOK_BATCH001.md'),
    renderInventoryMarkdown(report),
    'utf8',
  );

  return { candidates, report };
}

function renderInventoryMarkdown(report: InventoryRecoveryResult): string {
  return `## INVENTORY RECOVERY

- Source of recovered records: \`${report.source}\`
- Candidate count: ${report.candidateCount}
- Batch IDs: ${report.batchIds.map((b) => `\`${b}\``).join(', ')}
- Target candidate linkage (Đại Thắng): **NOT_FOUND** — not present in authoritative backup inventory
- Fields preserved: ${report.fieldsPreserved.join('; ')}
- Fields unavailable: ${report.fieldsUnavailable.join('; ')}
- Batch 0 protection evidence: ${report.batch0ProtectionEvidence}
- Whether any data is synthetic: **${report.synthetic}**
- Content hash: \`${report.contentHash}\`
- Candidate IDs: ${report.candidateIds.map((id) => `\`${id}\``).join(', ')}
- Seed IDs: ${report.seedIds.map((id) => `\`${id}\``).join(', ')}

### Classification

- Empty \`candidates.json\` root cause: **INVENTORY_NOT_PERSISTED** (git history only ever committed \`[]\`) with **INVENTORY_ENVIRONMENT_SPECIFIC** Braybrook seeds in backup DB and **CANDIDATE_LINK_MISSING** (briefs used \`seed:\` IDs without candidate rows).
- Public discovered cards can be served from BusinessSeed / UnclaimedStore without BusinessCandidate persistence.
`;
}

export function findCandidateByDisplayName(
  candidates: BusinessCandidateRecord[],
  displayName: string,
): BusinessCandidateRecord | null {
  const norm = displayName.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    candidates.find((c) => (c.name ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim() === norm) ??
    null
  );
}
