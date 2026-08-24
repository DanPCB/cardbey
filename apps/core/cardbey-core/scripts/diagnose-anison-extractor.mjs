/**
 * Phase 1 baseline + post-fix diagnostic for Anison Capital Group.
 * Usage: pnpm exec tsx scripts/diagnose-anison-extractor.mjs
 */
import { writeFileSync } from 'node:fs';
import { extractFromBusinessWebsite } from '../src/lib/businessCandidate/enrichment/webExtractors.ts';
import { EnrichmentBudget } from '../src/lib/businessCandidate/enrichment/budget.ts';

async function main() {
  const budget = new EnrichmentBudget();
  const result = await extractFromBusinessWebsite(budget, 'https://anisoncapitalgroup.com.au');
  const summary = {
    description: result?.description ?? null,
    tagline: result?.tagline ?? result?.heading ?? null,
    phone: result?.phone ?? null,
    email: result?.email ?? null,
    socialLinks: result?.socialLinks ?? null,
    catalogItems: result?.catalogItems?.length ?? 0,
    catalogSample: result?.catalogItems?.slice(0, 8).map((i) => i.name) ?? [],
    navItems: result?.navItems ?? [],
    heroImageUrl: result?.ogImage ?? null,
  };
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(
    new URL('./diagnose-anison-phase1.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), summary }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
