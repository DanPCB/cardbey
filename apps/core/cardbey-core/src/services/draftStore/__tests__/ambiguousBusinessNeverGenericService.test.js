/**
 * Regression: AMBIGUOUS_BUSINESS_NEVER_DEGRADES_TO_UNRELATED_GENERIC_TEMPLATE
 * Fixture: My Flower + Melbourne + Home & Garden
 */
import { describe, expect, it } from 'vitest';
import { resolveVertical } from '../../../lib/verticals/verticalTaxonomy.js';
import { buildSeedCatalog } from '../../store/seeds/seedCatalogBuilder.js';
import {
  buildIndustryCatalog,
  resolveIndustryBlueprintKey,
} from '../industryBlueprintRegistry.js';
import { buildStoreGenerationBusinessContext } from '../storeGenerationBusinessContext.js';
import { isServiceCatalogPlaceholderName } from '../../../lib/catalog/serviceCatalogPlaceholders.js';

const GENERIC_SERVICE_RE =
  /core service|standard package|premium package|basic service|value package|priority service|emergency call-out|scheduled visit|inspection|\breport\b/i;

describe('AMBIGUOUS_BUSINESS_NEVER_DEGRADES_TO_UNRELATED_GENERIC_TEMPLATE', () => {
  it('resolves My Flower + Home & Garden to retail.flower', () => {
    const vertical = resolveVertical({
      businessName: 'My Flower',
      businessType: 'Home & Garden',
    });
    expect(vertical.slug).toBe('retail.flower');
    expect(vertical.group).toBe('retail');
    expect(vertical.confidence).toBeGreaterThan(0);
  });

  it('locks florist blueprint from name signal', () => {
    expect(
      resolveIndustryBlueprintKey({
        businessName: 'My Flower',
        businessType: 'Home & Garden',
      }),
    ).toBe('retail.flower');
  });

  it('seeds sparse florist catalog — not Core Service / Emergency Call-out', () => {
    const catalog = buildSeedCatalog({
      businessName: 'My Flower',
      businessType: 'Home & Garden',
      storeType: 'Home & Garden',
      verticalSlug: 'retail.flower',
      verticalGroup: 'retail',
      creationMode: 'NEW_BUSINESS',
    });
    const names = (catalog.items || []).map((i) => i.name);
    expect(names.some((n) => GENERIC_SERVICE_RE.test(n))).toBe(false);
    expect(names.every((n) => !isServiceCatalogPlaceholderName(n))).toBe(true);
    expect(
      catalog.meta?.neverGenericService ||
        catalog.meta?.catalogSource === 'sparse_inferred_florist' ||
        catalog.meta?.catalogSource === 'ai_generated_starter',
    ).toBe(true);
    expect(names.some((n) => /flower|bouquet|plant|gift|occasion|arrangement|rose/i.test(n))).toBe(true);
    expect(catalog.items.every((i) => i.price == null || i.price === '')).toBe(true);
  });

  it('industry catalog path also stays sparse/unpriced without evidence', () => {
    const catalog = buildIndustryCatalog(
      {
        businessName: 'My Flower',
        businessType: 'Home & Garden',
        verticalSlug: 'retail.flower',
        creationMode: 'NEW_BUSINESS',
      },
      24,
    );
    expect(catalog).toBeTruthy();
    const names = (catalog.items || []).map((i) => i.name);
    expect(names.some((n) => GENERIC_SERVICE_RE.test(n))).toBe(false);
    expect(catalog.meta?.catalogSource).toMatch(/ai_generated_starter|sparse_inferred_florist/);
    expect(catalog.items.length).toBeGreaterThanOrEqual(6);
  });

  it('business context locks florist vertical for My Flower fixture', () => {
    const ctx = buildStoreGenerationBusinessContext({
      businessName: 'My Flower',
      category: 'Home & Garden',
      location: 'Melbourne',
    });
    expect(ctx.verticalSlug).toBe('retail.flower');
    expect(ctx.industryBlueprintKey).toBe('retail.flower');
    expect(ctx.insufficientUnderstanding).not.toBe(true);
    expect(ctx.creationMode).toBe('NEW_BUSINESS');
  });

  it('unknown name without service signals does not invent Core Service packages', () => {
    const catalog = buildSeedCatalog({
      businessName: 'Google',
      businessType: '',
      verticalSlug: 'services.generic',
      verticalGroup: 'services',
      insufficientUnderstanding: true,
    });
    const names = (catalog.items || []).map((i) => i.name);
    expect(names.some((n) => GENERIC_SERVICE_RE.test(n))).toBe(false);
    expect(catalog.meta?.neverGenericService).toBe(true);
  });
});
