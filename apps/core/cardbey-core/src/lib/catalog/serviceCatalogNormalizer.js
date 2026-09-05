/**
 * Service catalog normalizer — infers serviceMode, pricing, and executionAction
 * for catalog items. Safe runtime backfill for legacy product-style service rows.
 */

import { isRetailBusiness, isServiceBusinessContext } from './catalogItemClassification.js';
import {
  EXECUTION_ACTIONS,
  PRICING_MODELS,
  PRICE_UNITS,
  SERVICE_MODES,
} from './serviceCatalogTypes.js';

const FIXED_BOOKING_RE =
  /\b(haircut|hair cut|manicure|pedicure|nail|massage|facial|wax|brow|lash|cleaning package|car wash|inspection fee|site measurement|on-?site measurement|consultation fee|express service|standard service|call-?out fee|trim|blowdry|blow dry|spa treatment|gel nails|acrylic)\b/i;

const QUOTE_REQUIRED_RE =
  /\b(til(e|ing)|floor(ing)?|renovation|plumb(ing|er)?|electric(ian|al)?|paint(ing|er)?|construct(ion|or)?|bathroom|kitchen splashback|splashback|waterproof(ing)?|signage|web\s*design|website|bespoke|custom quote|custom project|roof(ing)?|landscap(e|ing)|deck(ing)?|extension|remodel|refurbish)\b/i;

const MEASUREMENT_FIXED_RE = /\b(on-?site measurement|site measurement|inspection fee|call-?out fee)\b/i;

const GENERIC_SERVICE_NAME_RE =
  /\b(standard service|premium service|custom quote|core service|starter package|business package|service \d+|product \d+)\b/i;

/**
 * @param {string | null | undefined} raw
 * @returns {import('./serviceCatalogTypes.js').ServiceMode | null}
 */
export function normalizeServiceMode(raw) {
  const k = String(raw ?? '').toLowerCase().trim().replace(/-/g, '_');
  if (k === 'fixed_booking' || k === 'fixed' || k === 'bookable') return 'fixed_booking';
  if (k === 'quote_required' || k === 'quote' || k === 'enquiry' || k === 'inquiry') return 'quote_required';
  return SERVICE_MODES.includes(k) ? /** @type {import('./serviceCatalogTypes.js').ServiceMode} */ (k) : null;
}

/**
 * @param {string | null | undefined} raw
 */
export function normalizePricingModel(raw) {
  const k = String(raw ?? '').toLowerCase().trim().replace(/-/g, '_');
  if (k === 'from' || k === 'from_price' || k === 'starting') return 'from_price';
  return PRICING_MODELS.includes(k) ? k : null;
}

/**
 * @param {string | null | undefined} raw
 */
export function normalizePriceUnit(raw) {
  const k = String(raw ?? '').toLowerCase().trim();
  if (k === 'm²' || k === 'm2' || k === 'sqm' || k === 'per_m2') return 'm2';
  if (k === 'hr' || k === 'hour' || k === 'per_hour') return 'hour';
  if (k === 'day' || k === 'per_day') return 'day';
  if (k === 'project' || k === 'per_project') return 'project';
  return PRICE_UNITS.includes(k) ? k : null;
}

/**
 * @param {string | null | undefined} raw
 */
export function normalizeExecutionAction(raw) {
  const k = String(raw ?? '').toLowerCase().trim().replace(/-/g, '_');
  if (k === 'enquire' || k === 'inquiry') return 'request_quote';
  if (k === 'add_to_cart' || k === 'cart') return 'add_to_cart';
  return EXECUTION_ACTIONS.includes(k) ? k : null;
}

/**
 * Infer service mode from item title, category, tags, and business context.
 * @param {object | null | undefined} item
 * @param {{ businessType?: string | null, businessName?: string | null, storeName?: string | null }} [ctx]
 * @returns {import('./serviceCatalogTypes.js').ServiceMode | null}
 */
