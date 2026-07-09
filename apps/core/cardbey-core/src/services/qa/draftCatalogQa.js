/**
 * Deterministic catalog QA rules + auto-repair for draft preview (store / mini-website).
 * Complements LLM outputValidator — applies real patches to preview before marking ready.
 */

import { FASHION_KEYWORDS } from './draftQaAgent.js';
import { GENERIC_NAME_REGEX, effectiveVertical } from '../draftStore/draftGuards.js';
import { buildSeedCatalog } from '../store/seeds/seedCatalogBuilder.js';
import { recomputeDraftCategoriesFromItems } from '../../lib/draftCategoryUtils.js';
import { isResearchBackedPreview } from '../draftStore/researchCatalogDraft.js';
import {
  isNonServiceCatalogVertical,
  isServiceCatalogPlaceholderName,
} from '../../lib/catalog/serviceCatalogPlaceholders.js';
import { buildCuisineMenuCatalog } from '../draftStore/foodCuisineCatalog.js';

const MIN_DESCRIPTION_LEN = 12;
const MIN_TAGLINE_LEN = 8;
const MIN_STORE_DESCRIPTION_LEN = 20;

/** Generic fashion-adjacent placeholders often leaked from fashion_boutique template. */
const FASHION_PLACEHOLDER_NAMES =
  /\b(classic tee|button-up shirt|slim jeans|chino pants|lightweight jacket|everyday sneakers|leather boots|leather belt|sunglasses|hoodie)\b/i;

const GENERIC_PRODUCT_PATTERNS = [
  GENERIC_NAME_REGEX,
  /^item\s*\d+$/i,
  /^product\s*\d+$/i,
  /^featured item$/i,
  /^popular pick$/i,
  /^customer favourite$/i,
  /^best seller\s*(one|two|three|four|five)?$/i,
];

/** Default AUD-style prices when missing (by coarse vertical). */
const PRICE_DEFAULTS = {
  food: [4.5, 5.5, 6.5, 8.5, 12.5, 14.5, 16.5, 18.5],
  florist: [35, 45, 55, 65, 75, 85],
  retail: [19.95, 29.95, 39.95, 49.95, 59.95, 79.95],
  products: [24.95, 34.95, 44.95, 54.95],
  services: [49, 79, 99, 129, 149],
};

