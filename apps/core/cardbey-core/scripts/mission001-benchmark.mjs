/**
 * Mission 001 Gate 10 — offline benchmark runner (no publish, no external contact).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/mission001-benchmark.mjs
 *   node scripts/mission001-benchmark.mjs --json > mission001-benchmark.json
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 ?? '1';
process.env.ENABLE_MISSION_001_GROUNDING_V1 = process.env.ENABLE_MISSION_001_GROUNDING_V1 ?? '1';
process.env.ENABLE_MISSION_001_SPARSE_MODE_V1 = process.env.ENABLE_MISSION_001_SPARSE_MODE_V1 ?? '1';
process.env.ENABLE_MISSION_001_NAME_RESOLUTION_V1 = process.env.ENABLE_MISSION_001_NAME_RESOLUTION_V1 ?? '1';

const { MISSION001_BENCHMARK_FIXTURES, normalizeBenchmarkRow, summarizeBenchmarkRows } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/benchmarkFixtures.js')).href
);
const { buildGroundedCatalogFromResearch, catalogDiffersFromGenericScaffold } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/groundedCatalogPipeline.js')).href
);
const { buildSparseHonestCatalog, shouldUseSparseCatalogMode } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/sparseCatalogMode.js')).href
);
const { assessPreRevealFidelity } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/fidelityPreReveal.js')).href
);

const GENERIC_SCAFFOLD = ['Core Service', 'Premium Package', 'Basic Package', 'Express Service'];

function syntheticResearchForFixture(fixture) {
  if (fixture.evidenceQuality === 'weak') {
    return { researchRan: true, confidence: 0.42, extractedItems: [], fallbackToGenerated: true };
  }
  const items =
    fixture.evidenceQuality === 'strong'
      ? [
          { name: `${fixture.vertical} Signature Offering`, price: 120, confidence: 0.92, sourceType: 'website' },
          { name: `${fixture.vertical} Consultation`, price: 80, confidence: 0.9, sourceType: 'website' },
        ]
      : [{ name: `${fixture.vertical} Service`, price: 95, confidence: 0.72, sourceType: 'directory' }];
  return {
    researchRan: true,
    confidence: fixture.evidenceQuality === 'strong' ? 0.9 : 0.68,
    extractedItems: items,
    facts: { businessName: { value: fixture.id, sourceType: 'website', confidence: 0.85 } },
    businessKind: 'services',
  };
}

/** @type {object[]} */
const rows = [];
for (const fixture of MISSION001_BENCHMARK_FIXTURES) {
  const started = Date.now();
  const research = syntheticResearchForFixture(fixture);
  const mission001Meta = { sparseMode: fixture.inputType === 'name_only' && fixture.evidenceQuality === 'weak' };

  let catalog;
  let catalogGrounding = 0;
  if (shouldUseSparseCatalogMode(mission001Meta, research)) {
    catalog = buildSparseHonestCatalog({ businessName: fixture.id }, {}, mission001Meta);
  } else {
    const grounded = buildGroundedCatalogFromResearch(research, { businessName: fixture.id }, {}, { missionId: `bench_${fixture.id}` });
    catalog = grounded?.catalog ?? buildSparseHonestCatalog({ businessName: fixture.id }, {}, { sparseMode: true });
    if (grounded?.grounded?.provenanceSummary) {
      const s = grounded.grounded.provenanceSummary;
      const total = Math.max(1, s.total ?? catalog.products?.length ?? 1);
      catalogGrounding = Math.round(((s.exact ?? 0) + (s.verified ?? 0)) / total * 100);
    }
  }

  const preview = {
    storeName: fixture.id,
    storeType: fixture.vertical,
    items: catalog.products ?? [],
    website: { sections: [] },
    meta: { mission001: { fidelityScore: { overall: catalogGrounding || (mission001Meta.sparseMode ? 55 : 78) } } },
  };
  const assessment = assessPreRevealFidelity(preview, {
    fidelityScore: preview.meta.mission001.fidelityScore,
  });

  rows.push(
    normalizeBenchmarkRow({
      ...fixture,
      business: fixture.id,
      resolutionConfidence: fixture.inputType === 'name_only' ? 0.35 : 0.82,
      generationTime: Date.now() - started,
      fidelityScore: assessment.fidelity?.overall ?? preview.meta.mission001.fidelityScore.overall,
      catalogGrounding,
      unsupportedClaims: catalog.meta?.mission001SparseMode ? 0 : catalogDiffersFromGenericScaffold(catalog, GENERIC_SCAFFOLD) ? 0 : 1,
      imageRelevance: null,
      repairCycles: 0,
      finalStatus: assessment.pass ? 'accepted_sparse_or_grounded' : 'needs_review',
    }),
  );
}

const summary = {
  ...summarizeBenchmarkRows(rows),
  sparseCount: rows.filter((r) => r.evidenceQuality === 'weak').length,
  groundedCount: rows.filter((r) => Number(r.catalogGrounding) >= 75).length,
};

const payload = { summary, rows, generatedAt: new Date().toISOString(), mode: 'offline_synthetic' };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log('Mission 001 benchmark (offline synthetic)');
  console.log('fixtures:', summary.fixtureCount);
  console.log('median fidelity:', summary.medianFidelity);
  console.log('P50/P90 ms:', summary.p50Ms, '/', summary.p90Ms);
  console.log('grounded >=75%:', summary.groundedCount);
  console.log('accepted:', summary.acceptedCount, '/', summary.fixtureCount);
  console.log('sample row:', rows[0]);
}
