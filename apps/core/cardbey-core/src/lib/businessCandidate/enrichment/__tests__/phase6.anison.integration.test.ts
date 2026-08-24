/**
 * Phase 6 smoke — Anison extraction + category + hero query contract (no DB writes).
 */
import { describe, expect, it } from 'vitest';
import { EnrichmentBudget } from '../budget.js';
import { resolveCategoryFromSignals, resolveSubCategory } from '../../../../config/categoryTaxonomy.js';
import { buildHeroSearchQueries } from '../heroSearchQueries.js';
import { isContactString, isNavItem } from '../navItemFilter.js';
import { extractFromBusinessWebsite } from '../webExtractors.js';
import { fetchServiceDescriptions } from '../serviceSubpageExtract.js';

describe('Phase 6 Anison integration smoke', () => {
  it(
    'extracts Anison without nav/contact catalog pollution and maps Professional',
    async () => {
      const budget = new EnrichmentBudget();
      const result = await extractFromBusinessWebsite(budget, 'https://anisoncapitalgroup.com.au');
      expect(result).toBeTruthy();
      expect(result!.description).toMatch(/transaction-focused/i);
      expect(result!.email).toBe('contact@pactora.com.au');
      expect(result!.catalogItems.every((i) => !isNavItem(i.name) && !isContactString(i.name))).toBe(
        true,
      );
      expect(result!.catalogItems.length).toBeGreaterThanOrEqual(4);

      const withUrls = result!.catalogItems.filter((i) => i.sourceUrl);
      if (withUrls.length && budget.websiteFetches < budget.maxFetches) {
        const enriched = await fetchServiceDescriptions(
          withUrls.map((i) => ({
            name: i.name,
            url: String(i.sourceUrl),
          })),
          budget,
          Math.min(3, budget.maxFetches - budget.websiteFetches),
        );
        expect(enriched.some((s) => s.description && s.description.length > 20)).toBe(true);
      }

      const category = resolveCategoryFromSignals({
        businessName: 'Anison Capital Group',
        websiteNavItems: result!.navItems,
      });
      expect(category).toBe('Professional');
      expect(
        resolveSubCategory({
          category: 'Professional',
          businessName: 'Anison Capital Group',
          businessType: 'capital advisory',
          tags: result!.navItems,
        }),
      ).toBe('M&A Advisory');

      const heroQueries = buildHeroSearchQueries({
        businessName: 'Anison Capital Group',
        suburb: 'Melbourne',
        category: 'Professional',
        tags: ['ma-advisory'],
      });
      expect(heroQueries.join(' ')).not.toMatch(/Other .+ storefront/i);
    },
    60_000,
  );
});