function parsePrice(item) {
  if (!item || typeof item !== 'object') return null;
  const raw = item.priceV1?.amount ?? item.price;
  if (raw == null || raw === '') return null;
  const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

function isGenericProductName(name) {
  const n = String(name ?? '').trim();
  if (!n || n.length < 3) return true;
  return GENERIC_PRODUCT_PATTERNS.some((re) => re.test(n));
}

function isFashionPlaceholderName(name, businessAllowsFashion) {
  const n = String(name ?? '').trim();
  if (!n) return false;
  if (businessAllowsFashion) return false;
  return FASHION_KEYWORDS.test(n) || FASHION_PLACEHOLDER_NAMES.test(n);
}

function isWeakDescription(desc) {
  const d = String(desc ?? '').trim();
  if (!d) return true;
  if (d.length < MIN_DESCRIPTION_LEN) return true;
  if (/^lorem\b|^description\b|^product\b/i.test(d)) return true;
  return false;
}

function businessAllowsFashion(businessType, verticalSlug) {
  const blob = `${businessType || ''} ${verticalSlug || ''}`.toLowerCase();
  return /\b(fashion|clothing|apparel|boutique|wear)\b/.test(blob);
}

function isSweetsCafeBusiness(businessType, storeName, verticalSlug) {
  const blob = `${businessType || ''} ${storeName || ''} ${verticalSlug || ''}`.toLowerCase();
  return /\b(sweet|dessert|bakery|cafe|coffee|confectionery|cake|pastry)\b/.test(blob);
}

/**
 * @param {object} preview
 * @param {object} [input]
 * @returns {{ pass: boolean, issues: string[], issueCodes: string[], badProductIndices: number[] }}
 */
export function auditDraftCatalogQa(preview, input = {}) {
  const issues = [];
  const issueCodes = [];
  const badProductIndices = new Set();

  const items = Array.isArray(preview?.items)
    ? preview.items
    : Array.isArray(preview?.catalog?.products)
      ? preview.catalog.products
      : [];

  const businessType =
    input.businessType || input.storeType || preview?.storeType || preview?.meta?.storeType || '';
  const storeName = preview?.storeName || preview?.meta?.storeName || input?.businessName || '';
  const verticalSlug = input?.verticalSlug || preview?.meta?.verticalSlug || '';
  const allowFashion = businessAllowsFashion(businessType, verticalSlug);
  const sweetsCafe = isSweetsCafeBusiness(businessType, storeName, verticalSlug);

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const name = String(item.name ?? '').trim();
    let bad = false;

    if (parsePrice(item) == null) {
      issues.push(`products[${index}]: missing or invalid price`);
      issueCodes.push('PRODUCT_NULL_PRICE');
      bad = true;
    }
    if (isGenericProductName(name)) {
      issues.push(`products[${index}]: generic placeholder name "${name}"`);
      issueCodes.push('PRODUCT_GENERIC_NAME');
      bad = true;
    }
    if (isFashionPlaceholderName(name, allowFashion)) {
      issues.push(`products[${index}]: fashion/template placeholder "${name}"`);
      issueCodes.push('PRODUCT_FASHION_PLACEHOLDER');
      bad = true;
    }
    if (isWeakDescription(item.description)) {
      issues.push(`products[${index}]: weak or empty description`);
      issueCodes.push('PRODUCT_WEAK_DESCRIPTION');
      bad = true;
    }
    if (bad) badProductIndices.add(index);
  });

  if (sweetsCafe && items.length >= 10) {
    const fashionHits = items.filter((it, i) => isFashionPlaceholderName(it?.name, false));
    if (fashionHits.length >= 2) {
      issues.push(
        `TEMPLATE_CATALOG_LEAK: ${fashionHits.length} fashion items in sweets/cafe catalog (e.g. indices ${items
          .map((it, i) => (isFashionPlaceholderName(it?.name, false) ? i : -1))
          .filter((i) => i >= 0)
          .slice(0, 12)
          .join(', ')})`,
      );
      issueCodes.push('TEMPLATE_CATALOG_LEAK');
      items.forEach((it, i) => {
        if (isFashionPlaceholderName(it?.name, false)) badProductIndices.add(i);
      });
    }
  }

  const leakProfile = {
    businessType,
    storeType: preview?.storeType,
    businessName: storeName,
    storeName,
    verticalSlug,
    verticalGroup: (verticalSlug || '').split('.')[0] || effectiveVertical(businessType),
    catalogLabel: preview?.catalogLabel ?? preview?.meta?.catalogLabel,
  };
  if (isNonServiceCatalogVertical(leakProfile) && items.length >= 3) {
    const serviceHits = items.filter((it) => isServiceCatalogPlaceholderName(it?.name));
    if (serviceHits.length >= 2 || serviceHits.length / items.length >= 0.25) {
      issues.push(
        `SERVICE_CATALOG_LEAK: ${serviceHits.length} service placeholder names in food/retail catalog`,
      );
      issueCodes.push('SERVICE_CATALOG_LEAK');
      items.forEach((it, i) => {
        if (isServiceCatalogPlaceholderName(it?.name)) badProductIndices.add(i);
      });
    }
  }

  const tagline = String(preview?.tagline ?? preview?.slogan ?? '').trim();
  if (!tagline || tagline.length < MIN_TAGLINE_LEN) {
    issues.push('Empty or weak tagline');
    issueCodes.push('EMPTY_TAGLINE');
  }

  const storeDesc = String(preview?.description ?? preview?.storeDescription ?? '').trim();
  if (!storeDesc || storeDesc.length < MIN_STORE_DESCRIPTION_LEN) {
    issues.push('Empty or weak store description');
    issueCodes.push('EMPTY_STORE_DESCRIPTION');
  }

  const heroTags = preview?.heroImageTags ?? preview?.meta?.heroImageTags ?? preview?.hero_image_tags;
  const tagList = Array.isArray(heroTags)
    ? heroTags.filter((t) => typeof t === 'string' && t.trim())
    : typeof heroTags === 'string' && heroTags.trim()
      ? [heroTags.trim()]
      : [];
  if (tagList.length === 0) {
    issues.push('Missing hero_image_tags');
    issueCodes.push('MISSING_HERO_IMAGE_TAGS');
  }

  const pass = issues.length === 0;
  return {
    pass,
    issues,
    issueCodes: [...new Set(issueCodes)],
    badProductIndices: [...badProductIndices].sort((a, b) => a - b),
  };
}

