/**
 * Golden Path — production-like journey tests (opt-in).
 *
 * Exercises the real import chain:
 *   structured_store_build → generateDraft → buildCatalogForStoreReactStep
 *   → catalogAuthorityDecision (dynamic import — duplicate-export regressions fail here)
 *
 * Journeys:
 *   1. Direct create — authed user, structured_store_build → draft preview ready
 *   2. Upload create — guest + OCR/card metadata → structured_store_build → preview retains identity
 *
 * Never publishes, never claims ownership, never contacts businesses.
 *
 * Usage (from apps/core/cardbey-core):
 *   RUN_JOURNEY_TEST=1 node --import tsx/esm scripts/golden-path-journey-test.mjs
 *   RUN_JOURNEY_TEST=1 npm run test:journey
 *
 * Prerequisites:
 *   - test.db schema current (`npm test` pretest pushes schema)
 *   - NODE_ENV=test DATABASE_URL=file:../test.db (set automatically by npm run test:journey)
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.RUN_JOURNEY_TEST !== '1') {
  console.error(
    'Refusing to run: set RUN_JOURNEY_TEST=1 to opt into Golden Path journey integration tests.\n' +
      'These tests write to prisma/test.db and run generateDraft (no publish).',
  );
  process.exit(2);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.ROLE = process.env.ROLE || 'test';
process.env.ENABLE_STORE_RESEARCH_PIPELINE = process.env.ENABLE_STORE_RESEARCH_PIPELINE ?? '0';
process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW =
  process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW ?? '0';
process.env.USE_REACT_REFLECTION = process.env.USE_REACT_REFLECTION ?? 'false';

const { getPrismaClient } = await import(pathToFileURL(path.join(root, 'src/lib/prisma.js')).href);
const { resetDb } = await import(pathToFileURL(path.join(root, 'src/test/helpers/resetDb.js')).href);
const structuredStoreBuild = await import(
  pathToFileURL(path.join(root, 'src/lib/toolExecutors/store/structured_store_build.js')).href,
);
const { getDraft } = await import(
  pathToFileURL(path.join(root, 'src/services/draftStore/draftStoreService.js')).href,
);

/** @typedef {{ name: string, ok: boolean, detail?: string }} JourneyResult */

/**
 * Same dynamic import path as draftStoreService.buildCatalogForStoreReactStep.
 */
async function assertCatalogAuthorityDecisionImportChain() {
  const mod = await import(
    pathToFileURL(path.join(root, 'src/lib/storeCreationResearch/catalogAuthorityDecision.js')).href,
  );
  if (typeof mod.resolveCatalogAuthorityDecision !== 'function') {
    throw new Error('catalogAuthorityDecision.resolveCatalogAuthorityDecision missing');
  }
  if (typeof mod.attachCatalogGrounding !== 'function') {
    throw new Error('catalogAuthorityDecision.attachCatalogGrounding missing');
  }

  const source = await readFile(
    path.join(root, 'src/lib/storeCreationResearch/catalogAuthorityDecision.js'),
    'utf8',
  );
  for (const symbol of [
    'resolveCatalogAuthorityDecision',
    'attachCatalogGrounding',
    'isOfficialWebsiteResolved',
  ]) {
    const re = new RegExp(`export function ${symbol}`, 'g');
    const count = (source.match(re) ?? []).length;
    if (count !== 1) {
      throw new Error(`catalogAuthorityDecision: expected exactly one export of ${symbol}, found ${count}`);
    }
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} data
 */
async function createStoreMission(prisma, data) {
  return prisma.missionPipeline.create({ data });
}

/**
 * @param {string} draftId
 */
async function assertDraftPreviewReady(draftId, { expectedStoreName }) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error(`draft not found: ${draftId}`);
  const status = String(draft.status || '').toLowerCase();
  if (status !== 'ready' && status !== 'committed') {
    throw new Error(`draft ${draftId} status expected ready|committed, got ${draft.status}`);
  }
  const preview = draft.preview && typeof draft.preview === 'object' ? draft.preview : {};
  const items = Array.isArray(preview.items) ? preview.items : [];
  if (items.length === 0) {
    throw new Error(`draft ${draftId} preview has no catalog items`);
  }
  const storeName = String(preview.storeName ?? preview.profile?.name ?? '').trim();
  if (expectedStoreName && !storeName.toLowerCase().includes(expectedStoreName.toLowerCase())) {
    throw new Error(
      `draft preview storeName "${storeName}" does not include expected "${expectedStoreName}"`,
    );
  }
  return { draft, preview, items };
}

/**
 * @returns {Promise<JourneyResult>}
 */
