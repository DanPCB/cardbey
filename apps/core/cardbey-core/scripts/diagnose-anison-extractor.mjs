/**
 * Phase diagnostic for Anison Capital Group (Phases 1–4).
 * Usage: pnpm exec tsx scripts/diagnose-anison-extractor.mjs
 */
import { writeFileSync } from 'node:fs';
import { extractFromBusinessWebsite } from '../src/lib/businessCandidate/enrichment/webExtractors.ts';
import { EnrichmentBudget } from '../src/lib/businessCandidate/enrichment/budget.ts';
import { fetchServiceDescriptions } from '../src/lib/businessCandidate/enrichment/serviceSubpageExtract.ts';

async function main() {
  const budget = new EnrichmentBudget();
  const result = await extractFromBusinessWebsite(budget, 'https://anisoncapitalgroup.com.au');
  let catalog = result?.catalogItems ?? [];
  const withUrls = catalog.filter((i) => i.sourceUrl);
  if (withUrls.length && budget.websiteFetches < budget.maxFetches) {
    const enriched = await fetchServiceDescriptions(
      withUrls.map((i) => ({
        name: i.name,
        url: String(i.sourceUrl),
        description: i.description ?? undefined,
      })),
      budget,
      Math.min(4, budget.maxFetches - budget.websiteFetches),
    );
    catalog = enriched.map((s) => ({
      name: s.name,
      sourceUrl: s.url,
      description: s.description ?? null,
    }));
  }

  const summary = {
    description: result?.description ?? null,
    tagline: result?.tagline ?? result?.heading ?? null,
    phone: result?.phone ?? null,
    email: result?.email ?? null,
    socialLinks: result?.socialLinks ?? null,
    catalogItems: catalog.length,
    catalogSample: catalog.slice(0, 8).map((i) => ({
      name: i.name,
      hasUrl: Boolean(i.sourceUrl),
      hasDescription: Boolean(i.description),
      descriptionPreview: i.description ? String(i.description).slice(0, 80) : null,
    })),
    navItems: result?.navItems ?? [],
    heroImageUrl: result?.ogImage ?? null,
    websiteFetches: budget.websiteFetches,
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
