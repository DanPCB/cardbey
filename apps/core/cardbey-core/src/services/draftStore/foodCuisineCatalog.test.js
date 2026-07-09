import { describe, expect, it } from 'vitest';
import {
  buildCuisineMenuCatalog,
  getCuisineMenuPromptHints,
  resolveCuisineMenuBankKey,
} from './foodCuisineCatalog.js';
import { selectTemplateId } from './selectTemplateId.js';
import { isServiceCatalogPlaceholderName } from '../../lib/catalog/serviceCatalogPlaceholders.js';

describe('foodCuisineCatalog', () => {
  it('resolves Vietnamese cuisine from business name', () => {
    expect(resolveCuisineMenuBankKey('food.restaurant', 'Moc Vietnamese Restaurant', 'restaurant')).toBe(
      'food.vietnamese',
    );
    expect(selectTemplateId('food.vietnamese')).toBe('food_vietnamese');
  });

  it('builds Vietnamese menu items like Moc reference store', () => {
    const catalog = buildCuisineMenuCatalog(
      {
        verticalSlug: 'food.vietnamese',
        businessName: 'Moc Vietnamese Restaurant',
        businessType: 'restaurant',
      },
      24,
    );
    expect(catalog).not.toBeNull();
    const names = catalog.items.map((i) => i.name);
    expect(names).toContain('Phở Bò');
    expect(names).toContain('Chả giò');
    expect(names).toContain('Gỏi cuốn');
    expect(names.every((n) => !isServiceCatalogPlaceholderName(n))).toBe(true);
    expect(catalog.categories.some((c) => /noodles|phở/i.test(c.name))).toBe(true);
  });

  it('includes cuisine hints for menu generation prompts', () => {
    const hints = getCuisineMenuPromptHints('food.vietnamese', 'Moc Vietnamese Restaurant', 'restaurant');
    expect(hints).toMatch(/Vietnamese/i);
    expect(hints).toMatch(/Phở|Gỏi cuốn|Chả giò/i);
  });
});
