/**
 * Store-creation semantic precision helpers (P0).
 * Keeps recovered research → catalog → composition path intact; hardens identity,
 * catalog record types, price display, CTA, and storefront copy boundaries.
 */

/** @typedef {'PRODUCT'|'SERVICE'|'CATEGORY'|'COLLECTION'|'NAVIGATION'|'INVENTORY_METADATA'|'PROMOTION'|'CONTENT'|'UNKNOWN'} CatalogRecordType */

export const CATALOG_RECORD_TYPES = Object.freeze([
  'PRODUCT',
  'SERVICE',
  'CATEGORY',
  'COLLECTION',
  'NAVIGATION',
  'INVENTORY_METADATA',
  'PROMOTION',
  'CONTENT',
  'UNKNOWN',
]);

/** Sellable commerce rows only — categories/nav/metadata never become offerings. */
export const COMMERCE_SELLABLE_ROLES = Object.freeze(['product', 'service', 'menu_item']);

/** Florist / gift occasion taxonomy — filters, not products. */
export const FLORIST_OCCASION_CATEGORY_RE =
  /^(birthday|sympathy|love\s*&?\s*romance|love\s*romance|anniversary|get\s*well|new\s*baby|mother'?s?\s*day|father'?s?\s*day|valentine'?s?(?:\s*day)?|christmas|wedding|funeral|congratulations|thank\s*you|just\s*because|corporate|seasonal)$/i;

export const INVENTORY_METADATA_RE =
  /\b((in|out\s*of)\s*stock)\b|\bin\s*stock\s*\(\s*\d+|out\s*of\s*stock\s*\(\s*\d+|\(\s*\d+\s*products?\s*\)/i;

export const INTERNAL_GENERATION_PROMPT_RE =
  /^\s*(create|build|make|generate|set\s*up)\s+(a\s+|an\s+|the\s+)?(store|website|site|page|draft|shop|storefront)\s+(for|about)\b/i;

/** Re-export leaf helper (canonical impl lives in businessDiscovery for runtime graph safety). */
export { stripSeoBusinessDisplayName } from '../businessDiscovery/seoDisplayName.runtime.js';

/**
 * @param {unknown} role
 * @param {Record<string, unknown>} [context]
 * @returns {boolean}
 */
export function isCommerceSellableRole(role, context = {}) {
  if (typeof role !== 'string') return false;
  if (COMMERCE_SELLABLE_ROLES.includes(role)) return true;
  // Trades service_category rows remain quoteable offerings.
  // Retail/florist taxonomy must not (Birthday, Sympathy, etc.).
  if (role === 'service_category') {
    const biz = `${context.businessType ?? ''} ${context.vertical ?? ''} ${context.storeType ?? ''} ${context.businessName ?? ''}`.toLowerCase();
    if (/\b(florist|flower|floral|retail|gift\s*shop|boutique|product_retail)\b/.test(biz)) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * @param {string} role
 * @returns {CatalogRecordType}
 */
export function contentRoleToRecordType(role) {
  const r = String(role ?? '').trim();
  if (r === 'product' || r === 'menu_item') return 'PRODUCT';
  if (r === 'service') return 'SERVICE';
  if (r === 'product_category' || r === 'service_category' || r === 'menu_category') return 'CATEGORY';
  if (r === 'navigation') return 'NAVIGATION';
  if (r === 'inventory_metadata') return 'INVENTORY_METADATA';
  if (
    r === 'about' ||
    r === 'blog' ||
    r === 'gallery' ||
    r === 'project' ||
    r === 'testimonial' ||
    r === 'trust_content' ||
    r === 'policy' ||
    r === 'career' ||
    r === 'contact' ||
    r === 'location' ||
    r === 'support'
  ) {
    return 'CONTENT';
  }
  return 'UNKNOWN';
}

/**
 * Classify a catalog label before commerce persistence.
 * @param {unknown} item
 * @param {Record<string, unknown>} [context]
 * @returns {{ recordType: CatalogRecordType, contentRole: string, commerceEligible: boolean }}
 */
export function classifyCatalogRecord(item, context = {}) {
  const name = String(item?.name ?? item?.title ?? item?.label ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const existingRole = String(item?.contentRole ?? item?.role ?? '').trim();

  if (INVENTORY_METADATA_RE.test(name)) {
    return {
      recordType: 'INVENTORY_METADATA',
      contentRole: 'inventory_metadata',
      commerceEligible: false,
    };
  }

  if (FLORIST_OCCASION_CATEGORY_RE.test(name)) {
    return {
      recordType: 'CATEGORY',
      contentRole: 'product_category',
      commerceEligible: false,
    };
  }

  if (
    existingRole === 'product' ||
    existingRole === 'service' ||
    existingRole === 'menu_item' ||
    existingRole === 'product_category' ||
    existingRole === 'service_category' ||
    existingRole === 'menu_category' ||
    existingRole === 'navigation' ||
    existingRole === 'inventory_metadata'
  ) {
    return {
      recordType: contentRoleToRecordType(existingRole),
      contentRole: existingRole,
      commerceEligible: isCommerceSellableRole(existingRole, context),
    };
  }

  const sourceMethod = String(item?.sourceMethod ?? item?.extractionMethod ?? '').toLowerCase();
  if (sourceMethod === 'commercial_nav_label' && name && !/\d/.test(name) && name.length <= 40) {
    const retailVertical = /\b(florist|flower|retail|gift|shop)\b/i.test(
      String(context.businessType ?? context.vertical ?? context.storeType ?? ''),
    );
    if (retailVertical || FLORIST_OCCASION_CATEGORY_RE.test(name)) {
      return {
        recordType: 'CATEGORY',
        contentRole: 'product_category',
        commerceEligible: false,
      };
    }
  }

  return {
    recordType: 'UNKNOWN',
    contentRole: existingRole || 'unknown',
    commerceEligible: false,
  };
}

/**
 * Stamp recordType + catalogEligible on classified rows.
 * @param {unknown[]} products
 * @param {Record<string, unknown>} [context]
 */
export function applyCatalogRecordClassification(products, context = {}) {
  if (!Array.isArray(products)) return [];
  return products.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const classified = classifyCatalogRecord(item, context);
    const role = item.contentRole || classified.contentRole;
    return {
      ...item,
      contentRole: role,
      recordType: classified.recordType,
      catalogEligible: classified.commerceEligible && isCommerceSellableRole(role, context),
    };
  });
}

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function isInternalGenerationPrompt(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 8) return false;
  if (INTERNAL_GENERATION_PROMPT_RE.test(s)) return true;
  if (/\b(create a store for|build a website for|build a store for|generate a store for)\b/i.test(s)) {
    return true;
  }
  if (/^(system|mission|performer)\s*:/i.test(s)) return true;
  return false;
}

/**
 * Safe category-specific starter about copy (no invented history/awards).
 * @param {{ storeName?: string, storeType?: string, location?: string }} opts
 */
export function buildSafeStarterAboutCopy(opts = {}) {
  const name = String(opts.storeName ?? 'This business').trim() || 'This business';
  const type = String(opts.storeType ?? '').toLowerCase();
  const location = String(opts.location ?? '').trim();
  const locBit = location ? ` in ${location}` : '';

  if (/\b(florist|flower|floral)\b/.test(type) || /\bflorist|flower\b/i.test(name)) {
    return `${name} brings flowers and thoughtful arrangements together for everyday moments and special occasions${locBit}.`;
  }
  if (/\b(cafe|coffee|restaurant|bakery|food)\b/.test(type)) {
    return `${name} serves carefully prepared food and drinks for locals and visitors${locBit}.`;
  }
  if (/\b(salon|spa|nail|beauty|barber)\b/.test(type)) {
    return `${name} offers personal care services with a focus on quality and comfort${locBit}.`;
  }
  return `${name} is here to serve customers with quality products and a clear, welcoming experience${locBit}.`;
}

/** @typedef {'EXACT'|'FROM'|'RANGE'|'REQUEST_QUOTE'|'UNKNOWN'|'FREE'} PriceStatus */

/**
 * @param {unknown} item
 * @returns {PriceStatus}
 */
export function resolvePriceStatus(item) {
  if (!item || typeof item !== 'object') return 'UNKNOWN';
  const explicit = String(item.priceStatus ?? item.pricingStatus ?? '')
    .trim()
    .toUpperCase();
  if (['EXACT', 'FROM', 'RANGE', 'REQUEST_QUOTE', 'UNKNOWN', 'FREE'].includes(explicit)) {
    return /** @type {PriceStatus} */ (explicit);
  }
  if (item.isFree === true || item.free === true) return 'FREE';
  if (item.executionAction === 'request_quote' || item.primaryAction === 'request_quote') {
    return 'REQUEST_QUOTE';
  }
  if (item.pricingModel === 'from_price' || item.fromPrice != null) return 'FROM';
  if (item.priceMin != null && item.priceMax != null) return 'RANGE';

  const raw = item.price ?? item.priceAmount ?? item.priceValue;
  if (raw === null || raw === undefined || raw === '') return 'UNKNOWN';
  const num = typeof raw === 'string' ? parseFloat(String(raw).replace(/[^\d.-]/g, '')) : Number(raw);
  if (!Number.isFinite(num) || num < 0) return 'UNKNOWN';
  if (num === 0) return 'UNKNOWN';
  return 'EXACT';
}

/**
 * Normalize numeric price for persistence/display. Never coerce missing → 0.
 * @param {unknown} item
 * @returns {{ amount: number|null, priceStatus: PriceStatus, display: string|null }}
 */
export function normalizeOfferingPrice(item) {
  const priceStatus = resolvePriceStatus(item);
  if (priceStatus === 'FREE') {
    return { amount: 0, priceStatus: 'FREE', display: 'Free' };
  }
  if (priceStatus === 'REQUEST_QUOTE' || priceStatus === 'UNKNOWN') {
    return {
      amount: null,
      priceStatus,
      display: priceStatus === 'REQUEST_QUOTE' ? 'Contact for price' : 'Price on request',
    };
  }
  const raw = item?.fromPrice ?? item?.price ?? item?.priceAmount ?? item?.priceValue;
  const num = typeof raw === 'string' ? parseFloat(String(raw).replace(/[^\d.-]/g, '')) : Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    return { amount: null, priceStatus: 'UNKNOWN', display: 'Price on request' };
  }
  return { amount: num, priceStatus, display: null };
}

/**
 * Resolve storefront CTA from offering type + transaction capability.
 * @param {object} item
 * @param {{ businessType?: string, commerceMode?: string, orderingEnabled?: boolean, schedulingEnabled?: boolean }} [ctx]
 */
export function resolveOfferingCta(item, ctx = {}) {
  const role = String(item?.contentRole ?? item?.type ?? item?.itemType ?? item?.kind ?? '').toLowerCase();
  const recordType = String(item?.recordType ?? '').toUpperCase();
  const isProduct =
    recordType === 'PRODUCT' ||
    role === 'product' ||
    role === 'menu_item' ||
    item?.itemType === 'product' ||
    item?.kind === 'product';
  const isService = recordType === 'SERVICE' || role === 'service' || item?.itemType === 'service';

  const biz = String(ctx.businessType ?? '').toLowerCase();
  const retailBiz = /\b(retail|florist|flowers?|floral|blooms?|bouquets?|shop|boutique|product)\b/.test(biz);
  const orderingEnabled =
    ctx.orderingEnabled === true ||
    item?.purchaseEnabled === true ||
    item?.executionAction === 'add_to_cart' ||
    ctx.commerceMode === 'order';
  const schedulingEnabled =
    ctx.schedulingEnabled === true ||
    item?.bookingEnabled === true ||
    item?.serviceMode === 'fixed_booking' ||
    ctx.commerceMode === 'booking';

  if (isProduct || (retailBiz && !isService)) {
    if (orderingEnabled) {
      return { executionAction: 'add_to_cart', primaryAction: 'add_to_cart', ctaLabel: 'Add to cart' };
    }
    return { executionAction: 'request_quote', primaryAction: 'enquire', ctaLabel: 'Enquire' };
  }
  if (isService && schedulingEnabled) {
    return { executionAction: 'book', primaryAction: 'book', ctaLabel: 'Book' };
  }
  if (isService) {
    return { executionAction: 'request_quote', primaryAction: 'enquire', ctaLabel: 'Enquire' };
  }
  return { executionAction: 'request_quote', primaryAction: 'enquire', ctaLabel: 'Enquire' };
}

/**
 * Build filter chips from category/collection records (not commerce items).
 * @param {unknown[]} products
 */
export function extractCategoryFilterChips(products) {
  if (!Array.isArray(products)) return [];
  const seen = new Set();
  /** @type {{ id: string, name: string, kind: string }[]} */
  const out = [];
  for (const p of products) {
    if (!p || typeof p !== 'object') continue;
    const role = String(p.contentRole ?? p.role ?? '').trim();
    const recordType = String(p.recordType ?? '').toUpperCase();
    const isCat =
      recordType === 'CATEGORY' ||
      recordType === 'COLLECTION' ||
      role === 'product_category' ||
      role === 'service_category' ||
      role === 'menu_category';
    if (!isCat) continue;
    const name = String(p.name ?? p.title ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name || INVENTORY_METADATA_RE.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `cat_filter_${out.length + 1}`, name, kind: 'filter' });
  }
  return out;
}
