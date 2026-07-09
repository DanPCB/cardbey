/**
 * Detect service-catalog scaffold names leaked into food/retail/fashion stores.
 * Names like "Business Package", "Call-out Fee", and "Custom Quote" come from
 * services_generic templates and seed builders — not from food or product menus.
 */

import { resolveVertical } from '../verticals/verticalTaxonomy.js';
import { buildSeedCatalog } from '../../services/store/seeds/seedCatalogBuilder.js';
import { buildCuisineMenuCatalog } from '../../services/draftStore/foodCuisineCatalog.js';

const SERVICE_CATALOG_PLACEHOLDER_RE =
  /\b(business package|call-?out fee|custom quote|consultation|starter package|essential package|complete package|value package|core service|standard service|premium service|basic service|extended service|express service|full service|scheduled visit|emergency call-?out|support package|standard visit|site visit|follow-?up|maintenance|inspection|report|priority service|one-?off service|recurring service|add-?on service|package deal)\b/i;

const VARIATION_SUFFIX_RE = /\s*(\(variation\)|- option \d+|- style [a-z]|- alt|- second)$/i;

/**
 * @param {string | null | undefined} name
 */
export function normalizeServicePlaceholderName(name) {
  return String(name ?? '')
    .trim()
    .replace(VARIATION_SUFFIX_RE, '')
    .trim();
}

/**
 * @param {string | null | undefined} name
 */
export function isServiceCatalogPlaceholderName(name) {
  const base = normalizeServicePlaceholderName(name);
  if (!base) return false;
  return SERVICE_CATALOG_PLACEHOLDER_RE.test(base);
}

/**
 * @param {object[]} products
 */
export function countServiceCatalogPlaceholderHits(products) {
  if (!Array.isArray(products)) return 0;
  return products.filter((p) => isServiceCatalogPlaceholderName(p?.name)).length;
}

/**
 * @param {object} profile
 */
