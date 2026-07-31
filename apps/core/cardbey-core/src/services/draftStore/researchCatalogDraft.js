/**
 * Research-backed catalog persistence: authoritative service items + BSL profile on drafts.
 */

import { businessProfileToLegacyCatalogProfile } from '../../lib/businessSemantic/index.js';
import {
  normalizeServiceCatalogItem,
  toServiceCatalogJson,
} from '../../lib/catalog/serviceCatalogNormalizer.js';

export function isResearchCatalogSource(meta) {
  return meta?.catalogSource === 'research';
}

export function isResearchBackedPreview(preview) {
  return isResearchCatalogSource(preview?.meta);
}

/**
 * Research extracted real catalog data but owner has not confirmed yet.
 * @param {import('../../lib/storeCreationResearch/types.js').BusinessResearchResult | null | undefined} research
 */
export function isResearchCatalogPendingOwnerReview(research) {
  if (!research || research.fallbackToGenerated) return false;
  if (research.ownerConfirmed === true) return false;
  return Boolean(research.ownerReviewRequired);
}

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Phase 2A: stage sourced catalog on draft while owner review is pending.
 * Default on in non-production; off in production until soak
 * (`PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW`).
 */
export function isStageSourcedCatalogPendingReviewEnabled() {
  if (process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW !== undefined) {
    return envTruthy('PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW', false);
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * @param {import('../../lib/storeCreationResearch/types.js').BusinessResearchResult | null | undefined} research
 */
export function researchHasCatalogItems(research) {
  if (!research) return false;
  if (Array.isArray(research.catalog?.products) && research.catalog.products.length > 0) return true;
  if (Array.isArray(research.extractedItems) && research.extractedItems.length > 0) return true;
  const facts = research.facts;
  if (!facts || typeof facts !== 'object') return false;
  for (const key of ['services', 'menuItems', 'products']) {
    if (Array.isArray(facts[key]) && facts[key].length > 0) return true;
  }
  return false;
}

/**
 * Stage sourced research catalog into draft while awaiting owner confirmation.
 * @param {import('../../lib/storeCreationResearch/types.js').BusinessResearchResult | null | undefined} research
 */
export function shouldStageResearchCatalogPendingReview(research) {
  if (!isStageSourcedCatalogPendingReviewEnabled()) return false;
  if (!research?.researchRan || research.fallbackToGenerated) return false;
  if (!isResearchCatalogPendingOwnerReview(research)) return false;
  return researchHasCatalogItems(research);
}

/**
 * Whether sourced research catalog may be written into the draft preview.
 * When staging is enabled, pending-review catalogs with items are applied
 * (labelled sourced + needsOwnerReview); otherwise pending review blocks apply.
 * @param {import('../../lib/storeCreationResearch/types.js').BusinessResearchResult | null | undefined} research
 */
export function shouldApplyResearchCatalogToDraft(research) {
  if (!research?.researchRan || research.fallbackToGenerated) return false;
  if (isResearchCatalogPendingOwnerReview(research)) {
    return shouldStageResearchCatalogPendingReview(research);
  }
  return true;
}

/**
 * Stamp research products as sourced; mark pending owner review when applicable.
 * @param {object} catalog
 * @param {{ pendingOwnerReview?: boolean }} [opts]
 */
export function stampSourcedCatalogOrigin(catalog, opts = {}) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  const pending = Boolean(opts.pendingOwnerReview);
  const products = Array.isArray(catalog.products)
    ? catalog.products.map((item) => {
        if (!item || typeof item !== 'object') return item;
        return {
          ...item,
          contentOrigin: item.contentOrigin === 'suggested' ? 'suggested' : 'sourced',
          needsOwnerReview: pending || Boolean(item.needsOwnerReview),
          catalogSource: item.catalogSource ?? 'research',
        };
      })
    : catalog.products;
  return {
    ...catalog,
    products,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      catalogSource: 'research',
      contentOrigin: 'sourced',
      aiGenerated: false,
      pendingOwnerReview: pending,
      needsOwnerReview: pending,
    },
  };
}

/**
 * Label AI/template filler items as suggested (never sourced).
 * @param {object} catalog
 */
