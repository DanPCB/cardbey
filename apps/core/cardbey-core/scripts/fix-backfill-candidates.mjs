/**
 * Repair PUBLISHED_STORES_BACKFILL candidates that fail enrichment in <3ms.
 *
 * Root cause (Step 1): multiSourceEnrichmentAgent called socialLinks.find when
 * socialLinks was null/undefined → TypeError → ENRICHMENT_ERROR. Status
 * NEEDS_ENRICHMENT is not in the typed lifecycle set; normalize to PENDING_QA.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/fix-backfill-candidates.mjs
 *   node scripts/fix-backfill-candidates.mjs --dry-run
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..');
const CANDIDATES_PATH = path.join(CORE_ROOT, 'data', 'businessCandidates', 'candidates.json');
const BATCH_ID = 'PUBLISHED_STORES_BACKFILL';
/** Typed BusinessCandidateStatus — enrichment does not filter on this, but QA UI does. */
const ACCEPTED_STATUS = 'PENDING_QA';

const dryRun = process.argv.includes('--dry-run');

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
