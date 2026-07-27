/**
 * Catalog & Starter Pack – TypeScript types mirroring Prisma models.
 * Used by catalog lib and seed/instantiate logic. No UI.
 */

export type CatalogItemType = 'FOOD' | 'PRODUCT' | 'SERVICE';

export type StarterPackStatus = 'DRAFT' | 'PUBLISHED';

export type ValidatorScope = 'ITEM' | 'PACK' | 'STORE';

export type ValidatorAppliesToType = 'FOOD' | 'PRODUCT' | 'SERVICE' | 'ANY';

export type ValidatorSeverity = 'WARN' | 'BLOCK';

/** BusinessType lookup (enum-like table) */
export interface BusinessType {
  id: string;
  key: string;
  label: string;
}

/** Region lookup (enum-like table) */
export interface Region {
  id: string;
  code: string;
  label: string;
}

/** Canonical catalog item (food, product, or service) */
export interface CatalogItem {
  id: string;
  type: CatalogItemType;
  canonicalName: string;
  shortDescription: string;
  longDescription: string | null;
  tags: string[];
  defaultCategoryKey: string | null;
  defaultCategoryId: string | null;
  suggestedPriceMin: number | null;
  suggestedPriceMax: number | null;
  currencyCode: string | null;
  imagePrompt: string | null;
  imageKeywords: string[] | null;
  modifiersJson: Record<string, unknown> | null;
  businessTypeHints: string[];
  localeHints: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Category tree node (reusable across packs) */
export interface CatalogCategory {
  id: string;
  key: string;
  label: string;
  parentId: string | null;
  sortOrder: number;
}

/** Starter pack metadata */
export interface StarterPack {
  id: string;
  businessTypeId: string | null;
  regionId: string | null;
  version: string;
  name: string;
  description: string | null;
  defaultCurrencyCode: string | null;
  status: StarterPackStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Starter pack with items and categories (e.g. from getStarterPack) */
export interface StarterPackWithDetails extends StarterPack {
  items: Array<StarterPackItem & { catalogItem: CatalogItem }>;
  categories: Array<StarterPackCategory & { catalogCategory: CatalogCategory }>;
}

/** Join: pack → item with ordering and overrides */
export interface StarterPackItem {
  id: string;
  starterPackId: string;
  catalogItemId: string;
  sortOrder: number;
  featured: boolean;
  overridesJson: Record<string, unknown> | null;
}

/** Join: pack → category with ordering */
export interface StarterPackCategory {
  id: string;
  starterPackId: string;
  catalogCategoryId: string;
  sortOrder: number;
}

/** Validator rule (quality gate) */
export interface ValidatorRule {
  id: string;
  name: string;
  scope: ValidatorScope;
  appliesToType: ValidatorAppliesToType;
  configJson: Record<string, unknown>;
  isEnabled: boolean;
  severity: ValidatorSeverity;
  createdAt: Date;
  updatedAt: Date;
}

/** Filters for listStarterPacks */
export interface ListStarterPacksFilters {
  businessTypeKey?: string;
  regionCode?: string;
  status?: StarterPackStatus;
}