export function stampSuggestedCatalogOrigin(catalog) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  const products = Array.isArray(catalog.products)
    ? catalog.products.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const explicitPrice =
          item.priceWasNotExplicitlyProvided === false ||
          item.priceOrigin === 'sourced' ||
          item.priceSource === 'sourced';
        const next = {
          ...item,
          contentOrigin: 'suggested',
          status: item.status ?? 'suggested',
          catalogSource: item.catalogSource ?? 'generated',
        };
        // Hard invariant: never invent purchasable prices for suggested items.
        if (!explicitPrice) {
          next.priceWasNotExplicitlyProvided = true;
          next.price = null;
          if (next.priceMin != null) next.priceMin = null;
          if (next.priceMax != null) next.priceMax = null;
          if (next.amount != null) next.amount = null;
          next.pricingMode = next.pricingMode ?? 'quote';
          next.ctaLabel = next.ctaLabel ?? 'Request a quote';
        }
        return next;
      })
    : catalog.products;
  return {
    ...catalog,
    products,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      catalogSource: catalog.meta?.catalogSource ?? 'generated',
      contentOrigin: 'suggested',
      aiGenerated: true,
    },
  };
}

/**
 * Re-run BSL from research; overwrite pre-research classification when research confidence is higher.
 * @param {object} params
 * @param {import('../../lib/storeCreationResearch/types.js').BusinessResearchResult | null | undefined} research
 * @param {{ profile?: object, meta?: object } | null | undefined} catalog
 */
export function mergeResearchBusinessProfileIntoParams(params, research, catalog) {
  const bp = research?.businessProfile ?? catalog?.profile?.businessProfile ?? null;
  if (!bp) return { ...params };

  const researchConfidence = Number(research?.confidence ?? catalog?.meta?.researchConfidence ?? 0);
  const existingConfidence = Number(params?.bslConfidence ?? params?.classificationConfidence ?? 0);
  const existingType = params?.canonicalBusinessType ?? params?.businessType ?? null;

  if (existingType && existingConfidence > researchConfidence) {
    return { ...params };
  }

  const legacy = businessProfileToLegacyCatalogProfile(bp);
  return {
    ...params,
    canonicalBusinessType: bp.businessType ?? params.canonicalBusinessType,
    catalogMode: bp.catalogMode ?? legacy.catalogMode ?? params.catalogMode,
    catalogLabel: bp.presentation?.catalogLabel ?? legacy.catalogLabel ?? params.catalogLabel,
    primaryCTA: bp.presentation?.primaryCTA ?? legacy.primaryCTA ?? params.primaryCTA,
    businessProfile: bp,
    catalogGenerationProfile: legacy,
    bslConfidence: researchConfidence,
    businessType: bp.businessType ?? params.businessType,
  };
}

/**
 * Stamp canonical service fields on research catalog items; preserve real names.
 * @param {object[]} products
 * @param {{ businessProfile?: object, businessType?: string, businessName?: string }} [opts]
 */
export function enrichResearchCatalogProducts(products, opts = {}) {
  const businessProfile = opts.businessProfile ?? null;
  const businessType = businessProfile?.businessType ?? opts.businessType ?? 'service_fixed_booking';
  const businessName = opts.businessName ?? '';

  return (Array.isArray(products) ? products : []).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const name = String(item.name ?? item.title ?? '').trim();
    const sourceEvidence =
      item.sourceEvidence ??
      item.researchMeta?.sourceType ??
      item.sourceType ??
      'research';

    const base = {
      ...item,
      name: name || item.name,
      title: name || item.title,
      itemType: 'service',
      type: 'service',
      kind: 'service',
      serviceMode: item.serviceMode ?? 'fixed_booking',
      executionAction: item.executionAction ?? 'book',
      primaryAction: 'book',
      bookingEnabled: true,
      purchaseEnabled: false,
      catalogSource: 'research',
      sourceEvidence,
      isService: true,
    };

    const enriched = normalizeServiceCatalogItem(base, {
      businessType,
      businessName,
      itemType: 'service',
    });

    return {
      ...base,
      ...enriched,
      serviceCatalog: item.serviceCatalog ?? toServiceCatalogJson(enriched),
    };
  });
}

/**
 * Finalize research catalog before draft save: enrich items + meta + profile.
 * @param {object} catalog
 * @param {import('../../lib/storeCreationResearch/types.js').BusinessResearchResult | null | undefined} research
 * @param {{ businessName?: string }} [params]
 */