async function runDirectCreateJourney(prisma) {
  const guestId = `guest_journey_direct_${Date.now()}`;
  const mission = await createStoreMission(prisma, {
    type: 'store',
    title: 'Create store: Journey Direct Cafe',
    targetType: 'store',
    tenantId: guestId,
    createdBy: guestId,
    status: 'running',
    runState: 'running',
    executionMode: 'GUIDED_RUN',
    requiresConfirmation: false,
    metadataJson: {
      businessName: 'Journey Direct Cafe',
      storeName: 'Journey Direct Cafe',
      businessType: 'cafe',
      category: 'cafe',
      location: 'Melbourne, Australia',
      intentMode: 'store',
    },
    outputsJson: {
      logoChoice: 'Skip',
      heroImageChoice: 'Skip',
    },
  });

  const result = await structuredStoreBuild.execute(
    {},
    { missionId: mission.id, userId: guestId, tenantId: guestId },
  );
  if (result.status !== 'ok') {
    throw new Error(
      `direct create failed: status=${result.status} code=${result.error?.code ?? 'n/a'} msg=${result.error?.message ?? result.error?.developerMessage ?? 'unknown'}`,
    );
  }
  const draftId = result.output?.draftId;
  if (!draftId) throw new Error('direct create missing output.draftId');

  await assertDraftPreviewReady(draftId, { expectedStoreName: 'Journey Direct Cafe' });
  return { name: 'direct_create', ok: true, detail: `draftId=${draftId} guest=${guestId}` };
}

/**
 * @returns {Promise<JourneyResult>}
 */
async function runUploadCreateJourney(prisma) {
  const guestId = `guest_journey_upload_${Date.now()}`;
  const mission = await createStoreMission(prisma, {
    type: 'store',
    title: 'Create store: HP SERVICES',
    targetType: 'store',
    tenantId: guestId,
    createdBy: guestId,
    status: 'running',
    runState: 'running',
    executionMode: 'GUIDED_RUN',
    requiresConfirmation: false,
    metadataJson: {
      businessName: 'HP SERVICES',
      storeName: 'HP SERVICES',
      businessType: 'HVAC',
      category: 'HVAC',
      location: 'Melbourne, Australia',
      ocrRawText: 'HP SERVICES\nHVAC repairs and installation',
      ocrText: 'HP SERVICES\nHVAC repairs and installation',
      cardExtraction: {
        businessName: 'HP SERVICES',
        vertical: 'HVAC',
        confidence: 0.92,
      },
      source: 'upload_create',
      uploadedAssetPending: false,
    },
    outputsJson: {
      logoChoice: 'Skip',
      heroImageChoice: 'Skip',
    },
  });

  const result = await structuredStoreBuild.execute(
    {},
    { missionId: mission.id, userId: guestId, tenantId: guestId },
  );
  if (result.status !== 'ok') {
    throw new Error(
      `upload create failed: status=${result.status} code=${result.error?.code ?? 'n/a'} msg=${result.error?.message ?? result.error?.developerMessage ?? 'unknown'}`,
    );
  }
  const draftId = result.output?.draftId;
  if (!draftId) throw new Error('upload create missing output.draftId');

  const { preview } = await assertDraftPreviewReady(draftId, { expectedStoreName: 'HP SERVICES' });
  const inputOcr =
    preview.meta?.ocrRawText ??
    preview.meta?.businessContext?.ocrRawText ??
    null;
  if (inputOcr && !String(inputOcr).includes('HP SERVICES')) {
    throw new Error('upload journey lost OCR identity on preview meta');
  }

  return { name: 'upload_create', ok: true, detail: `draftId=${draftId} guest=${guestId}` };
}

async function main() {
  console.log('golden-path-journey-test: import chain');
  await assertCatalogAuthorityDecisionImportChain();
  console.log('  OK catalogAuthorityDecision import + single exports');

  const prisma = getPrismaClient();
  await resetDb(prisma);

  /** @type {JourneyResult[]} */
  const results = [];
  let failed = 0;

  try {
    console.log('\ngolden-path-journey-test: direct create');
    results.push(await runDirectCreateJourney(prisma));
    console.log('  OK', results.at(-1)?.detail);
  } catch (err) {
    failed += 1;
    const msg = err?.message || String(err);
    results.push({ name: 'direct_create', ok: false, detail: msg });
    console.error('  FAIL direct create:', msg);
  }

  try {
    console.log('\ngolden-path-journey-test: upload create');
    results.push(await runUploadCreateJourney(prisma));
    console.log('  OK', results.at(-1)?.detail);
  } catch (err) {
    failed += 1;
    const msg = err?.message || String(err);
    results.push({ name: 'upload_create', ok: false, detail: msg });
    console.error('  FAIL upload create:', msg);
  }

  console.log('\n--- golden-path-journey-test summary ---');
  for (const row of results) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
  }

  if (failed > 0) {
    console.error(`\ngolden-path-journey-test: ${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\ngolden-path-journey-test: all journeys OK');
}

main().catch((err) => {
  console.error('golden-path-journey-test fatal:', err?.stack || err);
  process.exit(1);
});
