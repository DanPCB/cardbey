/**
 * Semantic precision P0 regression gates for store creation.
 */
import { describe, it, expect } from 'vitest';
import {
  stripSeoBusinessDisplayName,
  classifyCatalogRecord,
  applyCatalogRecordClassification,
  isInternalGenerationPrompt,
  buildSafeStarterAboutCopy,
  normalizeOfferingPrice,
  resolveOfferingCta,
  extractCategoryFilterChips,
  isCommerceSellableRole,
} from '../semanticPrecision.js';
import { enrichResearchCatalogProducts } from '../../../services/draftStore/researchCatalogDraft.js';
import { mergeWebsiteIntoPreview } from '../../../services/draftStore/websiteSectionsGenerator.js';

describe('stripSeoBusinessDisplayName', () => {
  it('keeps clean canonical name separate from SEO title', () => {
    expect(
      stripSeoBusinessDisplayName(
        'Blossom Tree Florist - Florist Braybrook, Same Day Flower Delivery',
        'Blossom Tree Florist',
      ),
    ).toBe('Blossom Tree Florist');
  });

  it('strips SEO suffix without hint', () => {
    expect(
      stripSeoBusinessDisplayName('Blossom Tree Florist - Same Day Flower Delivery'),
    ).toBe('Blossom Tree Florist');
  });
});

describe('classifyCatalogRecord', () => {
  it('maps florist occasions to CATEGORY', () => {
    for (const name of ['Birthday', 'Sympathy', 'Love Romance', 'Anniversary']) {
      const r = classifyCatalogRecord({ name }, { businessType: 'florist' });
      expect(r.recordType).toBe('CATEGORY');
      expect(r.commerceEligible).toBe(false);
    }
  });

  it('maps inventory chrome to INVENTORY_METADATA', () => {
    const r = classifyCatalogRecord({ name: 'In stock (77) In stock (77 products)' });
    expect(r.recordType).toBe('INVENTORY_METADATA');
    expect(r.commerceEligible).toBe(false);
  });

  it('keeps real products commerce-eligible when role is product', () => {
    const r = classifyCatalogRecord(
      { name: 'Rose with Lilly', contentRole: 'product' },
      { businessType: 'florist' },
    );
    expect(r.recordType).toBe('PRODUCT');
    expect(r.commerceEligible).toBe(true);
  });
});

describe('applyCatalogRecordClassification + filters', () => {
  it('excludes categories/inventory from commerce and keeps filter chips', () => {
    const rows = applyCatalogRecordClassification(
      [
        { name: 'Birthday', contentRole: 'product_category' },
        { name: 'In stock (77 products)' },
        { name: 'Pastel Hat Box', contentRole: 'product' },
        { name: 'Lovely Red Roses', contentRole: 'product' },
      ],
      { businessType: 'florist' },
    );
    const commerce = rows.filter((r) => r.catalogEligible);
    expect(commerce.map((r) => r.name)).toEqual(['Pastel Hat Box', 'Lovely Red Roses']);
    expect(commerce.every((r) => isCommerceSellableRole(r.contentRole, { businessType: 'florist' }))).toBe(
      true,
    );
    const chips = extractCategoryFilterChips(rows);
    expect(chips.some((c) => c.name === 'Birthday')).toBe(true);
  });
});

describe('normalizeOfferingPrice', () => {
  it('never turns missing/zero into FREE $0', () => {
    expect(normalizeOfferingPrice({ price: null }).display).toBe('Price on request');
    expect(normalizeOfferingPrice({ price: undefined }).amount).toBeNull();
    expect(normalizeOfferingPrice({ price: 0 }).amount).toBeNull();
    expect(normalizeOfferingPrice({ price: 0 }).priceStatus).toBe('UNKNOWN');
    expect(normalizeOfferingPrice({ price: 0, priceStatus: 'FREE' }).display).toBe('Free');
    expect(normalizeOfferingPrice({ price: 49.5 }).amount).toBe(49.5);
  });
});

describe('resolveOfferingCta', () => {
  it('uses Order/Enquire for florist products, Book only for scheduled services', () => {
    const product = resolveOfferingCta(
      { name: 'Mixed Orchid Flower Box', contentRole: 'product', itemType: 'product' },
      { businessType: 'florist', orderingEnabled: true },
    );
    expect(product.executionAction).toBe('add_to_cart');
    expect(product.ctaLabel).not.toBe('Book');

    const enquire = resolveOfferingCta(
      { name: 'Pastel Hat Box', contentRole: 'product', itemType: 'product' },
      { businessType: 'florist', orderingEnabled: false },
    );
    expect(enquire.ctaLabel).toBe('Enquire');

    const book = resolveOfferingCta(
      { name: 'Consultation', contentRole: 'service', itemType: 'service', bookingEnabled: true },
      { businessType: 'salon', schedulingEnabled: true },
    );
    expect(book.ctaLabel).toBe('Book');
  });
});

describe('enrichResearchCatalogProducts CTA + price', () => {
  it('does not Book florist products or render price 0', () => {
    const enriched = enrichResearchCatalogProducts(
      [
        { name: 'Birthday', contentRole: 'product_category' },
        { name: 'Rose with Lilly', contentRole: 'product', price: null },
      ],
      { businessType: 'product_retail', businessName: 'Blossom Tree Florist' },
    );
    const birthday = enriched.find((p) => p.name === 'Birthday');
    expect(birthday.catalogEligible).toBe(false);
    const rose = enriched.find((p) => p.name === 'Rose with Lilly');
    expect(rose.executionAction).not.toBe('book');
    expect(rose.price).toBeNull();
    expect(rose.priceStatus).toBe('UNKNOWN');
  });
});

describe('copy leak boundary', () => {
  it('rejects internal generation prompts', () => {
    expect(isInternalGenerationPrompt('Create a store for Blossom Flower in Melbourne')).toBe(true);
    expect(isInternalGenerationPrompt('Build a website for Acme')).toBe(true);
    expect(isInternalGenerationPrompt('Blossom Tree Florist brings flowers together.')).toBe(false);
  });

  it('mergeWebsiteIntoPreview never surfaces create-a-store prompt as Our Story', () => {
    const preview = {
      storeName: 'Blossom Tree Florist - Florist Braybrook, Same Day Flower Delivery',
      storeType: 'Florist',
      items: [],
    };
    mergeWebsiteIntoPreview(preview, {
      businessName: 'Blossom Tree Florist',
      prompt: 'Create a store for Blossom Flower in Melbourne',
      location: 'Braybrook',
    });
    expect(preview.storeName).toBe('Blossom Tree Florist');
    const about = preview.website?.sections?.find((s) => s.type === 'about');
    expect(about?.content?.body).not.toMatch(/create a store for/i);
    expect(about?.content?.body).toMatch(/Blossom Tree Florist/);
  });

  it('safe starter copy avoids invented claims', () => {
    const copy = buildSafeStarterAboutCopy({
      storeName: 'Blossom Tree Florist',
      storeType: 'Florist',
      location: 'Braybrook',
    });
    expect(copy).not.toMatch(/award|founded|since\s+\d{4}|sustainab/i);
    expect(copy).toMatch(/flowers/i);
  });
});
