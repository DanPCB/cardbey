import { describe, it, expect } from 'vitest';
import {
  auditDraftCatalogQa,
  applyDraftCatalogQaAutoRepair,
  regenerateCatalogProductSlots,
} from '../src/services/qa/draftCatalogQa.js';

describe('draftCatalogQa', () => {
  const sweetsInput = {
    businessType: 'sweets_bakery',
    businessName: 'Sweet Corner',
    verticalSlug: 'food.bakery',
  };

  it('flags fashion placeholders and null prices in sweets catalog', () => {
    const preview = {
      storeName: 'Sweet Corner',
      items: [
        { id: 'i0', name: 'Cupcake', description: 'Fresh baked cupcake.', price: '5.50', categoryId: 'c0' },
        ...Array.from({ length: 19 }, (_, i) => ({
          id: `i${i + 1}`,
          name: `Cookie ${i + 1}`,
          description: 'Homemade cookie.',
          price: '3.00',
          categoryId: 'c0',
        })),
        { id: 'i20', name: 'Classic Tee', description: null, price: null, categoryId: 'c1' },
        { id: 'i21', name: 'Slim Jeans', description: 'Denim.', price: null, categoryId: 'c1' },
      ],
      categories: [{ id: 'c0', name: 'Treats' }, { id: 'c1', name: 'Other' }],
      tagline: '',
      description: '',
    };
    const audit = auditDraftCatalogQa(preview, sweetsInput);
    expect(audit.pass).toBe(false);
    expect(audit.issueCodes).toContain('PRODUCT_FASHION_PLACEHOLDER');
    expect(audit.issueCodes).toContain('PRODUCT_NULL_PRICE');
    expect(audit.badProductIndices).toContain(20);
    expect(audit.badProductIndices).toContain(21);
  });

  it('auto-repair regenerates bad products and fills tagline, description, hero tags', () => {
    const preview = {
      storeName: 'Sweet Corner',
      items: [
        { id: 'i0', name: 'Brownie', description: 'Rich chocolate brownie.', price: '4.00', categoryId: 'c0' },
        { id: 'i20', name: 'Hoodie', description: null, price: null, categoryId: 'c1' },
      ],
      categories: [{ id: 'c0', name: 'Treats' }, { id: 'c1', name: 'Other' }],
    };
    const repaired = applyDraftCatalogQaAutoRepair(preview, sweetsInput, sweetsInput);
    expect(repaired.autoFixed.length).toBeGreaterThan(0);
    expect(repaired.preview.items[1].name).not.toMatch(/hoodie/i);
    expect(repaired.preview.items[1].price).toBeTruthy();
    expect(String(repaired.preview.tagline ?? '').length).toBeGreaterThan(5);
    expect(String(repaired.preview.description ?? '').length).toBeGreaterThan(15);
    expect(Array.isArray(repaired.preview.heroImageTags)).toBe(true);
    expect(repaired.preview.heroImageTags.length).toBeGreaterThan(0);
    const post = auditDraftCatalogQa(repaired.preview, sweetsInput);
    expect(post.issueCodes).not.toContain('PRODUCT_FASHION_PLACEHOLDER');
    expect(post.issueCodes).not.toContain('EMPTY_TAGLINE');
  });

  it('regenerateCatalogProductSlots replaces indices 20-21 only', () => {
    const items = Array.from({ length: 22 }, (_, i) => ({
      id: `item_${i}`,
      name: i >= 20 ? 'Leather Belt' : `Pastry ${i}`,
      description: i >= 20 ? null : 'Fresh pastry.',
      price: i >= 20 ? null : '5.00',
      categoryId: 'c0',
    }));
    const preview = { storeName: 'Bakery', items, categories: [{ id: 'c0', name: 'Baked' }] };
    regenerateCatalogProductSlots(preview, [20, 21], sweetsInput, sweetsInput);
    expect(preview.items[20].name).not.toMatch(/leather belt/i);
    expect(preview.items[21].price).toBeTruthy();
    expect(preview.items[0].name).toMatch(/Pastry/);
  });
});
