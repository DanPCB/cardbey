/**
 * Industry-aware catalog blueprints — extensible registry for believable starter catalogs.
 */

import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';
import { buildCuisineMenuCatalog, isFoodVerticalSlug, resolveCuisineMenuBankKey } from './foodCuisineCatalog.js';
import { ALL_INDUSTRY_BLUEPRINTS } from './industryBlueprints/index.js';
import { CATALOG_ITEM_LIMIT, CATALOG_ITEM_MIN } from '../../config/catalogLimits.js';
import { currencySymbol } from '../../lib/catalog/generators/serviceCatalogHelpers.js';
import { canonicalizeServiceName } from '../../lib/catalog/canonicalServiceNormalizer.js';

export function deriveDefaultImageQueryHint(itemName, bank) {
  const name = String(itemName ?? '').trim().replace(/\s+(- chef'?s|- special|- house)$/i, '').trim();
  if (!name) return null;
  const industry = bank?.industry || '';
  if (industry === 'food') return `${name} food dish plated`;
  if (industry === 'automotive') return `${name} automotive service workshop`;
  if (industry === 'beauty') return `${name} salon beauty treatment`;
  if (industry === 'handyman' || industry === 'plumbing' || industry === 'electrician' || industry === 'home_services') {
    return `${name} ${industry === 'home_services' ? 'handyman' : industry} service professional`;
  }
  if (industry === 'cleaning') return `${name} cleaning service professional`;
  if (['fashion', 'florist', 'furniture', 'electronics', 'grocery'].includes(industry)) {
    return `${name} product photography retail`;
  }
  if (industry === 'professional') return `${name} professional office service`;
  return `${name} professional service`;
}

/**
 * @typedef {{ key: string, label: string }} BlueprintCategory
 * @typedef {{
 *   categoryKey: string,
 *   name: string,
 *   description?: string,
 *   price?: string,
 *   serviceMode?: string,
 *   pricingModel?: string,
 *   fromPrice?: number,
 *   basePrice?: number,
 *   priceUnit?: string,
 *   durationMinutes?: number,
 *   estimateDurationLabel?: string,
 *   imageQueryHint?: string,
 *   tags?: string[]
 * }} BlueprintItem
 * @typedef {{
 *   id: string,
 *   industry: string,
 *   label: string,
 *   verticalSlugs: string[],
 *   matchPatterns?: RegExp[],
 *   templateKey: string,
 *   categories: BlueprintCategory[],
 *   items: BlueprintItem[],
 *   imageQueryHints?: Record<string, string[]>,
 *   promptHints?: string,
 *   websiteCopy?: {
 *     uspItems?: { icon?: string, label: string, description: string }[],
 *     heroImageKeywords?: string[],
 *     ctaLabel?: string
 *   }
 * }} IndustryBlueprint
 */

/** @type {Record<string, IndustryBlueprint>} */
export const INDUSTRY_BLUEPRINTS = ALL_INDUSTRY_BLUEPRINTS;

const CUISINE_SPECIFIC_SLUGS = new Set(['food.vietnamese', 'food.asian', 'food.fast_food']);

const BLUEPRINT_BY_SLUG = Object.fromEntries(
  Object.values(INDUSTRY_BLUEPRINTS).flatMap((bp) => bp.verticalSlugs.map((slug) => [slug, bp.id])),
);

function profileBlob(profile = {}) {
  return [
    profile.businessName,
    profile.storeName,
    profile.businessType,
    profile.storeType,
    profile.category,
    profile.prompt,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .filter(Boolean)
    .join(' ');
}

const ACCOUNTING_SIGNAL_RE =
  /\b(accountant|accounting|bookkeep|bookkeeper|tax return|tax agent|bas|payroll|stp reporting)\b/i;
const FINANCE_SIGNAL_RE =
  /\b(capital group|capital partners|capital management|private equity|venture capital|asset management|wealth management|investment advice|investment advisory|capital|investment|investments|wealth|finance|financial)\b/i;

/**
 * Prefer capital/investment blueprints over accounting when the name is finance-shaped
 * and there is no explicit tax/bookkeeping signal (e.g. "Anison Capital Group").
 * @param {string} blob
 * @returns {string | null}
 */
function resolveFinanceVsAccountingBlueprint(blob) {
  if (!blob) return null;
  const hasAccounting = ACCOUNTING_SIGNAL_RE.test(blob);
  const hasFinance = FINANCE_SIGNAL_RE.test(blob);
  if (hasFinance && !hasAccounting) return 'services.finance';
  if (hasAccounting && !hasFinance) return 'services.accounting';
  if (hasAccounting && hasFinance) return 'services.accounting';
  return null;
}

/**
 * @param {object} profile
 * @returns {string | null}
 */
export function resolveIndustryBlueprintKey(profile = {}) {
  const blob = profileBlob(profile);

  // Explicit finance vs accounting disambiguation before generic pattern scan.
  const financeOrAccounting = resolveFinanceVsAccountingBlueprint(blob);
  if (financeOrAccounting && INDUSTRY_BLUEPRINTS[financeOrAccounting]) {
    return financeOrAccounting;
  }

  if (blob) {
    for (const bp of Object.values(INDUSTRY_BLUEPRINTS)) {
      if (bp.matchPatterns?.some((re) => re.test(blob))) return bp.id;
    }
  }

  const slug = String(profile.verticalSlug ?? '').toLowerCase().trim();
  if (slug && BLUEPRINT_BY_SLUG[slug]) return BLUEPRINT_BY_SLUG[slug];

  const resolved = resolveVertical({
    businessType: profile.businessType ?? profile.storeType,
    businessName: profile.businessName ?? profile.storeName,
    userNotes: profile.prompt,
  });
  if (resolved?.slug && BLUEPRINT_BY_SLUG[resolved.slug]) return BLUEPRINT_BY_SLUG[resolved.slug];

  return null;
}

const MISROUTED_SLUG_RE = /^(retail\.|furniture|retail\.home_garden|services\.generic)$/;

/**
 * @param {string} verticalSlug
 * @param {object} profile
 */
export function reconcileIndustryVerticalSlug(verticalSlug, profile = {}) {
  const slug = String(verticalSlug ?? '').toLowerCase().trim();
  const blueprintKey = resolveIndustryBlueprintKey({ ...profile, verticalSlug: slug });

  if (blueprintKey) {
    const bp = INDUSTRY_BLUEPRINTS[blueprintKey];
    const preferred = bp?.verticalSlugs?.[0];
    if (preferred && (!slug || slug.startsWith('retail.') || slug === 'furniture' || slug === 'services.generic')) {
      return preferred;
    }
    if (slug && bp?.verticalSlugs?.includes(slug)) return slug;
    if (preferred) return preferred;
  }

  return slug || 'services.generic';
}

function formatBlueprintPrice(item, currencyCode = 'AUD') {
  const sym = currencySymbol(currencyCode);
  if (item.price) return item.price;
  if (item.pricingModel === 'custom' || (item.basePrice === 0 && /\bfree\b/i.test(item.name))) {
    return 'Free';
  }
  if (typeof item.basePrice === 'number' && item.basePrice > 0) {
    return `${sym}${item.basePrice.toFixed(2)}`;
  }
  if (item.fromPrice != null && item.priceUnit) {
    const unit = item.priceUnit === 'hour' ? '/hr' : item.priceUnit === 'project' ? '' : `/${item.priceUnit}`;
    return `From ${sym}${item.fromPrice}${unit}`;
  }
  if (item.fromPrice != null) return `From ${sym}${item.fromPrice}`;
  return 'Quote required';
}

function buildFromBlueprint(bank, key, targetCount, profile = {}) {
  const currencyCode = profile.currencyCode ?? 'AUD';
  const cap = Math.max(CATALOG_ITEM_MIN, Math.min(CATALOG_ITEM_LIMIT, targetCount));
  const categories = bank.categories.map((c) => ({
    id: `cat_ind_${c.key}`,
    name: c.label,
  }));
  const catByKey = Object.fromEntries(bank.categories.map((c, i) => [c.key, categories[i].id]));

  const items = [];
  const baseItems = bank.items;
  const seenCanonical = new Set();

  for (let i = 0; items.length < cap && i < baseItems.length * 3; i += 1) {
    const src = baseItems[i % baseItems.length];
    const catId = catByKey[src.categoryKey] || categories[0].id;
    const { canonicalName } = canonicalizeServiceName(src.name);
    const dedupeKey = canonicalName.toLowerCase();
    if (seenCanonical.has(dedupeKey)) continue;
    seenCanonical.add(dedupeKey);

    items.push({
      id: `item_ind_${items.length}`,
      name: canonicalName,
      description: src.description ?? null,
      price: formatBlueprintPrice(src, currencyCode),
      categoryId: catId,
      categoryKey: src.categoryKey,
      currencyCode,
      ...(src.serviceMode ? { serviceMode: src.serviceMode } : {}),
      ...(src.pricingModel ? { pricingModel: src.pricingModel } : {}),
      ...(src.fromPrice != null ? { fromPrice: src.fromPrice, priceProvenance: 'blueprint' } : {}),
      ...(src.basePrice != null ? { basePrice: src.basePrice } : {}),
      ...(src.priceUnit ? { priceUnit: src.priceUnit } : {}),
      ...(src.durationMinutes != null ? { durationMinutes: src.durationMinutes } : {}),
      ...(src.estimateDurationLabel ? { estimateDurationLabel: src.estimateDurationLabel } : {}),
      ...(src.imageQueryHint ? { imageQueryHint: src.imageQueryHint } : {}),
      ...(src.tags ? { tags: src.tags } : {}),
      ...(!src.imageQueryHint && canonicalName
        ? { imageQueryHint: deriveDefaultImageQueryHint(canonicalName, bank) }
        : {}),
    });
  }

  const imageQueryHints = (bank.categories || []).reduce((acc, c) => {
    const catId = catByKey[c.key];
    const hints = bank.imageQueryHints?.[c.key] || [c.label.toLowerCase(), bank.industry === 'food' ? 'restaurant dish' : 'professional service'];
    acc[catId] = hints;
    return acc;
  }, {});

  return {
    categories,
    items,
    imageQueryHints,
    meta: { catalogSource: 'industry_blueprint', vertical: key, industryLabel: bank.label },
  };
}

/**
 * @param {object} profile
 * @param {number} [targetCount]
 */
export function buildIndustryCatalog(profile = {}, targetCount = CATALOG_ITEM_LIMIT) {
  const slug = String(profile.verticalSlug ?? '').toLowerCase().trim();
  const isFood = isFoodVerticalSlug(slug) || String(profile.verticalGroup ?? '').toLowerCase() === 'food';

  const cuisineKey = resolveCuisineMenuBankKey(
    profile.verticalSlug,
    profile.businessName ?? profile.storeName,
    profile.businessType ?? profile.storeType,
  );
  if (isFood && cuisineKey && CUISINE_SPECIFIC_SLUGS.has(cuisineKey)) {
    const cuisine = buildCuisineMenuCatalog(profile, targetCount);
    if (cuisine) return cuisine;
  }

  const key = resolveIndustryBlueprintKey(profile);
  const bank = key ? INDUSTRY_BLUEPRINTS[key] : null;
  if (bank) return buildFromBlueprint(bank, key, targetCount, profile);

  if (isFood) {
    return buildCuisineMenuCatalog(profile, targetCount);
  }

  return null;
}

/**
 * @param {object} profile
 */
export function getIndustryPromptHints(profile = {}) {
  const key = resolveIndustryBlueprintKey(profile);
  const bank = key ? INDUSTRY_BLUEPRINTS[key] : null;
  if (!bank?.promptHints) return null;
  const examples = (bank.items || []).slice(0, 8).map((i) => i.name).join(', ');
  return `${bank.promptHints}\nExample items: ${examples}.`;
}

/**
 * @param {object} profile
 */
export function getIndustryWebsiteCopy(profile = {}) {
  const key = resolveIndustryBlueprintKey(profile);
  const bank = key ? INDUSTRY_BLUEPRINTS[key] : null;
  return bank?.websiteCopy ?? null;
}

/**
 * @param {string} verticalSlug
 */
export function industrySlugToTemplateKey(verticalSlug) {
  const key = BLUEPRINT_BY_SLUG[String(verticalSlug || '').toLowerCase()];
  if (!key) return null;
  return INDUSTRY_BLUEPRINTS[key]?.templateKey ?? null;
}

/**
 * @param {string | null | undefined} name
 */
export function isRetailCatalogPlaceholderName(name) {
  const base = String(name ?? '').trim();
  if (!base) return false;
  return /\b(featured item|popular pick|customer favourite|customer favorite|top seller|staff pick|best seller|new arrival|just in|seasonal new|limited edition|essential item|core product|staple item|basic option|standard range|variant [ab]|size [smlxl]{1,2}|add-?on|accessory|replacement|spare|bundle|item [abc])\b/i.test(
    base,
  );
}

/**
 * @param {object[]} products
 * @param {object} profile
 */
export function shouldRepairRetailCatalogLeakInServiceStore(products, profile = {}) {
  if (!Array.isArray(products) || products.length === 0) return false;
  const group = String(profile.verticalGroup ?? '').toLowerCase();
  const slug = String(profile.verticalSlug ?? '').toLowerCase();
  const hasBlueprint = Boolean(resolveIndustryBlueprintKey(profile));
  if (group === 'retail' && !hasBlueprint && (slug === 'retail' || slug === 'retail.generic')) return false;
  const isIndustryCatalog =
    hasBlueprint ||
    group === 'food' ||
    group === 'beauty' ||
    group === 'fashion' ||
    group === 'services' ||
    group === 'auto' ||
    group === 'home' ||
    slug.startsWith('food.') ||
    slug.startsWith('services.') ||
    slug.startsWith('auto.') ||
    slug.startsWith('beauty.') ||
    slug.startsWith('fashion.');
  if (!isIndustryCatalog) return false;
  return products.some((p) => isRetailCatalogPlaceholderName(p?.name));
}

/**
 * Resolve blueprint id for a template key (first match).
 * @param {string} templateKey
 */
export function blueprintIdForTemplateKey(templateKey) {
  const key = String(templateKey || '').toLowerCase();
  for (const bp of Object.values(INDUSTRY_BLUEPRINTS)) {
    if (bp.templateKey === key) return bp.id;
  }
  return null;
}
