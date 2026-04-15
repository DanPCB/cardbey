/**
 * Starter Pack JSON loader – parse, validate, normalize.
 * Isolated: not referenced by runtime app unless called explicitly (e.g. packImport CLI).
 */

import type { CatalogItemType } from './types.js';

/** Raw category from JSON */
export interface RawPackCategory {
  key: string;
  label: string;
  parentKey?: string | null;
  sortOrder: number;
}

/** Raw item from JSON (item + pack placement) */
export interface RawPackItem {
  type: string;
  canonicalName: string;
  shortDescription: string;
  tags: string[];
  categoryKey: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  imagePrompt?: string;
  imageKeywords?: string[];
  modifiersJson?: Record<string, unknown>;
  featured?: boolean;
  sortOrder?: number;
  businessTypeHints?: string[];
  localeHints?: string[];
}

/** Raw pack JSON (file content) */
export interface RawPackJson {
  businessType: string;
  region: string;
  version: string;
  currency?: string;
  name: string;
  description?: string;
  categories: RawPackCategory[];
  items: RawPackItem[];
}

/** Normalized category ready for Prisma (parentId resolved in import step) */
export interface NormalizedCategory {
  key: string;
  label: string;
  parentKey: string | null;
  sortOrder: number;
}

/** Catalog item payload for Prisma create (no id) */
export interface CatalogItemCreatePayload {
  type: CatalogItemType;
  canonicalName: string;
  shortDescription: string;
  longDescription: string | null;
  tags: string[];
  defaultCategoryKey: string;
  suggestedPriceMin: number | null;
  suggestedPriceMax: number | null;
  currencyCode: string | null;
  imagePrompt: string | null;
  imageKeywords: string[] | null;
  modifiersJson: Record<string, unknown> | null;
  businessTypeHints: string[];
  localeHints: string[];
}

/** Pack item assignment (categoryKey + sortOrder + featured + overrides) */
export interface PackItemAssignment {
  categoryKey: string;
  sortOrder: number;
  featured: boolean;
  overridesJson: Record<string, unknown> | null;
  catalog: CatalogItemCreatePayload;
}

/** Starter pack item join data (sortOrder, featured, overrides per item; index matches itemsNormalized) */
export interface StarterPackItemJoinDatum {
  categoryKey: string;
  sortOrder: number;
  featured: boolean;
  overridesJson: Record<string, unknown> | null;
}

/** Result of loading a pack: Prisma-ready structures (no DB calls) */
export interface LoadedPack {
  packMeta: {
    businessType: string;
    region: string;
    version: string;
    name: string;
    description: string | null;
    defaultCurrencyCode: string | null;
  };
  /** Categories with parent refs resolved (parentKey present; parentId resolved at import) */
  categoriesNormalized: NormalizedCategory[];
  /** Catalog item payloads; index i matches starterPackItemJoin[i] */
  itemsNormalized: CatalogItemCreatePayload[];
  /** Join data for StarterPackItem; index i matches itemsNormalized[i] */
  starterPackItemJoin: StarterPackItemJoinDatum[];
}

const VALID_TYPES: CatalogItemType[] = ['FOOD', 'PRODUCT', 'SERVICE'];

function isCatalogItemType(s: string): s is CatalogItemType {
  return VALID_TYPES.includes(s as CatalogItemType);
}

/** Validation error from loader */
export class PackLoadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'PackLoadError';
  }
}

/**
 * Validate required fields and types. Throws PackLoadError on failure.
 */
