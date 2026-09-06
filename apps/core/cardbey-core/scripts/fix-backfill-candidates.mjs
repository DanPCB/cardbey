/**
 * Repair PUBLISHED_STORES_BACKFILL candidates that fail enrichment in <3ms.
 *
 * Root cause (Step 1): multiSourceEnrichmentAgent called socialLinks.find when
 * socialLinks was null/undefined → TypeError → ENRICHMENT_ERROR. Status
 * NEEDS_ENRICHMENT is not in the typed lifecycle set; normalize to PENDING_QA.
 *
 * Resolves the same store root as the API (BUSINESS_CANDIDATE_DIR →
 * data/businessCandidates → /tmp/cardbey/businessCandidates).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/fix-backfill-candidates.mjs
 *   node scripts/fix-backfill-candidates.mjs --dry-run
 *
 * If Fixed 0: recreate inventory first:
 *   pnpm exec tsx scripts/seed-published-stores-backfill-candidates.ts --dry-run
 */

import { accessSync, constants, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..');
const BATCH_ID = 'PUBLISHED_STORES_BACKFILL';
/** Typed BusinessCandidateStatus — enrichment does not filter on this, but QA UI does. */
const ACCEPTED_STATUS = 'PENDING_QA';

const dryRun = process.argv.includes('--dry-run');

function isWritableDirectory(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    writeFileSync(probe, 'ok', 'utf8');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveStoreRoot() {
  const configured = process.env.BUSINESS_CANDIDATE_DIR?.trim();
  const candidates = [
    configured,
    path.join(CORE_ROOT, 'data', 'businessCandidates'),
    path.join(os.tmpdir(), 'cardbey', 'businessCandidates'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (!isWritableDirectory(dir)) continue;
    if (configured && dir !== configured) {
      console.warn(`[fix-backfill] BUSINESS_CANDIDATE_DIR=${configured} not writable; using ${dir}`);
    }
    return dir;
  }
  throw new Error(`No writable candidate store (tried: ${candidates.join(', ')})`);
}

const storeRoot = resolveStoreRoot();
const CANDIDATES_PATH = path.join(storeRoot, 'candidates.json');
console.log(`[fix-backfill] candidates path: ${CANDIDATES_PATH}`);

if (!existsSync(CANDIDATES_PATH)) {
  console.error(
    `candidates.json missing at ${CANDIDATES_PATH}.\n` +
      'Recreate backfill inventory:\n' +
      '  pnpm exec tsx scripts/seed-published-stores-backfill-candidates.ts --dry-run\n' +
      '  pnpm exec tsx scripts/seed-published-stores-backfill-candidates.ts',
  );
  process.exit(1);
}

const raw = readFileSync(CANDIDATES_PATH, 'utf8');
const candidates = JSON.parse(raw);
if (!Array.isArray(candidates)) {
  console.error('candidates.json must be an array');
  process.exit(1);
}

let fixed = 0;
const updated = candidates.map((c) => {
  if (!c || typeof c !== 'object') return c;
  if (c.batchId !== BATCH_ID && !String(c.id ?? '').startsWith('published:')) return c;

  fixed += 1;
  const storeId =
    (typeof c.storeId === 'string' && c.storeId.trim()) ||
    (String(c.id ?? '').startsWith('published:') ? String(c.id).slice('published:'.length) : null);

  return {
    ...c,
    // Keep published:{storeId} id — agent does not reject it; storeId drives Business write-back.
    id: c.id,
    storeId: storeId ?? c.storeId ?? null,
    status: ACCEPTED_STATUS,
    enrichmentStatus: c.enrichmentStatus === 'enriched' ? c.enrichmentStatus : 'unenriched',
    name: (typeof c.name === 'string' && c.name.trim()) || 'Unknown Business',
    suburb: c.suburb ?? c.city ?? 'Melbourne',
    country: c.country ?? 'AU',
    socialLinks: Array.isArray(c.socialLinks) ? c.socialLinks : [],
    enrichmentNote: null,
    flags: Array.isArray(c.flags) ? c.flags.filter((f) => f !== 'ENRICHMENT_ERROR') : [],
  };
});

if (!dryRun) {
  writeFileSync(CANDIDATES_PATH, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
}

console.log(`${dryRun ? '[dry-run] would fix' : 'Fixed'} ${fixed} backfill candidates`);
if (fixed === 0) {
  console.error(
    'No PUBLISHED_STORES_BACKFILL / published: rows in this file.\n' +
      'Seed from Business first:\n' +
      '  pnpm exec tsx scripts/seed-published-stores-backfill-candidates.ts --dry-run\n' +
      '  pnpm exec tsx scripts/seed-published-stores-backfill-candidates.ts',
  );
}

const sample = updated.find(
  (c) => c?.batchId === BATCH_ID || String(c?.id ?? '').startsWith('published:'),
);
console.log(
  'Sample:',
  JSON.stringify(
    {
      id: sample?.id,
      status: sample?.status,
      name: sample?.name,
      suburb: sample?.suburb,
      storeId: sample?.storeId,
      socialLinks: sample?.socialLinks,
      enrichmentStatus: sample?.enrichmentStatus,
    },
    null,
    2,
  ),
);
