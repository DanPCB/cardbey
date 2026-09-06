#!/usr/bin/env node
/**
 * Opt-in multi-source BusinessCandidate enrichment.
 *
 *   pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL
 *   pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL --dry-run
 *   pnpm enrich:candidates -- --batchId=PUBLISHED_STORES_BACKFILL --maxCandidates=3
 *
 * Run from monorepo root (script lives in scripts/, not apps/core/cardbey-core/scripts).
 *
 * Rules:
 * - --batchId is REQUIRED (no default; bare invoke errors)
 * - Never enriches MELBOURNE_BATCH0_20260617 (guard in agent loop)
 * - Writes BusinessCandidate + enriched-field-provenance.json only
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length).trim() || null;
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1].trim();
  }
  return null;
}

async function main() {
  const batchId = readArg('batchId');
  if (!batchId) {
    console.error(
      'Error: --batchId is required.\n' +
        'Usage: pnpm enrich:candidates -- --batchId=<BATCH_ID> [--maxCandidates=N] [--dry-run]\n' +
        'Refusing to enrich all candidates without an explicit batch scope.',
    );
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const candidateId = readArg('candidateId');
  const maxRaw = readArg('maxCandidates');
  const maxCandidates = maxRaw
    ? Math.min(Math.max(Number.parseInt(maxRaw, 10) || 25, 1), 50)
    : 25;

  const mod = await import(
    pathToFileURL(
      path.join(CORE_ROOT, 'src/lib/businessCandidate/enrichment/runBatchEnrichment.ts'),
    ).href
  );

  const result = await mod.runMultiSourceEnrichmentBatch({
    batchId,
    dryRun,
    writeReport: true,
    candidateIds: candidateId ? [candidateId] : undefined,
    maxCandidates,
  });

  console.log(
    JSON.stringify(
      {
        enrichmentRunId: result.enrichmentRunId,
        batchId: result.batchId,
        summary: result.summary,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
