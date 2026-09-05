/**
 * Industry-aware catalog blueprints — extensible registry for believable starter catalogs.
 */

import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';
import { buildCuisineMenuCatalog, isFoodVerticalSlug, resolveCuisineMenuBankKey } from './foodCuisineCatalog.js';
import { ALL_INDUSTRY_BLUEPRINTS } from './industryBlueprints/index.js';
import { CATALOG_ITEM_LIMIT, CATALOG_ITEM_MIN } from '../../config/catalogLimits.js';
import { currencySymbol } from '../../lib/catalog/generators/serviceCatalogHelpers.js';
import { canonicalizeServiceName } from '../../lib/catalog/canonicalServiceNormalizer.js';
import { isServiceCatalogPlaceholderName } from '../../lib/catalog/serviceCatalogPlaceholders.js';
import { newBusinessStarterProvenance } from '../../lib/storeCreation/storeCreationMode.js';

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

/**
 * Positive price from a catalog item, or null.
 * @param {object} item
 * @returns {number|null}
 */
export function extractCatalogItemPriceNumber(item) {
  if (!item || typeof item !== 'object') return null;
  for (const key of ['fromPrice', 'basePrice', 'priceMin', 'amount']) {
    const n = Number(item[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const raw = item.price ?? item.displayPrice;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    if (/quote\s*required|on\s*request|contact\s*us/i.test(raw)) return null;
    const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/**
 * True when items look like a real price list (scanned/uploaded/sourced), not invented scaffolding.
 * @param {object[]|null|undefined} items
 * @returns {boolean}
 */
export function catalogHasMeaningfulPriceList(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  let strong = 0;
  let weak = 0;
  for (const it of items) {
    const n = extractCatalogItemPriceNumber(it);
    if (n == null) continue;
    const prov = String(it.priceProvenance || it.priceOrigin || it.priceSource || it.catalogSource || '').toLowerCase();
    const sourced =
      prov.includes('owner') ||
      prov.includes('research') ||
      prov.includes('ocr') ||
      prov.includes('preload') ||
      prov.includes('sourced');
    if (sourced && n > 0) strong += 1;
    else if (n >= 10) weak += 1;
  }
  return strong >= 1 || weak >= 2;
}

const CONSULTATION_ONLY_NAME_RE = /^book our consultations$/i;

/**
 * True when catalog already has real named offerings (OCR / research / flyer lines),
 * even if they have no dollar prices. Do not wipe these into a single consultation.
 * @param {object[]|null|undefined} items
 * @returns {boolean}
 */
export function catalogHasNamedGroundedOfferings(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  let named = 0;
  for (const it of items) {
    const name = String(it?.name ?? '').trim();
    if (name.length < 3) continue;
    if (CONSULTATION_ONLY_NAME_RE.test(name)) continue;
    if (isServiceCatalogPlaceholderName(name)) continue;
    named += 1;
  }
  return named >= 1;
}

/**
 * General unpriced consultation booking for professional stores without a price list.
 * @param {object} [profile]
 * @param {IndustryBlueprint|null} [bank]
 */
export function buildProfessionalConsultationBookingCatalog(profile = {}, bank = null) {
  const vertical = bank?.verticalSlugs?.[0] || profile.verticalSlug || 'services.finance';
  const categories = [{ id: 'cat_consult_0', name: 'Consultations' }];
  const items = [
    {
      id: 'item_consult_0',
      name: 'Book our consultations',
      description: 'Book a consultation to discuss your needs and next steps.',
      price: null,
      categoryId: 'cat_consult_0',
      serviceMode: 'fixed_booking',
      pricingModel: 'custom',
      priceProvenance: null,
      executionAction: 'book',
      imageQueryHint: 'professional consultation meeting modern office',
    },
  ];
  return {
    categories,
    items,
    imageQueryHints: {
      cat_consult_0: ['professional consultation', 'advisory meeting'],
    },
    meta: {
      catalogSource: 'professional_consultation_booking',
      vertical,
      industryLabel: bank?.label || 'Professional',
      offeringProvenance: 'GENERATED',
      bookingMode: 'consultation_only',
    },
  };
}

/**
 * @param {object} [profile]
 * @param {IndustryBlueprint|null} [bank]
 * @returns {boolean}
 */
export function isProfessionalIndustryContext(profile = {}, bank = null) {
  if (bank?.industry === 'professional') return true;
  const key = resolveIndustryBlueprintKey(profile);
  if (key && INDUSTRY_BLUEPRINTS[key]?.industry === 'professional') return true;
  const slug = String(profile.verticalSlug ?? '').toLowerCase();
  if (/^services\.(finance|accounting|legal)/.test(slug)) return true;
  const blob = profileBlob(profile);
  return FINANCE_SIGNAL_RE.test(blob) || ACCOUNTING_SIGNAL_RE.test(blob) || /\b(lawyer|legal|solicitor|attorney)\b/i.test(blob);
}

/**
 * Build a professional catalog from named offerings without inventing prices.
 * @param {object[]} evidence
 * @param {object} [profile]
 * @param {IndustryBlueprint|null} [bank]
 */
export function buildNamedUnpricedProfessionalCatalog(evidence, profile = {}, bank = null) {
  const vertical = bank?.verticalSlugs?.[0] || profile.verticalSlug || 'services.finance';
  const categories = [{ id: 'cat_named_0', name: bank?.categories?.[0]?.label || 'Services' }];
  const items = [];
  const seen = new Set();
  for (const raw of evidence) {
    const name = String(raw?.name ?? raw?.title ?? '').trim();
    if (name.length < 3) continue;
    if (CONSULTATION_ONLY_NAME_RE.test(name)) continue;
    if (isServiceCatalogPlaceholderName(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `item_named_${items.length}`,
      name,
      description: raw?.description ?? null,
      price: null,
      categoryId: 'cat_named_0',
      serviceMode: raw?.serviceMode || 'fixed_booking',
      pricingModel: 'custom',
      priceProvenance: raw?.priceProvenance || raw?.priceOrigin || 'ocr',
      executionAction: 'book',
      imageQueryHint:
        raw?.imageQueryHint ||
        deriveDefaultImageQueryHint(name, bank || { industry: 'professional' }),
    });
  }
  if (items.length === 0) {
    return buildProfessionalConsultationBookingCatalog(profile, bank);
  }
  return {
    categories,
    items,
    imageQueryHints: {
      cat_named_0: ['professional advisory service', 'finance consultation office'],
    },
    meta: {
      catalogSource: 'named_offerings_unpriced',
      vertical,
      industryLabel: bank?.label || 'Professional',
      offeringProvenance: 'GROUNDED_UNPRICED',
      bookingMode: 'named_offerings_unpriced',
    },
  };
}

/**
 * If professional + no meaningful price list → consultation booking catalog.
 * Keeps priced menus from OCR/upload/research when evidence exists.
 * Also keeps **named** unpriced offerings (e.g. loan products from a flyer) —
 * never invent a single "Book our consultations" over real service names.
 * @param {object} catalog
 * @param {object} [profile]
 */
export function collapseProfessionalCatalogWithoutPriceList(catalog, profile = {}) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  const items = Array.isArray(catalog.items)
    ? catalog.items
    : Array.isArray(catalog.products)
      ? catalog.products
      : [];
  const mergedProfile = {
    ...profile,
    businessName: profile.businessName || catalog.profile?.name || catalog.storeName,
    businessType: profile.businessType || catalog.profile?.type || catalog.storeType,
    verticalSlug: profile.verticalSlug || catalog.meta?.vertical || catalog.profile?.verticalSlug,
  };
  if (!isProfessionalIndustryContext(mergedProfile)) return catalog;
  if (profile.hasPriceList === true || profile.allowBlueprintPrices === true) return catalog;
  if (catalogHasMeaningfulPriceList(items)) return catalog;
  // Named flyer/OCR/research offerings without $ prices are still grounded — keep them.
  if (catalogHasNamedGroundedOfferings(items)) {
    return {
      ...catalog,
      meta: {
        ...(catalog.meta || {}),
        bookingMode: catalog.meta?.bookingMode || 'named_offerings_unpriced',
        offeringProvenance: catalog.meta?.offeringProvenance || 'GROUNDED_UNPRICED',
      },
    };
  }

  const key = resolveIndustryBlueprintKey(mergedProfile);
  const bank = key ? INDUSTRY_BLUEPRINTS[key] : null;
  const consultation = buildProfessionalConsultationBookingCatalog(mergedProfile, bank);

  if (Array.isArray(catalog.products) && !Array.isArray(catalog.items)) {
    return {
      ...catalog,
      products: consultation.items,
      categories: consultation.categories,
      imageQueryHints: consultation.imageQueryHints,
      meta: { ...(catalog.meta || {}), ...consultation.meta },
    };
  }

  return {
    ...catalog,
    categories: consultation.categories,
    items: consultation.items,
    products: Array.isArray(catalog.products) ? consultation.items : catalog.products,
    imageQueryHints: consultation.imageQueryHints,
    meta: { ...(catalog.meta || {}), ...consultation.meta },
  };
}

/**
 * NEW_BUSINESS starter catalog from industry blueprint.
 * Populated demo offerings — provenance AI_GENERATED_STARTER, no fake verified prices/facts.
 * @param {object} [profile]
 * @param {IndustryBlueprint|null} [bank]
 * @param {string} [key]
 * @param {number} [targetCount]
 */
export function buildNewBusinessStarterCatalog(profile = {}, bank = null, key = null, targetCount = 24) {
  if (!bank?.items?.length) return null;
  const provenance = newBusinessStarterProvenance();
  const cap = Math.max(8, Math.min(40, targetCount || 24));
  const categories = (bank.categories || []).map((c) => ({
    id: `cat_starter_${c.key}`,
    name: c.label,
  }));
  const catByKey = Object.fromEntries((bank.categories || []).map((c, i) => [c.key, categories[i]?.id]));
  const items = [];
  const seen = new Set();
  for (let i = 0; items.length < cap && i < bank.items.length * 2; i += 1) {
    const src = bank.items[i % bank.items.length];
    const { canonicalName } = canonicalizeServiceName(src.name);
    const dedupe = canonicalName.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const catId = catByKey[src.categoryKey] || categories[0]?.id;
    const hint =
      src.imageQueryHint ||
      deriveDefaultImageQueryHint(canonicalName, bank) ||
      `${canonicalName} ${bank.industry || 'product'}`;
    const isRetailIndustry =
    bank.industry === 'florist' ||
    bank.industry === 'furniture' ||
    bank.industry === 'electronics' ||
    bank.industry === 'grocery' ||
    bank.industry === 'fashion' ||
    /\b(florist|flower|retail)\b/i.test(String(bank.id || key || ''));

  items.push({
      id: `item_starter_${items.length}`,
      name: canonicalName,
      description: src.description ?? null,
      price: null,
      priceStatus: 'UNKNOWN',
      priceDisplay: 'Price on request',
      categoryId: catId,
      categoryKey: src.categoryKey,
      provenance: provenance.source,
      evidenceStatus: provenance.evidenceStatus,
      editable: true,
      priceProvenance: null,
      imageQueryHint: hint,
      contentOrigin: 'suggested',
      catalogSource: 'ai_generated_starter',
      ...(isRetailIndustry
        ? {
            itemType: 'product',
            kind: 'product',
            type: 'product',
            contentRole: 'product',
            executionAction: 'add_to_cart',
            primaryAction: 'add_to_cart',
            bookingEnabled: false,
            purchaseEnabled: true,
          }
        : {}),
      ...(src.serviceMode ? { serviceMode: src.serviceMode } : {}),
      ...(src.pricingModel ? { pricingModel: 'custom' } : {}),
    });
  }
  const imageQueryHints = (bank.categories || []).reduce((acc, c) => {
    const catId = catByKey[c.key];
    const hints =
      bank.imageQueryHints?.[c.key] ||
      [c.label.toLowerCase(), bank.industry === 'florist' ? 'florist flowers' : bank.industry || 'product'];
    if (catId) acc[catId] = hints;
    return acc;
  }, {});
  return {
    categories,
    items,
    products: items,
    imageQueryHints,
    meta: {
      catalogSource: 'ai_generated_starter',
      vertical: key || bank.verticalSlugs?.[0] || profile.verticalSlug,
      industryLabel: bank.label,
      neverGenericService: true,
      creationMode: 'NEW_BUSINESS',
      ...provenance,
    },
  };
}

/**
 * @deprecated Prefer buildNewBusinessStarterCatalog for NEW_BUSINESS path.
 * Kept as thin alias for older sparse florist callers/tests.
 */
export function buildSparseInferredFloristCatalog(profile = {}, bank = null) {
  const key = bank?.id || 'retail.flower';
  const resolvedBank = bank || INDUSTRY_BLUEPRINTS['retail.flower'];
  return (
    buildNewBusinessStarterCatalog(profile, resolvedBank, key, 24) || {
      categories: [],
      items: [],
      imageQueryHints: {},
      meta: { catalogSource: 'sparse_inferred_florist', neverGenericService: true },
    }
  );
}

function buildFromBlueprint(bank, key, targetCount, profile = {}) {
  // Professional stores without a real price list → consultation booking only
  // when there are also no named grounded offerings from OCR/research/flyer.
  if (
    bank.industry === 'professional' &&
    profile.allowBlueprintPrices !== true &&
    profile.hasPriceList !== true
  ) {
    const evidence =
      profile.items || profile.products || profile.detectedServices || profile.preloadedCatalogItems || [];
    if (catalogHasNamedGroundedOfferings(evidence) && !catalogHasMeaningfulPriceList(evidence)) {
      return buildNamedUnpricedProfessionalCatalog(evidence, profile, bank);
    }
    if (!catalogHasMeaningfulPriceList(evidence)) {
      return buildProfessionalConsultationBookingCatalog(profile, bank);
    }
  }

  // NEW_BUSINESS / no verified offerings → populated AI starter (not Core Service, not empty).
  // EXISTING with evidence continues through priced blueprint below.
  const creationMode = String(profile.creationMode ?? '').toUpperCase();
  const isNewOrUnverified =
    creationMode === 'NEW_BUSINESS' ||
    (creationMode !== 'EXISTING_BUSINESS' &&
      profile.allowBlueprintPrices !== true &&
      profile.hasPriceList !== true);

  if (isNewOrUnverified && (bank.industry === 'florist' || bank.industry === 'furniture' || bank.industry === 'electronics' || bank.industry === 'grocery' || bank.industry === 'fashion' || bank.industry === 'handyman' || bank.industry === 'beauty' || bank.industry === 'cleaning' || bank.industry === 'plumbing' || bank.industry === 'electrician' || bank.industry === 'home_services' || bank.industry === 'automotive')) {
    const evidence =
      profile.items || profile.products || profile.detectedProducts || profile.detectedServices || profile.preloadedCatalogItems || [];
    if (!catalogHasMeaningfulPriceList(evidence) && !catalogHasNamedGroundedOfferings(evidence)) {
      const starter = buildNewBusinessStarterCatalog(profile, bank, key, targetCount);
      if (starter?.items?.length) return starter;
    }
  }

  // Legacy florist branch covered by starter above; keep professional collapse.
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
