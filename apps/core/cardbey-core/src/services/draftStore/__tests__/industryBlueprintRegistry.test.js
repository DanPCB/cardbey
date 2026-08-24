import { describe, it, expect } from 'vitest';
import {
  buildIndustryCatalog,
  reconcileIndustryVerticalSlug,
  resolveIndustryBlueprintKey,
  isRetailCatalogPlaceholderName,
  shouldRepairRetailCatalogLeakInServiceStore,
  collapseProfessionalCatalogWithoutPriceList,
  catalogHasNamedGroundedOfferings,
  INDUSTRY_BLUEPRINTS,
} from '../industryBlueprintRegistry.js';

describe('industryBlueprintRegistry', () => {
  it('registers blueprints for all major business types', () => {
    const ids = Object.keys(INDUSTRY_BLUEPRINTS);
    expect(ids).toContain('services.handyman');
    expect(ids).toContain('food.restaurant');
    expect(ids).toContain('food.bakery');
    expect(ids).toContain('food.cafe');
    expect(ids).toContain('beauty.hair_salon');
    expect(ids).toContain('fashion.boutique');
    expect(ids).toContain('retail.flower');
    expect(ids).toContain('auto.repair');
    expect(ids).toContain('services.plumbing');
    expect(ids).toContain('services.accounting');
    expect(ids).toContain('services.finance');
  });

  it('resolves Anison Capital Group to finance — not accounting', () => {
    expect(resolveIndustryBlueprintKey({ businessName: 'Anison Capital Group' })).toBe(
      'services.finance',
    );
    expect(resolveIndustryBlueprintKey({ businessName: 'Anision Capital Group' })).toBe(
      'services.finance',
    );
    const catalog = buildIndustryCatalog(
      { businessName: 'Anison Capital Group', businessType: '', verticalSlug: '' },
      12,
    );
    const names = catalog.items.map((i) => i.name);
    expect(names.some((n) => /tax return|bas|bookkeeping/i.test(n))).toBe(false);
    expect(names).toContain('Book our consultations');
    expect(catalog.meta?.bookingMode).toBe('consultation_only');
  });

  it('resolves accountant names to accounting blueprint', () => {
    expect(
      resolveIndustryBlueprintKey({ businessName: 'Braybrook Tax & Accounting' }),
    ).toBe('services.accounting');
  });

  it('resolves handyman blueprint from business name', () => {
    expect(
      resolveIndustryBlueprintKey({
        businessName: 'CA HANDYMAN',
        businessType: 'Home & garden',
        verticalSlug: 'retail.home_garden',
      }),
    ).toBe('services.handyman');
  });

  it('reconciles retail.home_garden to services.handyman for handyman stores', () => {
    expect(
      reconcileIndustryVerticalSlug('retail.home_garden', {
        businessName: 'CA HANDYMAN',
        businessType: 'Home & garden',
      }),
    ).toBe('services.handyman');
  });

  it('builds believable handyman catalog instead of retail placeholders', () => {
    const catalog = buildIndustryCatalog(
      {
        businessName: 'CA HANDYMAN',
        businessType: 'Home & garden',
        verticalSlug: 'services.handyman',
      },
      24,
    );

    expect(catalog?.items?.length).toBeGreaterThanOrEqual(20);
    const names = catalog.items.map((i) => i.name);
    expect(names).toContain('Interior Painting');
    expect(names).toContain('TV Wall Mounting');
    expect(names.some((n) => isRetailCatalogPlaceholderName(n))).toBe(false);
  });

  it('builds restaurant catalog with real dish names', () => {
    const catalog = buildIndustryCatalog(
      { businessName: 'Saigon Kitchen', businessType: 'Restaurant', verticalSlug: 'food.restaurant' },
      24,
    );
    const names = catalog.items.map((i) => i.name);
    expect(names).toContain("Chef's Recommendation");
    expect(names).toContain('Spring Rolls');
    expect(names.some((n) => isRetailCatalogPlaceholderName(n))).toBe(false);
  });

  it('builds bakery catalog with real products', () => {
    const catalog = buildIndustryCatalog(
      { businessName: 'Morning Rise Bakery', businessType: 'Bakery', verticalSlug: 'food.bakery' },
      24,
    );
    const names = catalog.items.map((i) => i.name);
    expect(names).toContain('Croissant');
    expect(names).toContain('Sourdough');
  });

  it('builds cafe catalog with coffee and food items', () => {
    const catalog = buildIndustryCatalog(
      { businessName: 'Corner Cafe', businessType: 'Cafe', verticalSlug: 'food.cafe' },
      24,
    );
    const names = catalog.items.map((i) => i.name);
    expect(names).toContain('Flat White');
    expect(names).toContain('Ham & Cheese Toastie');
  });

  it('builds beauty salon catalog', () => {
    const catalog = buildIndustryCatalog(
      { businessName: 'Glow Hair Studio', businessType: 'Hair salon', verticalSlug: 'beauty.hair_salon' },
      24,
    );
    const names = catalog.items.map((i) => i.name);
    expect(names).toContain("Women's Haircut");
    expect(names).toContain('Balayage');
  });

  it('builds fashion boutique catalog', () => {
    const catalog = buildIndustryCatalog(
      { businessName: 'Urban Threads', businessType: 'Clothing boutique', verticalSlug: 'fashion.boutique' },
      24,
    );
    const names = catalog.items.map((i) => i.name);
    expect(names).toContain("Women's Dresses");
    expect(names).toContain('New Arrivals');
    expect(names.some((n) => /variant|size s/i.test(n))).toBe(false);
  });

  it('builds auto repair catalog', () => {
    const catalog = buildIndustryCatalog(
      { businessName: 'Main St Motors', businessType: 'Mechanic', verticalSlug: 'auto.repair' },
      24,
    );
    expect(catalog.items.map((i) => i.name)).toContain('Oil Change');
  });

  it('detects retail scaffold leak in industry stores', () => {
    expect(isRetailCatalogPlaceholderName('Featured Item')).toBe(true);
    expect(isRetailCatalogPlaceholderName('Interior Painting')).toBe(false);

    expect(
      shouldRepairRetailCatalogLeakInServiceStore(
        [{ name: 'Featured Item' }],
        { businessName: 'Glow Hair', verticalSlug: 'beauty.hair_salon', verticalGroup: 'beauty' },
      ),
    ).toBe(true);
  });

  it('keeps named unpriced finance flyer offerings instead of collapsing to consultation', () => {
    const flyerItems = [
      { name: 'Home loan rate comparison' },
      { name: 'Debt consolidation' },
      { name: 'Low doc loans for self-employed' },
      { name: 'Property investment refinance' },
    ];
    expect(catalogHasNamedGroundedOfferings(flyerItems)).toBe(true);
    const collapsed = collapseProfessionalCatalogWithoutPriceList(
      { items: flyerItems, categories: [{ id: 'c1', name: 'Services' }] },
      { businessName: 'AWE FINANCIAL', businessType: 'finance broker', verticalSlug: 'services.finance' },
    );
    const names = collapsed.items.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining([
      'Home loan rate comparison',
      'Debt consolidation',
      'Low doc loans for self-employed',
      'Property investment refinance',
    ]));
    expect(names).not.toContain('Book our consultations');
    expect(collapsed.meta?.bookingMode).toBe('named_offerings_unpriced');
  });
});