export function inferServiceMode(item, ctx = {}) {
  const itemCorpus = [
    item?.name,
    item?.title,
    item?.description,
    item?.category,
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ]
    .filter(Boolean)
    .join(' ');

  const businessCorpus = [ctx.businessType, ctx.businessName, ctx.storeName].filter(Boolean).join(' ');

  const explicit = normalizeServiceMode(item?.serviceMode ?? item?.serviceCatalog?.serviceMode);
  if (explicit) return explicit;

  if (MEASUREMENT_FIXED_RE.test(itemCorpus) && !QUOTE_REQUIRED_RE.test(String(item?.name ?? ''))) {
    return 'fixed_booking';
  }
  if (GENERIC_SERVICE_NAME_RE.test(itemCorpus) && QUOTE_REQUIRED_RE.test(businessCorpus)) {
    return 'quote_required';
  }
  if (FIXED_BOOKING_RE.test(itemCorpus)) return 'fixed_booking';
  if (QUOTE_REQUIRED_RE.test(itemCorpus)) return 'quote_required';
  if (QUOTE_REQUIRED_RE.test(businessCorpus)) return 'quote_required';
  if (FIXED_BOOKING_RE.test(businessCorpus)) return 'fixed_booking';

  const serviceBusiness = isServiceBusinessContext({
    type: ctx.businessType,
    name: ctx.businessName,
    storeName: ctx.storeName,
  });
  if (!serviceBusiness) return null;

  // Retail / florist context must never default to fixed_booking → Book CTA
  if (isRetailBusiness(ctx.businessType) || /\b(florist|flower|floral|retail|boutique)\b/i.test(
    `${ctx.businessType ?? ''} ${ctx.businessName ?? ''} ${ctx.storeName ?? ''}`,
  )) {
    return null;
  }

  if (item?.bookingEnabled === true || item?.primaryAction === 'book') return 'fixed_booking';
  if (item?.primaryAction === 'enquire' || item?.purchaseEnabled === false) return 'quote_required';

  return 'fixed_booking';
}

/**
 * @param {import('./serviceCatalogTypes.js').ServiceMode | null} serviceMode
 * @param {object | null | undefined} item
 */
export function inferPricingModel(serviceMode, item) {
  const explicit = normalizePricingModel(item?.pricingModel ?? item?.serviceCatalog?.pricingModel);
  if (explicit) return explicit;
  if (serviceMode === 'quote_required') {
    const price = item?.fromPrice ?? item?.price ?? item?.serviceCatalog?.fromPrice;
    return price != null && Number(price) > 0 ? 'from_price' : 'custom';
  }
  if (serviceMode === 'fixed_booking') return 'fixed';
  return null;
}

/**
 * @param {'product' | 'service' | string | null | undefined} itemType
 * @param {import('./serviceCatalogTypes.js').ServiceMode | null} serviceMode
 */
export function resolveExecutionAction(itemType, serviceMode) {
  if (itemType === 'product' || itemType === 'products') return 'add_to_cart';
  if (serviceMode === 'fixed_booking') return 'book';
  if (serviceMode === 'quote_required') return 'request_quote';
  return 'contact';
}

/**
 * Map executionAction to legacy primaryAction column.
 * @param {import('./serviceCatalogTypes.js').ExecutionAction} executionAction
 */
export function executionActionToPrimaryAction(executionAction) {
  if (executionAction === 'add_to_cart') return 'add_to_cart';
  if (executionAction === 'book') return 'book';
  return 'enquire';
}

/**
 * Normalize a catalog item with service catalog fields (runtime backfill).
 * @param {object | null | undefined} item
 * @param {{ businessType?: string | null, businessName?: string | null, storeName?: string | null, itemType?: string | null }} ctx
 */
export function normalizeServiceCatalogItem(item, ctx = {}) {
  const canonicalBusinessType = ctx.canonicalBusinessType ?? ctx.bslBusinessType ?? null;
  let itemType =
    ctx.itemType ??
    (String(item?.itemType ?? item?.type ?? item?.kind ?? '').toLowerCase() === 'product'
      ? 'product'
      : String(item?.itemType ?? item?.type ?? item?.kind ?? '').toLowerCase() === 'service'
        ? 'service'
        : null);

  const itemCorpus = [item?.name, item?.title, item?.category, item?.description].filter(Boolean).join(' ');
  const clearlyRetailMerchandise = /\b(merchandise|accessor|gift\s*card|voucher|shop\s*item|supply\s*only)\b/i.test(
    itemCorpus,
  );
  if (
    itemType === 'product' &&
    !clearlyRetailMerchandise &&
    (canonicalBusinessType === 'service_quote_required' ||
      canonicalBusinessType === 'service_fixed_booking' ||
      (canonicalBusinessType === 'hybrid' &&
        /\b(install|tiling|tile|floor|repair|renovation|waterproof|service)\b/i.test(itemCorpus)))
  ) {
    itemType = 'service';
  }

  const stored = item?.serviceCatalog && typeof item.serviceCatalog === 'object' ? item.serviceCatalog : {};
  let serviceMode =
    itemType === 'product'
      ? null
      : normalizeServiceMode(stored.serviceMode) ?? inferServiceMode(item, ctx);

  if (itemType === 'service' && !serviceMode) {
    if (canonicalBusinessType === 'service_quote_required') serviceMode = 'quote_required';
    else if (canonicalBusinessType === 'service_fixed_booking') serviceMode = 'fixed_booking';
  }

  const pricingModel = inferPricingModel(serviceMode, { ...item, ...stored });
  const priceUnit = normalizePriceUnit(stored.priceUnit ?? item?.priceUnit);

  let price = item?.price ?? stored.price ?? null;
  let fromPrice = stored.fromPrice ?? item?.fromPrice ?? null;

  if (serviceMode === 'quote_required') {
    if (fromPrice == null && price != null && Number(price) > 0) {
      fromPrice = price;
      price = null;
    }
    if (pricingModel === 'custom' && (fromPrice == null || Number(fromPrice) <= 0)) {
      price = null;
      fromPrice = null;
    }
  }

  const durationMinutes =
    stored.durationMinutes ??
    item?.durationMinutes ??
    item?.durationMins ??
    item?.durationMin ??
    null;

  const estimateDurationLabel = stored.estimateDurationLabel ?? item?.estimateDurationLabel ?? null;

  const executionAction =
    normalizeExecutionAction(stored.executionAction ?? item?.executionAction) ??
    resolveExecutionAction(itemType, serviceMode);

  return {
    type: itemType === 'product' ? 'product' : 'service',
    serviceMode: serviceMode ?? undefined,
    pricingModel: pricingModel ?? undefined,
    price: price != null ? Number(price) : undefined,
    fromPrice: fromPrice != null ? Number(fromPrice) : undefined,
    priceUnit: priceUnit ?? undefined,
    durationMinutes: durationMinutes != null ? Number(durationMinutes) : undefined,
    estimateDurationLabel: estimateDurationLabel ?? undefined,
    executionAction,
  };
}

