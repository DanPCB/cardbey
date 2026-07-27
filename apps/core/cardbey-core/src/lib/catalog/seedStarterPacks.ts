/**
 * Seed placeholders and example data for Starter Packs.
 * Exports empty arrays by default; includes example Cafe AU and Nail Salon AU packs
 * (3 categories + 6 items each) for reference. No DB writes in this file.
 */

import type { CatalogItemType } from './types.js';

/** Shape of a category for seed data (key, label, optional parent key, sortOrder) */
export interface SeedCategory {
  key: string;
  label: string;
  parentKey?: string;
  sortOrder: number;
}

/** Shape of an item for seed data (minimal fields to create CatalogItem) */
export interface SeedCatalogItem {
  type: CatalogItemType;
  canonicalName: string;
  shortDescription: string;
  longDescription?: string;
  tags: string[];
  defaultCategoryKey: string;
  suggestedPriceMin?: number;
  suggestedPriceMax?: number;
  currencyCode?: string;
  imagePrompt?: string;
  imageKeywords?: string[];
  modifiersJson?: Record<string, unknown>;
  businessTypeHints: string[];
  localeHints: string[];
}

/** Shape of pack item assignment (categoryKey, item canonicalName or key, sortOrder, featured) */
export interface SeedPackItem {
  categoryKey: string;
  itemKey: string;
  sortOrder: number;
  featured?: boolean;
  overridesJson?: Record<string, unknown>;
}

/** Empty arrays – use when no seed data is configured */
export const EMPTY_CATEGORIES: SeedCategory[] = [];
export const EMPTY_ITEMS: SeedCatalogItem[] = [];
export const EMPTY_PACK_ITEMS: SeedPackItem[] = [];

/** Example: Cafe AU – 3 categories, 6 items */
export const EXAMPLE_CAFE_AU = {
  businessTypeKey: 'cafe',
  regionCode: 'AU',
  version: '1.0',
  name: 'Cafe Australia Starter',
  description: 'Starter menu for Australian cafes: hot drinks, food, cold drinks.',
  defaultCurrencyCode: 'AUD',
  categories: [
    { key: 'hot_drinks', label: 'Hot Drinks', sortOrder: 0 },
    { key: 'food', label: 'Food', sortOrder: 1 },
    { key: 'cold_drinks', label: 'Cold Drinks', sortOrder: 2 },
  ] as SeedCategory[],
  items: [
    {
      type: 'FOOD' as CatalogItemType,
      canonicalName: 'Flat White',
      shortDescription: 'Double shot, steamed milk',
      tags: ['coffee', 'milk'],
      defaultCategoryKey: 'hot_drinks',
      suggestedPriceMin: 4.5,
      suggestedPriceMax: 6,
      currencyCode: 'AUD',
      businessTypeHints: ['cafe'],
      localeHints: ['AU'],
    },
    {
      type: 'FOOD' as CatalogItemType,
      canonicalName: 'Long Black',
      shortDescription: 'Double shot over hot water',
      tags: ['coffee'],
      defaultCategoryKey: 'hot_drinks',
      suggestedPriceMin: 4,
      suggestedPriceMax: 5.5,
      currencyCode: 'AUD',
      businessTypeHints: ['cafe'],
      localeHints: ['AU'],
    },
    {
      type: 'FOOD' as CatalogItemType,
      canonicalName: 'Avocado Toast',
      shortDescription: 'Sourdough, smashed avo, feta',
      tags: ['brunch', 'toast'],
      defaultCategoryKey: 'food',
      suggestedPriceMin: 16,
      suggestedPriceMax: 22,
      currencyCode: 'AUD',
      businessTypeHints: ['cafe'],
      localeHints: ['AU'],
    },
    {
      type: 'FOOD' as CatalogItemType,
      canonicalName: 'Banana Bread',
      shortDescription: 'House-made, butter',
      tags: ['sweet', 'bakery'],
      defaultCategoryKey: 'food',
      suggestedPriceMin: 8,
      suggestedPriceMax: 12,
      currencyCode: 'AUD',
      businessTypeHints: ['cafe'],
      localeHints: ['AU'],
    },
    {
      type: 'FOOD' as CatalogItemType,
      canonicalName: 'Iced Latte',
      shortDescription: 'Double shot, cold milk, ice',
      tags: ['coffee', 'cold'],
      defaultCategoryKey: 'cold_drinks',
      suggestedPriceMin: 5.5,
      suggestedPriceMax: 7,
      currencyCode: 'AUD',
      businessTypeHints: ['cafe'],
      localeHints: ['AU'],
    },
    {
      type: 'FOOD' as CatalogItemType,
      canonicalName: 'Fresh Orange Juice',
      shortDescription: 'Freshly squeezed',
      tags: ['juice', 'cold'],
      defaultCategoryKey: 'cold_drinks',
      suggestedPriceMin: 7,
      suggestedPriceMax: 9,
      currencyCode: 'AUD',
      businessTypeHints: ['cafe'],
      localeHints: ['AU'],
    },
  ] as SeedCatalogItem[],
  packItems: [
    { categoryKey: 'hot_drinks', itemKey: 'Flat White', sortOrder: 0, featured: true },
    { categoryKey: 'hot_drinks', itemKey: 'Long Black', sortOrder: 1 },
    { categoryKey: 'food', itemKey: 'Avocado Toast', sortOrder: 2, featured: true },
    { categoryKey: 'food', itemKey: 'Banana Bread', sortOrder: 3 },
    { categoryKey: 'cold_drinks', itemKey: 'Iced Latte', sortOrder: 4 },
    { categoryKey: 'cold_drinks', itemKey: 'Fresh Orange Juice', sortOrder: 5 },
  ] as SeedPackItem[],
};

