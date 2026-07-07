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

  const meta = {
    ...(catalog.meta ?? {}),
    catalogSource: 'research',
    researchConfidence: research?.confidence ?? catalog.meta?.researchConfidence,
    aiGenerated: false,
    businessProfile: bp ?? catalog.meta?.businessProfile ?? null,
    catalogMode: bp?.catalogMode ?? catalog.meta?.catalogMode,
    catalogLabel: bp?.presentation?.catalogLabel ?? catalog.meta?.catalogLabel,
    primaryCTA: bp?.presentation?.primaryCTA ?? catalog.meta?.primaryCTA,
    businessType: bp?.businessType ?? catalog.meta?.businessType,
  };

  return {
    ...catalog,
    products,
    profile: {
      ...(catalog.profile ?? {}),
      name: catalog.profile?.name ?? businessName,
      type: bp?.businessType ?? catalog.profile?.type,
      businessProfile: bp ?? catalog.profile?.businessProfile,
    },
    meta,
  };
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