function defaultPriceForIndex(vertical, index) {
  const v = effectiveVertical(vertical, vertical);
  const ladder = PRICE_DEFAULTS[v] || PRICE_DEFAULTS.products;
  return ladder[index % ladder.length];
}

function buildReplacementProducts(profile, count, categories) {
  const cuisine = buildCuisineMenuCatalog(profile, Math.max(24, count + 4));
  if (cuisine?.items?.length) {
    const firstCatId = categories?.[0]?.id || cuisine.categories?.[0]?.id || 'cat_0';
    return cuisine.items.slice(0, count).map((it, i) => ({
      name: it.name,
      description: it.description || `${it.name} — made fresh for you.`,
      price: String(defaultPriceForIndex(profile.businessType || profile.verticalSlug, i)),
      priceV1: { amount: defaultPriceForIndex(profile.businessType || profile.verticalSlug, i) },
      categoryId: it.categoryId || firstCatId,
    }));
  }
  const seed = buildSeedCatalog(profile, { targetCount: Math.max(24, count + 4) });
  const seedItems = seed.items || [];
  const firstCatId = categories?.[0]?.id || seed.categories?.[0]?.id || 'cat_0';
  return seedItems.slice(0, count).map((it, i) => ({
    name: it.name,
    description: it.description || `${it.name} — made fresh for you.`,
    price: String(defaultPriceForIndex(profile.businessType || profile.verticalSlug, i)),
    priceV1: { amount: defaultPriceForIndex(profile.businessType || profile.verticalSlug, i) },
    categoryId: it.categoryId || firstCatId,
  }));
}

function deriveHeroImageTags(preview, input, verticalSlug) {
  const businessType = String(
    input?.businessType || preview?.storeType || preview?.meta?.storeType || 'store',
  ).toLowerCase();
  const name = String(preview?.storeName || input?.businessName || 'store').trim();
  const v = String(verticalSlug || '').toLowerCase();
  if (/\b(cafe|coffee)\b/.test(v) || /\bcafe\b/.test(businessType)) {
    return ['cafe interior', 'coffee shop', name, 'latte art'];
  }
  if (/\b(bakery|sweet|dessert)\b/.test(v) || /\b(bakery|sweet)\b/.test(businessType)) {
    return ['bakery display', 'pastry counter', name, 'desserts'];
  }
  if (/\b(florist|flower)\b/.test(v)) {
    return ['flower shop', 'bouquet', name, 'floral arrangement'];
  }
  if (/\b(fashion|boutique|apparel)\b/.test(v)) {
    return ['fashion boutique', 'clothing store', name, 'apparel display'];
  }
  return ['storefront', name, businessType || 'retail', 'welcome'];
}

function buildStoreDescription(preview, input) {
  const name = String(preview?.storeName || input?.businessName || 'Our store').trim();
  const bt = String(input?.businessType || preview?.storeType || 'local business').trim();
  return `${name} is your local ${bt.replace(/_/g, ' ')} — browse our menu and order online.`;
}

function buildTagline(preview, input) {
  const name = String(preview?.storeName || input?.businessName || 'Us').trim();
  const bt = String(input?.businessType || preview?.storeType || 'store').trim();
  return `Welcome to ${name} — quality ${bt.replace(/_/g, ' ')} you can trust.`;
}

/** Fixes touching more than this many products require explicit owner approval (Tier 2). */
export const TIER2_BULK_PRODUCT_THRESHOLD = 5;