export function validateRawPack(raw: unknown): asserts raw is RawPackJson {
  if (raw === null || typeof raw !== 'object') {
    throw new PackLoadError('Pack must be a JSON object', 'INVALID_ROOT');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.businessType !== 'string' || !o.businessType.trim()) {
    throw new PackLoadError('pack.businessType is required', 'MISSING_FIELD', 'businessType');
  }
  if (typeof o.region !== 'string' || !o.region.trim()) {
    throw new PackLoadError('pack.region is required', 'MISSING_FIELD', 'region');
  }
  if (typeof o.version !== 'string' || !o.version.trim()) {
    throw new PackLoadError('pack.version is required', 'MISSING_FIELD', 'version');
  }
  if (typeof o.name !== 'string' || !o.name.trim()) {
    throw new PackLoadError('pack.name is required', 'MISSING_FIELD', 'name');
  }
  if (!Array.isArray(o.categories)) {
    throw new PackLoadError('pack.categories must be an array', 'INVALID_FIELD', 'categories');
  }
  if (!Array.isArray(o.items)) {
    throw new PackLoadError('pack.items must be an array', 'INVALID_FIELD', 'items');
  }
  const categoryKeys = new Set<string>();
  for (let i = 0; i < o.categories.length; i++) {
    const c = o.categories[i];
    if (c === null || typeof c !== 'object') {
      throw new PackLoadError(`categories[${i}] must be an object`, 'INVALID_CATEGORY', `categories.${i}`);
    }
    const cat = c as Record<string, unknown>;
    if (typeof cat.key !== 'string' || !cat.key.trim()) {
      throw new PackLoadError(`categories[${i}].key is required`, 'MISSING_FIELD', `categories.${i}.key`);
    }
    if (typeof cat.label !== 'string' || !cat.label.trim()) {
      throw new PackLoadError(`categories[${i}].label is required`, 'MISSING_FIELD', `categories.${i}.label`);
    }
    if (typeof cat.sortOrder !== 'number') {
      throw new PackLoadError(`categories[${i}].sortOrder must be a number`, 'INVALID_FIELD', `categories.${i}.sortOrder`);
    }
    categoryKeys.add((cat.key as string).trim());
  }
  for (let i = 0; i < o.items.length; i++) {
    const it = o.items[i];
    if (it === null || typeof it !== 'object') {
      throw new PackLoadError(`items[${i}] must be an object`, 'INVALID_ITEM', `items.${i}`);
    }
    const item = it as Record<string, unknown>;
    if (typeof item.type !== 'string' || !isCatalogItemType(item.type)) {
      throw new PackLoadError(`items[${i}].type must be FOOD, PRODUCT, or SERVICE`, 'INVALID_FIELD', `items.${i}.type`);
    }
    if (typeof item.canonicalName !== 'string' || !item.canonicalName.trim()) {
      throw new PackLoadError(`items[${i}].canonicalName is required`, 'MISSING_FIELD', `items.${i}.canonicalName`);
    }
    if (typeof item.shortDescription !== 'string') {
      throw new PackLoadError(`items[${i}].shortDescription is required`, 'MISSING_FIELD', `items.${i}.shortDescription`);
    }
    if (!Array.isArray(item.tags)) {
      throw new PackLoadError(`items[${i}].tags must be an array`, 'INVALID_FIELD', `items.${i}.tags`);
    }
    if (typeof item.categoryKey !== 'string' || !item.categoryKey.trim()) {
      throw new PackLoadError(`items[${i}].categoryKey is required`, 'MISSING_FIELD', `items.${i}.categoryKey`);
    }
    if (!categoryKeys.has((item.categoryKey as string).trim())) {
      throw new PackLoadError(
        `items[${i}].categoryKey "${item.categoryKey}" does not match any category key`,
        'INVALID_REF',
        `items.${i}.categoryKey`
      );
    }
  }
  // Validate parentKey refs
  for (let i = 0; i < o.categories.length; i++) {
    const cat = o.categories[i] as Record<string, unknown>;
    const parentKey = cat.parentKey;
    if (parentKey != null && parentKey !== '') {
      if (!categoryKeys.has(String(parentKey).trim())) {
        throw new PackLoadError(
          `categories[${i}].parentKey "${parentKey}" does not match any category key`,
          'INVALID_REF',
          `categories.${i}.parentKey`
        );
      }
    }
  }
}

/**
 * Normalize categories: sort so parents come before children; output with parentKey.
 */
function normalizeCategories(rawCategories: RawPackCategory[]): NormalizedCategory[] {
  const byKey = new Map<string, RawPackCategory>();
  for (const c of rawCategories) {
    byKey.set(c.key, c);
  }
  const sorted: NormalizedCategory[] = [];
  const visited = new Set<string>();
  function visit(key: string) {
    if (visited.has(key)) return;
    const c = byKey.get(key);
    if (!c) return;
    const parentKey = c.parentKey ?? null;
    if (parentKey && parentKey !== key) visit(parentKey);
    visited.add(key);
    sorted.push({
      key: c.key,
      label: c.label,
      parentKey: parentKey && parentKey.trim() ? parentKey : null,
      sortOrder: c.sortOrder,
    });
  }
  // Visit in original order for stable output when no parent refs
  for (const c of rawCategories) {
    visit(c.key);
  }
  return sorted.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Load and normalize a pack from parsed JSON. Validates required fields and refs;
 * produces in-memory objects ready for Prisma (ids assigned by import script).
 */
export function loadPackFromJson(raw: unknown): LoadedPack {
  validateRawPack(raw);
  const o = raw as RawPackJson;
  const categories = normalizeCategories(o.categories);
  const defaultCurrency = o.currency?.trim() || null;
  const businessType = o.businessType.trim();
  const region = o.region.trim();
  const itemsNormalized: CatalogItemCreatePayload[] = [];
  const starterPackItemJoin: StarterPackItemJoinDatum[] = [];
  o.items.forEach((it, index) => {
    const priceMin = typeof it.priceMin === 'number' ? it.priceMin : null;
    const priceMax = typeof it.priceMax === 'number' ? it.priceMax : null;
    itemsNormalized.push({
      type: it.type as CatalogItemType,
      canonicalName: it.canonicalName.trim(),
      shortDescription: it.shortDescription.trim(),
      longDescription: null,
      tags: Array.isArray(it.tags) ? it.tags.map((t) => String(t)) : [],
      defaultCategoryKey: it.categoryKey.trim(),
      suggestedPriceMin: priceMin,
      suggestedPriceMax: priceMax,
      currencyCode: it.currency?.trim() ?? defaultCurrency,
      imagePrompt: it.imagePrompt?.trim() ?? null,
      imageKeywords: Array.isArray(it.imageKeywords) ? it.imageKeywords.map((k) => String(k)) : null,
      modifiersJson: it.modifiersJson && typeof it.modifiersJson === 'object' ? it.modifiersJson : null,
      businessTypeHints: Array.isArray(it.businessTypeHints) ? it.businessTypeHints.map(String) : [businessType],
      localeHints: Array.isArray(it.localeHints) ? it.localeHints.map(String) : [region],
    });
    starterPackItemJoin.push({
      categoryKey: it.categoryKey.trim(),
      sortOrder: typeof it.sortOrder === 'number' ? it.sortOrder : index,
      featured: Boolean(it.featured),
      overridesJson: null,
    });
  });
  return {
    packMeta: {
      businessType,
      region,
      version: o.version.trim(),
      name: o.name.trim(),
      description: o.description?.trim() ?? null,
      defaultCurrencyCode: defaultCurrency,
    },
    categoriesNormalized: categories,
    itemsNormalized,
    starterPackItemJoin,
  };
}
