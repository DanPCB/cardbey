import { describe, expect, it } from 'vitest';
import {
  auditDraftCatalogQa,
  applyDraftCatalogQaTier1AutoRepair,
  planDraftCatalogQaTier2Fixes,
} from './draftCatalogQa.js';

describe('draftCatalogQa honest generative prices', () => {
  const suggestedPreview = {
    storeName: 'Pho Saigon',
    storeType: 'general',
    meta: {
      storeCreationMode: 'generative',
      catalogSource: 'generative',
      verticalSlug: 'food.vietnamese',
    },
    categories: [{ id: 'cat_starters', name: 'Starters' }],
    items: [
      {
        id: 'item_cuisine_0',
        name: 'Chả giò',
        description: 'Crispy pork spring rolls with nuoc cham.',
        price: null,
        contentOrigin: 'suggested',
        priceWasNotExplicitlyProvided: true,
        categoryId: 'cat_starters',
      },
      {
        id: 'item_cuisine_1',
        name: 'Gỏi cuốn',
        description: 'Fresh rice paper rolls with prawn and herbs.',
        price: null,
        contentOrigin: 'suggested',
        priceWasNotExplicitlyProvided: true,
        categoryId: 'cat_starters',
      },
    ],
  };

  it('does not treat suggested null prices as catalog defects', () => {
    const audit = auditDraftCatalogQa(suggestedPreview, {
      businessType: 'general',
      verticalSlug: 'food.vietnamese',
    });
    expect(audit.issueCodes).not.toContain('PRODUCT_NULL_PRICE');
    expect(audit.badProductIndices).toEqual([]);
  });

  it('does not invent product ladder prices for suggested items', () => {
    const { preview, autoFixed } = applyDraftCatalogQaTier1AutoRepair(
      structuredClone(suggestedPreview),
      { businessType: 'general', verticalSlug: 'food.vietnamese' },
      { businessType: 'general', verticalSlug: 'food.vietnamese' },
    );
    expect(autoFixed.some((f) => f.includes('.price'))).toBe(false);
    expect(preview.items[0].price).toBeNull();
    expect(preview.items[1].price).toBeNull();
  });

  it('does not plan catalog regenerate solely for suggested null prices', () => {
    const fixes = planDraftCatalogQaTier2Fixes(
      suggestedPreview,
      { businessType: 'general', verticalSlug: 'food.vietnamese' },
      { businessType: 'general', verticalSlug: 'food.vietnamese' },
    );
    expect(fixes.some((f) => f.kind === 'catalog_regenerate' || f.kind === 'bulk_catalog_repair')).toBe(
      false,
    );
  });
});