/** Plain-English labels for store-build QA approval cards. */
export const fixDescriptions = {
  category_reassignment: (f) =>
    `Reassign ${f.count} products to more accurate categories based on their names`,
  catalog_regenerate: (f) =>
    `Replace ${f.count} mismatched or placeholder products with items that fit your business`,
  price_field_missing: (f) =>
    `Add missing price data to ${f.count} products`,
  product_description: (f) =>
    `Improve product descriptions for ${f.count} items`,
  product_rename: (f) =>
    `Rename ${f.count} products that use generic placeholder names`,
  hero_image_tags: () => `Add visual style tags to help find the right hero image`,
  bulk_catalog_repair: (f) =>
    `Apply catalog improvements affecting ${f.count} products (categories, names, or descriptions)`,
};

function catalogRepairProfile(preview, input, params) {
  const businessType = params.businessType ?? input.businessType ?? preview.storeType ?? '';
  const verticalSlug = params.verticalSlug ?? input.verticalSlug ?? preview?.meta?.verticalSlug ?? '';
  return {
    verticalSlug,
    verticalGroup: (verticalSlug || '').split('.')[0] || effectiveVertical(businessType),
    businessType,
    businessModel: effectiveVertical(businessType) === 'food' ? 'food' : 'retail',
    businessName: params.businessName ?? input.businessName ?? preview.storeName ?? '',
  };
}

function ensurePreviewItems(preview) {
  const items = Array.isArray(preview.items)
    ? preview.items
    : Array.isArray(preview.catalog?.products)
      ? preview.catalog.products
      : [];
  if (!Array.isArray(preview.items) && items.length) {
    preview.items = items;
  }
  return items;
}

/**
 * Plan Tier 2 catalog fixes (no mutations). Used before owner approval.
 *
 * @returns {Array<{ id: string, kind: string, humanDescription: string, affectedCount: number, indices?: number[] }>}
 */
