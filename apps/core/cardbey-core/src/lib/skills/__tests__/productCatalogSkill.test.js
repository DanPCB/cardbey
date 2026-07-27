// DANH: skill-round2-catalog
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import { ProductCatalogSkill } from '../definitions/ProductCatalogSkill.js';

describe('ProductCatalogSkill', () => {
  it("registers under 'product_catalog'", () => {
    expect(skillRegistry.has('product_catalog')).toBe(true);
    expect(skillRegistry.get('product_catalog')?.name).toBe('product_catalog');
  });

  it('findByTrigger(product) returns ProductCatalogSkill', () => {
    expect(skillRegistry.findByTrigger('product')?.name).toBe('product_catalog');
  });

  it('findByTrigger(catalog) returns ProductCatalogSkill', () => {
    expect(skillRegistry.findByTrigger('catalog')?.name).toBe('product_catalog');
  });

  it('uses manage_product_catalog tool', () => {
    expect(ProductCatalogSkill.steps[0]?.tool).toBe('manage_product_catalog');
  });

  it('buildInput defaults action to get_summary', () => {
    const buildInput = ProductCatalogSkill.steps[0]?.buildInput;
    const input = buildInput?.({ storeId: 's1', toolInput: {} });
    expect(input?.action).toBe('get_summary');
    expect(input?.storeId).toBe('s1');
  });

  it('buildInput passes add_product fields', () => {
    const buildInput = ProductCatalogSkill.steps[0]?.buildInput;
    const input = buildInput?.({
      storeId: 's1',
      toolInput: {
        action: 'add_product',
        name: 'Classic Manicure',
        price: 45,
        category: 'Nails',
      },
    });
    expect(input?.action).toBe('add_product');
    expect(input?.name).toBe('Classic Manicure');
    expect(input?.price).toBe(45);
  });
});
