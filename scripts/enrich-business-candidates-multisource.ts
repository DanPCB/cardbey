#!/usr/bin/env node
/**
 * Opt-in multi-source BusinessCandidate enrichment.
 *
 *   pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL
 *   pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL --dry-run
 *   pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL --maxCandidates=50 --offset=25
 *   pnpm enrich:candidates -- --url=https://anisoncapitalgroup.com.au --testMode
 *
 * Rules:
 * - --batchId is REQUIRED unless --url is set (URL smoke / Phase 6 local gate)
 * - --url always runs dry (never persists); --testMode is explicit and recommended
 * - Never enriches MELBOURNE_BATCH0_20260617 (guard in agent loop)
 * - Writes BusinessCandidate + enriched-field-provenance.json only (batch mode, non-dry)
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

function hasFlag(...names: string[]): boolean {
  return names.some((n) => process.argv.includes(n));
}

function buildUrlSmokeCandidate(websiteUrl: string, suburb: string) {
  const now = new Date().toISOString();
  let hostname = 'test-site';
  try {
    hostname = new URL(websiteUrl).hostname.replace(/^www\./i, '');
  } catch {
    /* keep default */
  }
  return {
    id: `test-${Date.now()}`,
    batchId: 'TEST_URL_SMOKE',
    campaignId: null,
    name: hostname,
    businessType: null,
    address: null,
    suburb,
    city: suburb,
    state: 'VIC',
    postcode: null,
    country: 'AU',
    phone: null,
    website: websiteUrl,
    email: null,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'website',
    confidenceScore: 0.5,
    originalContent: {},
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: [],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId: null,
    sourceUrl: websiteUrl,
    rawSourceJson: null,
    seedId: null,
    status: 'DISCOVERED',
    dedupeKey: `url-smoke|${hostname}`,
    discoveryProviderId: 'url-smoke',
    externalId: `url-smoke-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    category: null,
    description: null,
    tags: [],
    heroImageUrl: null,
    heroImageSource: null,
    biStatus: 'not_generated',
    abn: null,
    enrichmentNote: null,
    enrichmentRunId: null,
    enrichmentUpdatedAt: null,
    enrichmentSources: [],
  };
}

async function main() {
  const url = readArg('url') ?? readArg('u');
  const testMode = hasFlag('--testMode', '--test');
  const dryRunFlag = hasFlag('--dry-run', '--dryRun');
  const suburb = readArg('suburb') ?? 'Melbourne';

  const mod = await import(
    pathToFileURL(
      path.join(CORE_ROOT, 'src/lib/businessCandidate/enrichment/runBatchEnrichment.ts'),
    ).href
  );

  // URL smoke path — no DB candidate required; always dry-run (never persist TEST batch).
  if (url) {
    const websiteUrl = url.startsWith('http') ? url : `https://${url}`;
    const mockCandidate = buildUrlSmokeCandidate(websiteUrl, suburb);
    const dryRun = true; // force dry for --url regardless of flags
    if (!testMode) {
      console.warn(
        '[enrich] --url without --testMode: still dry-run only (no candidate writes). Pass --testMode to make intent explicit.',
      );
    }

    const result = await mod.runMultiSourceEnrichmentOnCandidates({
      candidates: [mockCandidate],
      dryRun,
      writeReport: true,
      batchIdForReport: 'TEST_URL_SMOKE',
    });

    console.log(
      JSON.stringify(
        {
          mode: 'url-smoke',
          testMode,
          dryRun,
          url: websiteUrl,
          enrichmentRunId: result.enrichmentRunId,
          batchId: result.batchId,
          summary: result.summary,
          results: result.results,
        },
        null,
        2,
      ),
    );
    return;
  }

  const batchId = readArg('batchId');
  if (!batchId) {
    console.error(
      'Error: --batchId is required (or pass --url for dry URL smoke).\n' +
        'Usage:\n' +
        '  pnpm enrich:candidates -- --batchId=<BATCH_ID> [--dry-run]\n' +
        '  pnpm enrich:candidates -- --url=https://example.com --testMode [--suburb=Melbourne]\n' +
        'Refusing to enrich all candidates without an explicit batch scope.',
    );
    process.exit(1);
  }

  const dryRun = dryRunFlag;
  const candidateId = readArg('candidateId');
  const maxCandidatesRaw = readArg('maxCandidates');
  const offsetRaw = readArg('offset');
  const maxCandidates = maxCandidatesRaw ? Number(maxCandidatesRaw) : 25;
  const offset = offsetRaw ? Number(offsetRaw) : 0;

  const result = await mod.runMultiSourceEnrichmentBatch({
    batchId,
    dryRun,
    writeReport: true,
    candidateIds: candidateId ? [candidateId] : undefined,
    maxCandidates: Number.isFinite(maxCandidates) ? maxCandidates : 25,
    offset: Number.isFinite(offset) ? offset : 0,
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