export function planDraftCatalogQaTier2Fixes(preview, input = {}, params = {}) {
  if (!preview || typeof preview !== 'object') return [];
  if (skipCatalogQaForResearch(preview)) return [];
  const audit = auditDraftCatalogQa(preview, {
    ...input,
    verticalSlug: params.verticalSlug ?? input.verticalSlug,
  });
  const items = ensurePreviewItems(preview);
  const badIndices = audit.badProductIndices ?? [];
  const fixes = [];

  if (badIndices.length > 0) {
    const count = badIndices.length;
    const id = count > TIER2_BULK_PRODUCT_THRESHOLD ? 'bulk_catalog_repair' : 'catalog_regenerate';
    const kind = count > TIER2_BULK_PRODUCT_THRESHOLD ? 'bulk_catalog_repair' : 'catalog_regenerate';
    fixes.push({
      id,
      kind,
      humanDescription:
        kind === 'bulk_catalog_repair'
          ? fixDescriptions.bulk_catalog_repair({ count })
          : fixDescriptions.catalog_regenerate({ count }),
      affectedCount: count,
      indices: [...badIndices],
    });
  }

  let renameCount = 0;
  const renameIndices = [];
  let descModifyCount = 0;
  const descModifyIndices = [];

  for (let i = 0; i < items.length; i++) {
    if (badIndices.includes(i)) continue;
    const item = items[i];
    if (!item || typeof item !== 'object') continue;
    if (isGenericProductName(item.name)) {
      renameCount += 1;
      renameIndices.push(i);
    }
    const desc = String(item.description ?? '').trim();
    if (desc && isWeakDescription(item.description) && item.name) {
      descModifyCount += 1;
      descModifyIndices.push(i);
    }
  }

  if (renameCount > 0 && !fixes.some((f) => f.kind === 'bulk_catalog_repair')) {
    fixes.push({
      id: renameCount > TIER2_BULK_PRODUCT_THRESHOLD ? 'bulk_catalog_repair' : 'product_rename',
      kind: renameCount > TIER2_BULK_PRODUCT_THRESHOLD ? 'bulk_catalog_repair' : 'product_rename',
      humanDescription:
        renameCount > TIER2_BULK_PRODUCT_THRESHOLD
          ? fixDescriptions.bulk_catalog_repair({ count: renameCount })
          : fixDescriptions.product_rename({ count: renameCount }),
      affectedCount: renameCount,
      indices: renameIndices,
    });
  }

  if (descModifyCount > 0 && !fixes.some((f) => f.kind === 'bulk_catalog_repair')) {
    fixes.push({
      id: descModifyCount > TIER2_BULK_PRODUCT_THRESHOLD ? 'bulk_catalog_repair' : 'product_description',
      kind: descModifyCount > TIER2_BULK_PRODUCT_THRESHOLD ? 'bulk_catalog_repair' : 'product_description',
      humanDescription:
        descModifyCount > TIER2_BULK_PRODUCT_THRESHOLD
          ? fixDescriptions.bulk_catalog_repair({ count: descModifyCount })
          : fixDescriptions.product_description({ count: descModifyCount }),
      affectedCount: descModifyCount,
      indices: descModifyIndices,
    });
  }

  if (badIndices.length > 0 && items.length > 0) {
    const catFix = fixes.find((f) => f.kind === 'catalog_regenerate' || f.kind === 'bulk_catalog_repair');
    if (catFix && !fixes.some((f) => f.kind === 'category_reassignment')) {
      fixes.push({
        id: 'category_reassignment',
        kind: 'category_reassignment',
        humanDescription: fixDescriptions.category_reassignment({ count: badIndices.length }),
        affectedCount: badIndices.length,
        indices: [...badIndices],
      });
    }
  }

  const seen = new Set();
  return fixes.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

function skipCatalogQaForResearch(preview) {
  return isResearchBackedPreview(preview);
}

/**
 * Tier 1 — safe additive repairs only (missing schema defaults, empty copy, absent hero tags).
 */
export function applyDraftCatalogQaTier1AutoRepair(preview, input = {}, params = {}) {
  if (skipCatalogQaForResearch(preview)) {
    return { preview, autoFixed: [], repairedProductCount: 0 };
  }
  if (!preview || typeof preview !== 'object') {
    return { preview, autoFixed: [], repairedProductCount: 0 };
  }

  const autoFixed = [];
  const items = ensurePreviewItems(preview);
  const businessType = params.businessType ?? input.businessType ?? preview.storeType ?? '';
  const verticalSlug = params.verticalSlug ?? input.verticalSlug ?? preview?.meta?.verticalSlug ?? '';
  const profile = catalogRepairProfile(preview, input, params);
  const audit = auditDraftCatalogQa(preview, { ...input, verticalSlug });
  const badIndices = new Set(audit.badProductIndices ?? []);

  if (audit.issueCodes?.includes('SERVICE_CATALOG_LEAK') && badIndices.size > 0) {
    const profile = catalogRepairProfile(preview, input, params);
    const replacements = buildReplacementProducts(profile, badIndices.size, preview.categories);
    let repIndex = 0;
    for (const idx of [...badIndices].sort((a, b) => a - b)) {
      const item = items[idx];
      const rep = replacements[repIndex % replacements.length];
      repIndex += 1;
      if (!item || !rep) continue;
      item.name = rep.name;
      item.description = rep.description;
      item.price = rep.price;
      item.priceV1 = rep.priceV1;
      if (rep.categoryId) item.categoryId = rep.categoryId;
      item.serviceMode = undefined;
      item.executionAction = undefined;
      item.primaryAction = undefined;
      item.bookingEnabled = undefined;
      item.purchaseEnabled = undefined;
      item.serviceCatalog = undefined;
      item.itemType = undefined;
      item.type = undefined;
      autoFixed.push(`products[${idx}].service_catalog_leak`);
    }
    const { categories, items: itemsWithCat } = recomputeDraftCategoriesFromItems(items);
    preview.categories = categories;
    preview.items = itemsWithCat;
    badIndices.clear();
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object' || badIndices.has(i)) continue;
    if (parsePrice(item) == null) {
      const amt = defaultPriceForIndex(businessType, i);
      item.price = String(amt);
      item.priceV1 = { amount: amt, currency: item.priceV1?.currency || 'AUD' };
      autoFixed.push(`products[${i}].price`);
    }
    if (item.isService === undefined) {
      item.isService = false;
      autoFixed.push(`products[${i}].isService`);
    }
    if (!Array.isArray(item.tags)) {
      item.tags = [];
      autoFixed.push(`products[${i}].tags`);
    }
    const desc = String(item.description ?? '').trim();
    if (!desc && item.name) {
      item.description = `${item.name} — prepared with care at ${preview.storeName || profile.businessName || 'our store'}.`;
      autoFixed.push(`products[${i}].description`);
    }
  }

  const tagline = String(preview.tagline ?? preview.slogan ?? '').trim();
  if (!tagline || tagline.length < MIN_TAGLINE_LEN) {
    preview.tagline = buildTagline(preview, { ...input, businessType });
    preview.slogan = preview.tagline;
    autoFixed.push('tagline');
  }

  const storeDesc = String(preview.description ?? preview.storeDescription ?? '').trim();
  if (!storeDesc || storeDesc.length < MIN_STORE_DESCRIPTION_LEN) {
    preview.description = buildStoreDescription(preview, { ...input, businessType });
    autoFixed.push('store description');
  }

  const heroTags = preview.heroImageTags ?? preview.meta?.heroImageTags ?? preview.hero_image_tags;
  const tagList = Array.isArray(heroTags)
    ? heroTags.filter((t) => typeof t === 'string' && t.trim())
    : typeof heroTags === 'string' && heroTags.trim()
      ? [heroTags.trim()]
      : [];
  if (tagList.length === 0) {
    const tags = deriveHeroImageTags(preview, input, verticalSlug);
    preview.heroImageTags = tags;
    preview.meta = {
      ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
      heroImageTags: tags,
    };
    autoFixed.push('hero_image_tags');
  }

  return {
    preview,
    autoFixed: [...new Set(autoFixed)],
    repairedProductCount: 0,
  };
}

/**
 * Tier 2 — apply owner-approved catalog mutations.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.fixIds] - When set, only apply matching fix ids/kinds
 */
export function applyDraftCatalogQaTier2Fixes(preview, input = {}, params = {}, opts = {}) {
  if (!preview || typeof preview !== 'object') {
    return { preview, autoFixed: [], repairedProductCount: 0 };
  }
  if (skipCatalogQaForResearch(preview)) {
    return { preview, autoFixed: [], repairedProductCount: 0 };
  }

  const fixIds = new Set(
    (opts.fixIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean),
  );
  const applyAll = fixIds.size === 0;
  const wants = (id) => applyAll || fixIds.has(id);

  const autoFixed = [];
  const audit = auditDraftCatalogQa(preview, {
    ...input,
    verticalSlug: params.verticalSlug ?? input.verticalSlug,
  });
  const items = ensurePreviewItems(preview);
  const profile = catalogRepairProfile(preview, input, params);
  const badIndices = audit.badProductIndices ?? [];

  const runRegenerate =
    wants('catalog_regenerate') ||
    wants('bulk_catalog_repair') ||
    wants('category_reassignment');

  if (runRegenerate && badIndices.length > 0 && items.length > 0) {
    const replacements = buildReplacementProducts(profile, badIndices.length, preview.categories);
    badIndices.forEach((idx, repIndex) => {
      const item = items[idx];
      if (!item || typeof item !== 'object') return;
      const rep = replacements[repIndex % replacements.length];
      if (!rep) return;
      const prevName = item.name;
      item.name = rep.name;
      item.description = rep.description;
      item.price = rep.price;
      item.priceV1 = rep.priceV1;
      if (rep.categoryId) item.categoryId = rep.categoryId;
      item.imageUrl = item.imageUrl ?? null;
      autoFixed.push(`regenerated products[${idx}] (was "${prevName}")`);
    });
    autoFixed.push(`regenerated ${badIndices.length} catalog item(s)`);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || badIndices.includes(i)) continue;
    if (
      (wants('product_description') || wants('bulk_catalog_repair')) &&
      String(item.description ?? '').trim() &&
      isWeakDescription(item.description) &&
      item.name
    ) {
      item.description = `${item.name} — prepared with care at ${preview.storeName || profile.businessName || 'our store'}.`;
      autoFixed.push(`products[${i}].description`);
    }
    if ((wants('product_rename') || wants('bulk_catalog_repair')) && isGenericProductName(item.name)) {
      const catLabel =
        (preview.categories || []).find((c) => c && c.id === item.categoryId)?.name || 'Special';
      item.name = `${catLabel} ${i + 1}`;
      autoFixed.push(`products[${i}].name`);
    }
  }

  if (
    items.length > 0 &&
    (runRegenerate || wants('category_reassignment') || wants('bulk_catalog_repair'))
  ) {
    const { categories, items: itemsWithCat } = recomputeDraftCategoriesFromItems(items);
    preview.categories = categories;
    preview.items = itemsWithCat;
    if (autoFixed.some((x) => x.startsWith('regenerated') || x.includes('categoryId'))) {
      autoFixed.push('categoryId');
    }
  }

  preview.meta = {
    ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
    catalogQaTier2AppliedAt: new Date().toISOString(),
    catalogQaTier2Fixed: [...new Set(autoFixed)],
  };

  return {
    preview,
    autoFixed: [...new Set(autoFixed)],
    repairedProductCount: badIndices.length,
  };
}

