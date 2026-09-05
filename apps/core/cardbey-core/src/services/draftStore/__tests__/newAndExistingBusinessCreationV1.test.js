/**
 * NEW + EXISTING business creation V1 regressions.
 */
import { describe, expect, it } from 'vitest';
import { resolveVertical } from '../../../lib/verticals/verticalTaxonomy.js';
import {
  resolveStoreCreationMode,
  STORE_CREATION_MODES,
} from '../../../lib/storeCreation/storeCreationMode.js';
import { buildSeedCatalog } from '../../store/seeds/seedCatalogBuilder.js';
import { buildIndustryCatalog } from '../industryBlueprintRegistry.js';
import { buildCuisineMenuCatalog } from '../foodCuisineCatalog.js';
import { buildStoreGenerationBusinessContext } from '../storeGenerationBusinessContext.js';
import { scoreSemanticMediaMatch, shouldAcceptMediaMatch } from '../groundedStoreCreation.js';

const GENERIC_SERVICE_RE =
  /core service|standard package|premium package|basic service|value package|priority service|emergency call-out|scheduled visit|\binspection\b|\breport\b/i;

describe('CARDBEY_NEW_AND_EXISTING_BUSINESS_CREATION_V1', () => {
  describe('My Flower — NEW_BUSINESS no external data', () => {
    const input = {
      businessName: 'My Flower',
      category: 'Home & Garden',
      location: 'Melbourne',
    };

    it('locks florist vertical and NEW_BUSINESS mode', () => {
      const vertical = resolveVertical({
        businessName: input.businessName,
        businessType: input.category,
      });
      expect(vertical.slug).toBe('retail.flower');
      const mode = resolveStoreCreationMode(input, null, vertical);
      expect(mode.creationMode).toBe(STORE_CREATION_MODES.NEW_BUSINESS);
      expect(mode.needsClarification).toBe(false);
    });

    it('generates populated florist starter — not generic services', () => {
      const ctx = buildStoreGenerationBusinessContext(input);
      expect(ctx.creationMode).toBe(STORE_CREATION_MODES.NEW_BUSINESS);
      expect(ctx.verticalSlug).toBe('retail.flower');

      const catalog = buildSeedCatalog({
        ...input,
        businessType: input.category,
        verticalSlug: 'retail.flower',
        verticalGroup: 'retail',
        creationMode: 'NEW_BUSINESS',
      });
      const names = (catalog.items || []).map((i) => i.name);
      expect(names.length).toBeGreaterThanOrEqual(6);
      expect(names.some((n) => GENERIC_SERVICE_RE.test(n))).toBe(false);
      expect(names.some((n) => /bouquet|rose|flower|plant|arrangement|wreath|orchid|succulent/i.test(n))).toBe(
        true,
      );
      expect(catalog.meta?.source || catalog.meta?.offeringProvenance).toMatch(/AI_GENERATED_STARTER|INFERRED/);
      expect(catalog.items.every((i) => i.price == null || i.price === '')).toBe(true);
      expect(catalog.categories.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(catalog.products)).toBe(true);
      expect(catalog.products.length).toBeGreaterThanOrEqual(6);
    });

    it('rejects aviation/dental media for florist context', () => {
      const bad = scoreSemanticMediaMatch({
        itemName: 'Seasonal Bouquet',
        businessType: 'florist',
        verticalSlug: 'retail.flower',
        storeName: 'My Flower',
        altText: 'Pioneer Flying Service airplane rides',
        query: 'Core Service',
        providerConfidence: 0.8,
        source: 'pexels',
      });
      expect(shouldAcceptMediaMatch(bad, 0.55)).toBe(false);

      const good = scoreSemanticMediaMatch({
        itemName: 'Seasonal Bouquet',
        businessType: 'florist',
        verticalSlug: 'retail.flower',
        storeName: 'My Flower',
        altText: 'Fresh rose bouquet florist shop',
        query: 'flower bouquet wrapped',
        providerConfidence: 0.7,
        source: 'pexels',
      });
      expect(shouldAcceptMediaMatch(good, 0.55)).toBe(true);
    });
  });

  describe('NOODLE hut — NEW_BUSINESS food', () => {
    it('resolves asian/noodle food vertical and starter menu', () => {
      const vertical = resolveVertical({
        businessName: 'NOODLE hut',
        businessType: 'Food & drink',
      });
      expect(vertical.group).toBe('food');
      expect(vertical.slug).toMatch(/^food\./);

      const mode = resolveStoreCreationMode(
        { businessName: 'NOODLE hut', category: 'Food & drink', location: 'Melbourne' },
        null,
        vertical,
      );
      expect(mode.creationMode).toBe(STORE_CREATION_MODES.NEW_BUSINESS);

      const menu = buildCuisineMenuCatalog(
        {
          businessName: 'NOODLE hut',
          businessType: 'Food & drink',
          verticalSlug: vertical.slug,
          creationMode: 'NEW_BUSINESS',
        },
        24,
      );
      expect(menu?.items?.length).toBeGreaterThanOrEqual(8);
      const names = menu.items.map((i) => i.name).join(' ');
      expect(names).toMatch(/noodle|pho|ramen|pad thai|rice|dumpling/i);
      expect(menu.items.some((i) => GENERIC_SERVICE_RE.test(i.name))).toBe(false);
      expect(menu.meta?.catalogSource).toBe('ai_generated_starter');
    });
  });

  describe('EXISTING_BUSINESS with research evidence', () => {
    it('selects EXISTING when research found offerings', () => {
      const vertical = resolveVertical({
        businessName: 'Known Cafe',
        businessType: 'cafe',
      });
      const mode = resolveStoreCreationMode(
        { businessName: 'Known Cafe', category: 'Food & drink', websiteUrl: 'https://example.com' },
        { researchRan: true, found: true, itemCount: 12, fallbackToGenerated: false },
        vertical,
      );
      expect(mode.creationMode).toBe(STORE_CREATION_MODES.EXISTING_BUSINESS);
    });
  });

  describe('AMBIGUOUS_BUSINESS', () => {
    it('asks clarification for vague name + non-Other broad category with no semantic lock', () => {
      const weak = { slug: 'services.generic', confidence: 0, matchedKeywords: [], insufficientUnderstanding: true };
      const mode = resolveStoreCreationMode(
        { businessName: 'Nova', category: 'Business', location: 'Sydney' },
        null,
        weak,
      );
      expect(mode.creationMode).toBe(STORE_CREATION_MODES.AMBIGUOUS_BUSINESS);
      expect(mode.needsClarification).toBe(true);
      expect(mode.clarificationPrompt).toMatch(/Nova/);
    });

    it('Other + weak semantics defaults to NEW_BUSINESS starter (edit later)', () => {
      const weak = { slug: 'services.generic', confidence: 0, matchedKeywords: [], insufficientUnderstanding: true };
      const mode = resolveStoreCreationMode(
        { businessName: 'Nova', category: 'Other', location: 'Sydney' },
        null,
        weak,
      );
      expect(mode.creationMode).toBe(STORE_CREATION_MODES.NEW_BUSINESS);
      expect(mode.needsClarification).toBe(false);
      expect(mode.reason).toBe('other_category_new_starter');
    });
  });

  describe('industry starter path', () => {
    it('buildIndustryCatalog returns AI starter for florist NEW_BUSINESS', () => {
      const catalog = buildIndustryCatalog(
        {
          businessName: 'My Flower',
          businessType: 'Home & Garden',
          verticalSlug: 'retail.flower',
          creationMode: 'NEW_BUSINESS',
        },
        24,
      );
      expect(catalog?.meta?.catalogSource).toBe('ai_generated_starter');
      expect(catalog.items.length).toBeGreaterThanOrEqual(6);
    });
  });
});
