/**
 * Mission 001 — remaining websiteFound=false eligible cohort.
 */
import { config as loadDotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.join(root, '.env') });
loadDotenv({ path: path.join(root, '.env.local'), override: true });

if (process.env.MISSION_001_LIVE_BENCHMARK !== '1') {
  console.error('Set MISSION_001_LIVE_BENCHMARK=1');
  process.exit(2);
}

process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = '1';
process.env.ENABLE_MISSION_001_OFFERING_RECONSTRUCTION_V1 = '1';
process.env.ENABLE_STORE_RESEARCH_PIPELINE = process.env.ENABLE_STORE_RESEARCH_PIPELINE ?? '1';

const COHORT = [
  'florist-name-loc',
  'finance-name-loc',
  'trades-name-loc',
  'manufacturing-ref',
  'retailer-social',
  'vn-sme-name-loc',
  'service-name-loc',
];

const { MISSION001_LIVE_INPUTS, MISSION001_BENCHMARK_FIXTURES } = await import(
  '../src/lib/mission001/benchmarkFixtures.js'
);
const { runStoreCreationResearch } = await import('../src/lib/storeCreationResearch/index.js');

const rows = [];
for (const id of COHORT) {
  const live = MISSION001_LIVE_INPUTS[id];
  const fixture = MISSION001_BENCHMARK_FIXTURES.find((f) => f.id === id);
  process.stderr.write(`[web-res] ${live.businessName}...\n`);
  const started = Date.now();
  const research = await runStoreCreationResearch(
    {
      businessName: live.businessName,
      location: live.location,
      website: live.website,
      category: live.category,
      socialLinks: live.socialLinks,
      missionId: `webres_${id}`,
    },
    { skipNetwork: false, prisma: null },
  );
  const count =
    research.extractedItems?.length || research.catalog?.products?.length || 0;
  const sample = (research.extractedItems ?? research.catalog?.products ?? [])
    .slice(0, 5)
    .map((p) => p.name);
  const pipeline = research.storeResearchPipeline;
  rows.push({
    id,
    business: live.businessName,
    inputType: fixture?.inputType,
    after: count,
    authority: research.catalogAuthoritySource ?? null,
    sample,
    ms: Date.now() - started,
    pipelineMode: pipeline?.mode ?? null,
    sharedBrandWebsite: pipeline?.entityResolution?.sharedBrandWebsite ?? null,
    entityNotes: pipeline?.entityResolution?.resolutionNotes ?? null,
    website: research.facts?.website?.value ?? live.website ?? null,
  });
  process.stderr.write(`[web-res] ${live.businessName} after=${count} mode=${pipeline?.mode}\n`);
}

const recovered = rows.filter((r) => r.after > 0).length;
const out = {
  generatedAt: new Date().toISOString(),
  recovered,
  total: rows.length,
  recoveryRatePct: Math.round((recovered / rows.length) * 1000) / 10,
  rows,
};
const outPath = path.join(root, '../../../docs/reports/mission001-website-resolution-cohort.json');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.error('wrote', outPath);