export function finalizeResearchCatalogForDraft(catalog, research, params = {}) {
  if (!catalog) return catalog;

  const bp = research?.businessProfile ?? catalog.profile?.businessProfile ?? null;
  const businessName = params.businessName ?? catalog.profile?.name ?? '';
  const products = enrichResearchCatalogProducts(catalog.products, {
    businessProfile: bp,
    businessType: bp?.businessType,
    businessName,
  });
  const pendingOwnerReview = isResearchCatalogPendingOwnerReview(research);

  const meta = {
    ...(catalog.meta ?? {}),
    catalogSource: 'research',
    contentOrigin: 'sourced',
    researchConfidence: research?.confidence ?? catalog.meta?.researchConfidence,
    aiGenerated: false,
    businessProfile: bp ?? catalog.meta?.businessProfile ?? null,
    catalogMode: bp?.catalogMode ?? catalog.meta?.catalogMode,
    catalogLabel: bp?.presentation?.catalogLabel ?? catalog.meta?.catalogLabel,
    primaryCTA: bp?.presentation?.primaryCTA ?? catalog.meta?.primaryCTA,
    businessType: bp?.businessType ?? catalog.meta?.businessType,
    pendingOwnerReview,
    needsOwnerReview: pendingOwnerReview,
  };

  const stampedProducts = products.map((item) => {
    if (!item || typeof item !== 'object') return item;
    return {
      ...item,
      contentOrigin: item.contentOrigin === 'suggested' ? 'suggested' : 'sourced',
      needsOwnerReview: pendingOwnerReview || Boolean(item.needsOwnerReview),
    };
  });

  return stampSourcedCatalogOrigin(
    {
      ...catalog,
      products: stampedProducts,
      profile: {
        ...(catalog.profile ?? {}),
        name: catalog.profile?.name ?? businessName,
        type: bp?.businessType ?? catalog.profile?.type,
        businessProfile: bp ?? catalog.profile?.businessProfile,
      },
      meta,
    },
    { pendingOwnerReview },
  );
}

/**
 * Apply research BSL profile to preview without reclassifying items as retail products.
 * @param {object} preview
 */
export function applyResearchProfileToPreview(preview) {
  if (!preview || typeof preview !== 'object') return preview;
  const bp = preview.meta?.businessProfile ?? preview.businessProfile;
  if (!bp) return preview;

  const legacy = businessProfileToLegacyCatalogProfile(bp);
  preview.businessType = bp.businessType;
  preview.canonicalBusinessType = bp.businessType;
  preview.catalogMode = bp.catalogMode ?? preview.catalogMode ?? legacy.catalogMode;
  preview.catalogLabel =
    bp.presentation?.catalogLabel ?? preview.catalogLabel ?? legacy.catalogLabel;
  preview.primaryCTA = bp.presentation?.primaryCTA ?? preview.primaryCTA ?? legacy.primaryCTA;
  preview.businessProfile = bp;
  preview.generatedContentProfile = legacy.generatedContentProfile;
  preview.commerceMode = bp.commerceMode ?? preview.commerceMode ?? 'booking';
  preview.transactionMode = 'booking';
  preview.ctaLabel = preview.ctaLabel ?? legacy.ctaLabel ?? 'Book';
  preview.meta = {
    ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
    catalogSource: 'research',
    businessType: bp.businessType,
    businessProfile: bp,
    catalogMode: preview.catalogMode,
    catalogLabel: preview.catalogLabel,
    primaryCTA: preview.primaryCTA,
  };
  preview.storefrontSettings = {
    ...(preview.storefrontSettings && typeof preview.storefrontSettings === 'object'
      ? preview.storefrontSettings
      : {}),
    businessProfile: bp,
  };
  if (preview.storeType == null || preview.storeType === 'product_retail') {
    preview.storeType = bp.businessType;
  }

  if (Array.isArray(preview.items)) {
    preview.items = enrichResearchCatalogProducts(preview.items, {
      businessProfile: bp,
      businessName: preview.storeName ?? preview.name,
    });
  }

  const sf = preview.storefront && typeof preview.storefront === 'object' ? { ...preview.storefront } : {};
  if (!sf.cta || !(String(sf.cta.label || '').trim() || String(sf.cta.action || '').trim())) {
    preview.storefront = {
      ...sf,
      cta: { label: preview.ctaLabel ?? 'Book', action: 'book' },
    };
  }

  return preview;
}
