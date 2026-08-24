/**
 * Mission 001 Gate E — 9-failure cohort before/after offering reconstruction.
 *
 * Usage:
 *   MISSION_001_LIVE_BENCHMARK=1 node --import tsx/esm scripts/mission001-offering-cohort.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { config as loadDotenv } from 'dotenv';

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
  { id: 'florist-strong-web', name: 'Grandiflora' },
  { id: 'beauty-strong-web', name: 'Mecca Cosmetica' },
  { id: 'cafe-strong-web', name: 'Market Lane Coffee' },
  { id: 'finance-strong-web', name: 'Vanguard Investments Australia' },
  { id: 'security-strong-web', name: 'Modern Security Doors' },
  { id: 'consulting-strong-web', name: 'Deloitte Australia' },
  { id: 'retailer-strong-web', name: 'Cotton On' },
  { id: 'vn-sme-export-web', name: 'Vinamilk' },
  { id: 'service-strong-web', name: 'Hireup' },
];

const { MISSION001_LIVE_INPUTS } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/benchmarkFixtures.js')).href
);
const { runStoreCreationResearch } = await import(
  pathToFileURL(path.join(root, 'src/lib/storeCreationResearch/index.js')).href
);

const rows = [];
for (const entry of COHORT) {
  const live = MISSION001_LIVE_INPUTS[entry.id];
  process.stderr.write(`[cohort] ${entry.name}...\n`);
  const started = Date.now();
  try {
    const research = await runStoreCreationResearch(
      {
        businessName: live.businessName,
        location: live.location,
        website: live.website,
        category: live.category,
        missionId: `cohort_${entry.id}`,
      },
      { skipNetwork: false, prisma: null },
    );
    const count =
      research.extractedItems?.length ||
      research.catalog?.products?.length ||
      0;
    const sample = (research.extractedItems ?? research.catalog?.products ?? [])
      .slice(0, 5)
      .map((p) => p.name);
    rows.push({
      business: entry.name,
      before: 0,
      after: count,
      grounded: count > 0 && research.fallbackToGenerated !== true,
      confidence: research.confidence ?? null,
      authority: research.catalogAuthoritySource ?? null,
      sampleOfferings: sample,
      ms: Date.now() - started,
      debug: research.offeringReconstruction ?? null,
    });
    process.stderr.write(`[cohort] ${entry.name} after=${count} authority=${research.catalogAuthoritySource}\n`);
  } catch (err) {
    rows.push({
      business: entry.name,
      before: 0,
      after: 0,
      grounded: false,
      error: err?.message ?? String(err),
      ms: Date.now() - started,
    });
  }
}

const recovered = rows.filter((r) => r.after > 0).length;
const payload = {
  generatedAt: new Date().toISOString(),
  recovered,
  total: rows.length,
  recoveryRatePct: Math.round((recovered / rows.length) * 1000) / 10,
  rows,
};

const out = path.join(root, '../../../docs/reports/mission001-offering-cohort.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ recovered, total: rows.length, recoveryRatePct: payload.recoveryRatePct, rows: rows.map((r) => ({ business: r.business, before: r.before, after: r.after, grounded: r.grounded, authority: r.authority, sample: r.sampleOfferings })) }, null, 2));
console.error('wrote', out);