/**
 * Persistable serviceCatalog JSON blob for Product.serviceCatalog column.
 * @param {ReturnType<typeof normalizeServiceCatalogItem>} normalized
 */
export function toServiceCatalogJson(normalized) {
  if (!normalized || normalized.type === 'product') return null;
  return {
    serviceMode: normalized.serviceMode ?? null,
    pricingModel: normalized.pricingModel ?? null,
    fromPrice: normalized.fromPrice ?? null,
    priceUnit: normalized.priceUnit ?? null,
    durationMinutes: normalized.durationMinutes ?? null,
    estimateDurationLabel: normalized.estimateDurationLabel ?? null,
    executionAction: normalized.executionAction ?? null,
  };
}

/**
 * Enrich public catalog DTO with service catalog fields.
 * @param {object} product
 * @param {{ businessType?: string | null, businessName?: string | null }} ctx
 */
export function enrichPublicServiceCatalogItem(product, ctx = {}) {
  const itemType = product?.itemType ?? (product?.kind === 'product' ? 'product' : 'service');
  const normalized = normalizeServiceCatalogItem(
    { ...product, serviceCatalog: product?.serviceCatalog },
    { ...ctx, itemType },
  );

  const primaryAction = executionActionToPrimaryAction(normalized.executionAction);
  const bookingEnabled = normalized.executionAction === 'book';
  const purchaseEnabled = normalized.executionAction === 'add_to_cart';

  return {
    ...product,
    type: normalized.type,
    itemType: normalized.type === 'product' ? 'product' : itemType === 'package' ? 'package' : 'service',
    serviceMode: normalized.serviceMode,
    pricingModel: normalized.pricingModel,
    price: normalized.price ?? (normalized.serviceMode === 'fixed_booking' ? product?.price ?? null : null),
    fromPrice: normalized.fromPrice,
    priceUnit: normalized.priceUnit,
    durationMinutes: normalized.durationMinutes,
    estimateDurationLabel: normalized.estimateDurationLabel,
    executionAction: normalized.executionAction,
    primaryAction: product?.primaryAction ?? primaryAction,
    bookingEnabled: product?.bookingEnabled ?? bookingEnabled,
    purchaseEnabled: product?.purchaseEnabled ?? purchaseEnabled,
  };
}

/**
 * Runtime migration helper — logs inferred upgrades for service businesses.
 * @param {object[]} items
 * @param {{ businessType?: string | null, businessName?: string | null, storeId?: string }} ctx
 */
export function migrateServiceCatalogItems(items, ctx = {}) {
  if (!Array.isArray(items) || items.length === 0) return { items: [], upgraded: 0 };

  let upgraded = 0;
  const enriched = items.map((item) => {
    const before = item?.serviceMode ?? item?.executionAction ?? item?.primaryAction;
    const next = enrichPublicServiceCatalogItem(item, ctx);
    const after = next.serviceMode ?? next.executionAction ?? next.primaryAction;
    if (before !== after && (next.type === 'service' || isServiceBusinessContext(ctx))) {
      upgraded += 1;
      console.log(
        '[SERVICE_CATALOG_MIGRATE]',
        JSON.stringify({
          storeId: ctx.storeId ?? null,
          itemId: item?.id ?? null,
          name: item?.name ?? item?.title ?? null,
          before,
          after: { serviceMode: next.serviceMode, executionAction: next.executionAction },
        }),
      );
    }
    return next;
  });

  return { items: enriched, upgraded };
}
