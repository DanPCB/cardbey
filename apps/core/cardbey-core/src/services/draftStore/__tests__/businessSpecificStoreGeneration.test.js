/**
 * Cross-industry divergence + finance anti-generic regressions for
 * BUSINESS_SPECIFIC_STORE_GENERATION_V1.
 */
import { describe, expect, it } from 'vitest';
import { classifyBusinessType } from '../../../lib/catalog/classifyBusinessType.js';
import { buildSeedCatalog } from '../../store/seeds/seedCatalogBuilder.js';
import { mergeWebsiteIntoPreview } from '../websiteSectionsGenerator.js';
import { buildStoreGenerationBusinessContext } from '../storeGenerationBusinessContext.js';
import { validateStoreCoherence } from '../storeCoherenceValidator.js';
import { isServiceCatalogPlaceholderName } from '../../../lib/catalog/serviceCatalogPlaceholders.js';

const MATRIX = [
  { name: 'Le Petit Four Bakery', type: 'bakery', expectType: 'food_menu' },
  { name: 'Glow Hair Studio', type: 'hair salon', expectType: 'service_fixed_booking' },
  { name: 'FixIt Handyman', type: 'handyman', expectType: 'service_quote_required' },
  { name: 'Anison Capital Group', type: '', expectType: 'service_fixed_booking' },
  { name: 'Northside Fashion', type: 'fashion', expectType: 'product_retail' },
  { name: 'Harbour Cafe', type: 'cafe', expectType: 'food_menu' },
];

describe('business-specific store generation V1', () => {
  it('classifies Anison Capital Group as professional services with Book consultation CTA', () => {
    const result = classifyBusinessType({ businessName: 'Anison Capital Group' });
    expect(result.businessType).toBe('service_fixed_booking');
    expect(result.primaryCTA).toBe('Book consultation');
    expect(result.primaryCTA.toLowerCase()).not.toContain('cart');
  });

  it('diverges business types across the industry matrix', () => {
    const types = MATRIX.map((row) =>
      classifyBusinessType({ businessName: row.name, businessType: row.type }).businessType,
    );
    for (let i = 0; i < MATRIX.length; i++) {
      expect(types[i]).toBe(MATRIX[i].expectType);
    }
    const unique = new Set(types);
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it('does not seed Core Service / Express Service for capital firms', () => {
    const catalog = buildSeedCatalog({
      businessName: 'Anison Capital Group',
      businessType: 'general',
      verticalSlug: '',
    });
    const names = (catalog.items || []).map((i) => i.name);
    expect(names.some((n) => /core service|express service|emergency call-out|premium package/i.test(n))).toBe(
      false,
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThanOrEqual(12);
  });

  it('seeds investment/capital offerings — not tax/BAS/bookkeeping — for Anison Capital Group', () => {
    const catalog = buildSeedCatalog({
      businessName: 'Anison Capital Group',
      businessType: '',
      verticalSlug: '',
    });
    const names = (catalog.items || []).map((i) => i.name);
    expect(names.some((n) => /tax return|bas lodgement|bookkeeping|payroll/i.test(n))).toBe(false);
    expect(
      names.some((n) => /investment|portfolio|capital|wealth|advisory|consultation/i.test(n)),
    ).toBe(true);
  });

  it('still seeds accounting catalog for explicit accounting firms', () => {
    const catalog = buildSeedCatalog({
      businessName: 'Smith & Co Accountants',
      businessType: 'accounting',
      verticalSlug: '',
    });
    const names = (catalog.items || []).map((i) => i.name);
    expect(names.some((n) => /tax return|bas|bookkeeping/i.test(n))).toBe(true);
    expect(names.some((n) => /capital raising|portfolio review/i.test(n))).toBe(false);
  });

  it('omits Shows and fake reviews for finance storefront merge', () => {
    const preview = {
      storeName: 'Anison Capital Group',
      storeType: 'finance',
      items: [{ id: '1', name: 'Initial Consultation' }],
      meta: { verticalSlug: 'services.finance', verticalGroup: 'services' },
    };
    mergeWebsiteIntoPreview(preview, {});
    const types = (preview.website?.sections || []).map((s) => s.type);
    expect(types).not.toContain('show');
    expect(types).not.toContain('social_proof');
    const hero = preview.website.sections.find((s) => s.type === 'hero');
    expect(String(hero?.content?.ctaLabel || '').toLowerCase()).not.toContain('cart');
  });

  it('locks BusinessContext for capital group', () => {
    const ctx = buildStoreGenerationBusinessContext({ businessName: 'Anison Capital Group' });
    expect(ctx.businessType).toBe('service_fixed_booking');
    expect(ctx.primaryCTA).toBe('Book consultation');
    expect(ctx.verticalSlug).toBe('services.finance');
  });

  it('flags coherence failures for generic scaffolds + Add to cart on finance', () => {
    const report = validateStoreCoherence(
      {
        storeName: 'Anison Capital Group',
        storeType: 'finance',
        primaryCTA: 'Add to cart',
        items: [
          { name: 'Core Service' },
          { name: 'Express Service' },
          { name: 'Emergency Call-out' },
        ],
        website: {
          sections: [
            { type: 'hero', content: { ctaLabel: 'Add to cart' } },
            {
              type: 'social_proof',
              content: { reviews: [{ author: 'Alex M.', text: 'Great' }] },
            },
          ],
        },
      },
      { businessName: 'Anison Capital Group', verticalSlug: 'services.finance' },
    );
    expect(report.ok).toBe(false);
    expect(report.critical.length).toBeGreaterThan(0);
    expect(isServiceCatalogPlaceholderName('Core Service')).toBe(true);
  });
});