export function isNonServiceCatalogVertical(profile = {}) {
  const group = String(profile.verticalGroup ?? '').toLowerCase();
  const slug = String(profile.verticalSlug ?? '').toLowerCase();
  const blob = [
    profile.businessType,
    profile.storeType,
    profile.category,
    profile.businessName,
    profile.storeName,
    profile.catalogLabel,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (group === 'food' || group === 'retail' || group === 'fashion') return true;
  if (slug.startsWith('food.') || slug.startsWith('fashion.') || slug.startsWith('retail.')) return true;
  return /\b(restaurant|cafe|coffee|bakery|food|menu|dining|kitchen|bistro|eatery|pizza|fashion|retail|clothing|apparel|boutique|wear|shop|store)\b/.test(
    blob,
  );
}

/**
 * @param {object[]} products
 * @param {object} profile
 */
export function shouldRepairServiceCatalogLeak(products, profile = {}) {
  if (!Array.isArray(products) || products.length === 0) return false;
  if (!isNonServiceCatalogVertical(profile)) return false;
  return countServiceCatalogPlaceholderHits(products) >= 1;
}

/**
 * Replace leaked service placeholder names with vertical-appropriate seed names.
 * Preserves ids, images, prices, and category assignments.
 *
 * @param {object[]} products
 * @param {object} profile
 * @param {() => { categories?: object[], items?: object[] }} buildSeed
 */
export function repairServiceCatalogPlaceholderProducts(products, profile = {}, buildSeed) {
  if (!shouldRepairServiceCatalogLeak(products, profile)) {
    return { products, repaired: false, repairedCount: 0 };
  }
  const seed = typeof buildSeed === 'function' ? buildSeed() : null;
  const seedItems = Array.isArray(seed?.items) ? seed.items : [];
  if (seedItems.length === 0) {
    return { products, repaired: false, repairedCount: 0 };
  }

  let seedIdx = 0;
  let repairedCount = 0;
  const repaired = products.map((product) => {
    if (!product || typeof product !== 'object' || !isServiceCatalogPlaceholderName(product.name)) {
      return product;
    }
    const replacement = seedItems[seedIdx % seedItems.length];
    seedIdx += 1;
    repairedCount += 1;
    const next = {
      ...product,
      name: replacement?.name || product.name,
      description: replacement?.description ?? product.description ?? null,
      serviceMode: undefined,
      pricingModel: undefined,
      executionAction: undefined,
      primaryAction: undefined,
      bookingEnabled: undefined,
      purchaseEnabled: undefined,
      serviceCatalog: undefined,
      itemType: undefined,
      type: undefined,
      kind: undefined,
    };
    if (replacement?.categoryId && !product.categoryId) {
      next.categoryId = replacement.categoryId;
    }
    return next;
  });

  return {
    products: repaired,
    categories: seed?.categories,
    repaired: repairedCount > 0,
    repairedCount,
  };
}

/**
 * Repair leaked service scaffold names on public storefront catalog output.
 * Used by toPublicStore and publishedBusinessArtifactToPublicStore.
 *
 * @param {object[]} products
 * @param {object} profile
 */
export function repairPublicCatalogServicePlaceholders(products, profile = {}) {
  const vertical = resolveVertical({
    businessType: profile.businessType,
    businessName: profile.businessName ?? profile.storeName,
  });
  const leakProfile = {
    ...profile,
    verticalSlug: profile.verticalSlug ?? vertical.slug,
    verticalGroup: profile.verticalGroup ?? vertical.group,
  };
  return repairServiceCatalogPlaceholderProducts(products, leakProfile, () =>
    buildServiceCatalogPlaceholderSeed(products, leakProfile),
  );
}

/**
 * Build seed catalog for placeholder repair (shared by API mapper and DB backfill).
 *
 * @param {object[]} products
 * @param {object} profile
 */
export function buildServiceCatalogPlaceholderSeed(products, profile = {}) {
  const vertical = resolveVertical({
    businessType: profile.businessType,
    businessName: profile.businessName ?? profile.storeName,
  });
  const leakProfile = {
    ...profile,
    verticalSlug: profile.verticalSlug ?? vertical.slug,
    verticalGroup: profile.verticalGroup ?? vertical.group,
  };
  const targetCount = Math.max(products.length, 24);
  const cuisine = buildCuisineMenuCatalog(
    {
      verticalSlug: leakProfile.verticalSlug,
      verticalGroup: leakProfile.verticalGroup,
      businessType: leakProfile.businessType,
      businessName: leakProfile.businessName ?? leakProfile.storeName,
      catalogLabel: leakProfile.catalogLabel,
    },
    targetCount,
  );
  if (cuisine) return cuisine;
  return buildSeedCatalog(
    {
      verticalSlug: leakProfile.verticalSlug,
      verticalGroup: leakProfile.verticalGroup,
      businessType: leakProfile.businessType,
      businessName: leakProfile.businessName ?? leakProfile.storeName,
    },
    { targetCount },
  );
}

/**
 * Repair placeholders for DB writes — avoids duplicate normalized product names.
 *
 * @param {object[]} products
 * @param {object} profile
 * @param {(name: string) => string} normalizeName
 */
export function repairServiceCatalogPlaceholderProductsForDb(products, profile = {}, normalizeName) {
  if (!shouldRepairServiceCatalogLeak(products, profile)) {
    return { products, repairs: [], repaired: false, repairedCount: 0 };
  }
  const seed = buildServiceCatalogPlaceholderSeed(products, profile);
  const seedItems = Array.isArray(seed?.items) ? seed.items : [];
  if (seedItems.length === 0) {
    return { products, repairs: [], repaired: false, repairedCount: 0 };
  }

  const usedNames = new Set(
    products
      .filter((p) => p && !isServiceCatalogPlaceholderName(p.name))
      .map((p) => normalizeName(p.name))
      .filter(Boolean),
  );

  let seedIdx = 0;
  const repairs = [];
  const repaired = products.map((product) => {
    if (!product || typeof product !== 'object' || !isServiceCatalogPlaceholderName(product.name)) {
      return product;
    }

    let replacement = null;
    for (let attempt = 0; attempt < seedItems.length; attempt += 1) {
      const candidate = seedItems[(seedIdx + attempt) % seedItems.length];
      const candidateName = String(candidate?.name ?? '').trim();
      const normalized = normalizeName(candidateName);
      if (!candidateName || usedNames.has(normalized)) continue;
      replacement = candidate;
      seedIdx = (seedIdx + attempt + 1) % seedItems.length;
      usedNames.add(normalized);
      break;
    }

    if (!replacement) {
      const fallbackName = `${normalizeServicePlaceholderName(product.name) || 'Menu item'} special`;
      const normalized = normalizeName(fallbackName);
      if (!usedNames.has(normalized)) {
        usedNames.add(normalized);
        replacement = { name: fallbackName, description: product.description ?? null };
      } else {
        return product;
      }
    }

    repairs.push({
      id: product.id,
      fromName: product.name,
      toName: replacement.name,
    });

    return {
      ...product,
      name: replacement.name,
      description: replacement.description ?? product.description ?? null,
      itemType: null,
      bookingEnabled: null,
      purchaseEnabled: null,
      primaryAction: null,
      serviceCatalog: null,
    };
  });

  return {
    products: repaired,
    repairs,
    repaired: repairs.length > 0,
    repairedCount: repairs.length,
  };
}