/**
 * Apply deterministic repairs to preview (mutates and returns preview).
 *
 * @param {object} preview
 * @param {object} [input]
 * @param {object} [params] - generation params (verticalSlug, businessName, businessType)
 * @returns {{ preview: object, autoFixed: string[], repairedProductCount: number }}
 */
export function applyDraftCatalogQaAutoRepair(preview, input = {}, params = {}) {
  const tier1 = applyDraftCatalogQaTier1AutoRepair(preview, input, params);
  const tier2 = applyDraftCatalogQaTier2Fixes(tier1.preview, input, params);
  const autoFixed = [...tier1.autoFixed, ...tier2.autoFixed];
  tier2.preview.meta = {
    ...(tier2.preview.meta && typeof tier2.preview.meta === 'object' ? tier2.preview.meta : {}),
    catalogQaAutoRepairAt: new Date().toISOString(),
    catalogQaAutoFixed: [...new Set(autoFixed)],
  };
  return {
    preview: tier2.preview,
    autoFixed: [...new Set(autoFixed)],
    repairedProductCount: tier2.repairedProductCount,
  };
}

/**
 * Regenerate specific product indices (e.g. 20–29) — used by repairCatalog when template leak detected.
 */
export function regenerateCatalogProductSlots(preview, indices, input = {}, params = {}) {
  if (!preview || !Array.isArray(indices) || indices.length === 0) return preview;
  const items = Array.isArray(preview.items) ? preview.items : [];
  const businessType = params.businessType ?? input.businessType ?? '';
  const verticalSlug = params.verticalSlug ?? input.verticalSlug ?? '';
  const profile = {
    verticalSlug,
    verticalGroup: (verticalSlug || '').split('.')[0] || effectiveVertical(businessType),
    businessType,
    businessModel: effectiveVertical(businessType) === 'food' ? 'food' : 'retail',
  };
  const replacements = buildReplacementProducts(profile, indices.length, preview.categories);
  indices.forEach((idx, repIndex) => {
    if (idx < 0 || idx >= items.length) return;
    const item = items[idx];
    const rep = replacements[repIndex % replacements.length];
    if (!item || !rep) return;
    item.name = rep.name;
    item.description = rep.description;
    item.price = rep.price;
    item.priceV1 = rep.priceV1;
    if (rep.categoryId) item.categoryId = rep.categoryId;
  });
  const { categories, items: itemsWithCat } = recomputeDraftCategoriesFromItems(items);
  preview.categories = categories;
  preview.items = itemsWithCat;
  return preview;
}