/** Example: Nail Salon AU – 3 categories, 6 services */
export const EXAMPLE_NAIL_SALON_AU = {
  businessTypeKey: 'nail_salon',
  regionCode: 'AU',
  version: '1.0',
  name: 'Nail Salon Australia Starter',
  description: 'Starter service menu for nail salons in Australia.',
  defaultCurrencyCode: 'AUD',
  categories: [
    { key: 'manicure', label: 'Manicure', sortOrder: 0 },
    { key: 'pedicure', label: 'Pedicure', sortOrder: 1 },
    { key: 'add_ons', label: 'Add-ons', sortOrder: 2 },
  ] as SeedCategory[],
  items: [
    {
      type: 'SERVICE' as CatalogItemType,
      canonicalName: 'Classic Manicure',
      shortDescription: 'Shape, cuticle care, polish',
      tags: ['manicure', 'polish'],
      defaultCategoryKey: 'manicure',
      suggestedPriceMin: 35,
      suggestedPriceMax: 50,
      currencyCode: 'AUD',
      businessTypeHints: ['nail_salon'],
      localeHints: ['AU'],
    },
    {
      type: 'SERVICE' as CatalogItemType,
      canonicalName: 'Gel Manicure',
      shortDescription: 'Long-lasting gel polish',
      tags: ['manicure', 'gel'],
      defaultCategoryKey: 'manicure',
      suggestedPriceMin: 50,
      suggestedPriceMax: 65,
      currencyCode: 'AUD',
      businessTypeHints: ['nail_salon'],
      localeHints: ['AU'],
    },
    {
      type: 'SERVICE' as CatalogItemType,
      canonicalName: 'Classic Pedicure',
      shortDescription: 'Soak, exfoliate, polish',
      tags: ['pedicure', 'polish'],
      defaultCategoryKey: 'pedicure',
      suggestedPriceMin: 45,
      suggestedPriceMax: 60,
      currencyCode: 'AUD',
      businessTypeHints: ['nail_salon'],
      localeHints: ['AU'],
    },
    {
      type: 'SERVICE' as CatalogItemType,
      canonicalName: 'Gel Pedicure',
      shortDescription: 'Gel polish on toes',
      tags: ['pedicure', 'gel'],
      defaultCategoryKey: 'pedicure',
      suggestedPriceMin: 55,
      suggestedPriceMax: 75,
      currencyCode: 'AUD',
      businessTypeHints: ['nail_salon'],
      localeHints: ['AU'],
    },
    {
      type: 'SERVICE' as CatalogItemType,
      canonicalName: 'Nail Art',
      shortDescription: 'Design per nail',
      tags: ['add-on', 'art'],
      defaultCategoryKey: 'add_ons',
      suggestedPriceMin: 5,
      suggestedPriceMax: 15,
      currencyCode: 'AUD',
      businessTypeHints: ['nail_salon'],
      localeHints: ['AU'],
    },
    {
      type: 'SERVICE' as CatalogItemType,
      canonicalName: 'Nail Repair',
      shortDescription: 'Single nail repair',
      tags: ['add-on', 'repair'],
      defaultCategoryKey: 'add_ons',
      suggestedPriceMin: 5,
      suggestedPriceMax: 10,
      currencyCode: 'AUD',
      businessTypeHints: ['nail_salon'],
      localeHints: ['AU'],
    },
  ] as SeedCatalogItem[],
  packItems: [
    { categoryKey: 'manicure', itemKey: 'Classic Manicure', sortOrder: 0, featured: true },
    { categoryKey: 'manicure', itemKey: 'Gel Manicure', sortOrder: 1 },
    { categoryKey: 'pedicure', itemKey: 'Classic Pedicure', sortOrder: 2, featured: true },
    { categoryKey: 'pedicure', itemKey: 'Gel Pedicure', sortOrder: 3 },
    { categoryKey: 'add_ons', itemKey: 'Nail Art', sortOrder: 4 },
    { categoryKey: 'add_ons', itemKey: 'Nail Repair', sortOrder: 5 },
  ] as SeedPackItem[],
};
