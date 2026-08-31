/**
 * Research-backed catalog persistence: authoritative service items + BSL profile on drafts.
 */

import { businessProfileToLegacyCatalogProfile } from '../../lib/businessSemantic/index.js';
import {
  normalizeServiceCatalogItem,
  toServiceCatalogJson,
} from '../../lib/catalog/serviceCatalogNormalizer.js';
import { isDesignLibraryV1Enabled } from '../../lib/storefrontDesignLibrary/flags.js';
import {
  classifyResearchCatalogProducts,
  emitClassificationCompleted,
} from '../../lib/storefrontDesignLibrary/classification/classifyResearchCatalog.js';
import { applyDesignLibraryCommercePolicy } from '../../lib/storefrontDesignLibrary/policy/applyDesignLibraryCommercePolicy.js';
import { applyDesignLibraryBlueprintRecommendation } from '../../lib/storefrontDesignLibrary/scoring/recommendBlueprintsForDraft.js';
import { applyDesignLibraryStorefrontProjection } from '../../lib/storefrontDesignLibrary/projection/projectStorefrontForDraft.js';
import { applyDesignLibraryRenderShadow } from '../../lib/storefrontDesignLibrary/rendering/applyDesignLibraryRenderShadow.js';
import { isGroundedStoreCreationEnabled } from './groundedStoreCreation.js';
import { applyContentReadinessToCatalog } from './contentReadinessModel.js';
import {
  assertNoNonOfferingRolesInCatalog,
  emitStoreCreationAuthorityTrace,
  isNonOfferingContentRole,
  isOfferingContentRole,
  resolveItemContentRole,
  splitSourcedProductsByRole,
  syncCategoriesFromSourcedItems,
} from '../../lib/storeCreationResearch/canonicalSourcedBusinessContent.js';

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
  let products = Array.isArray(catalog.products)
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
  let next = {
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
  if (isGroundedStoreCreationEnabled()) {
    next = applyContentReadinessToCatalog(next);
  }
  return next;
}

/**
 * Label AI/template filler items as suggested (never sourced).
 * @param {object} catalog
 */
export function stampSuggestedCatalogOrigin(catalog) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  let products = Array.isArray(catalog.products)
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

  // Phase 2: additive semantic roles only (flagged; never authoritative for render).
  let classificationMeta = null;
  if (isDesignLibraryV1Enabled() && Array.isArray(products)) {
    const classified = classifyResearchCatalogProducts(products, { contentOrigin: 'suggested' });
    products = classified.products;
    classificationMeta = classified.summary;
  }

  let next = {
    ...catalog,
    products,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      catalogSource: catalog.meta?.catalogSource ?? 'generated',
      contentOrigin: 'suggested',
      aiGenerated: true,
      ...(classificationMeta
        ? { contentClassification: { classifierVersion: classificationMeta.classifierVersion, ...classificationMeta } }
        : {}),
    },
  };

  // Phase 3: advisory business-model + CTA policy (flagged; never live CTA authority).
  if (isDesignLibraryV1Enabled()) {
    const ctx = {
      businessType: catalog?.meta?.businessType ?? catalog?.profile?.type,
      businessProfile: catalog?.profile?.businessProfile ?? catalog?.meta?.businessProfile,
      phone: catalog?.profile?.phone ?? catalog?.meta?.phone,
      businessName: catalog?.profile?.name,
      preferredBlueprintId: catalog?.meta?.preferredBlueprintId,
      preferredPreviewSampleId: catalog?.meta?.preferredPreviewSampleId ?? catalog?.meta?.previewSampleId,
    };
    next = applyDesignLibraryCommercePolicy(next, ctx).catalog;
    // Phase 4: advisory blueprint scoring (never applies structure to public site).
    next = applyDesignLibraryBlueprintRecommendation(next, ctx).catalog;
    // Phase 5: advisory section projection (never cuts over React renderer).
    next = applyDesignLibraryStorefrontProjection(next, ctx).catalog;
    // Phase 6: shadow comparison (flagged separately; no public UI change).
    next = applyDesignLibraryRenderShadow(next, ctx).catalog;
  }

  if (isGroundedStoreCreationEnabled()) {
    next = applyContentReadinessToCatalog(next);
  }

  return next;
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
  const commercePrimary =
    opts.primaryAction ??
    businessProfile?.presentation?.primaryCTA ??
    opts.commercePrimaryAction ??
    null;
  const isQuoteBusiness =
    businessType === 'service_quote_required' ||
    businessType === 'service_quote' ||
    commercePrimary === 'request_quote' ||
    String(businessProfile?.commerceMode ?? '').toLowerCase() === 'quote';

  return (Array.isArray(products) ? products : []).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const name = String(item.name ?? item.title ?? '').trim();
    const sourceEvidence =
      item.sourceEvidence ??
      item.researchMeta?.sourceType ??
      item.sourceType ??
      'research';
    const contentRole = resolveItemContentRole(item);

    // Non-offering rows must never become bookable catalog services.
    if (item.contentRole && isNonOfferingContentRole(contentRole)) {
      return {
        ...item,
        name: name || item.name,
        title: name || item.title,
        contentRole,
        itemType: contentRole,
        type: contentRole,
        kind: contentRole,
        bookingEnabled: false,
        purchaseEnabled: false,
        primaryAction: null,
        executionAction: null,
        catalogEligible: false,
      };
    }

    const preferQuote =
      isQuoteBusiness ||
      item.serviceMode === 'quote_required' ||
      item.executionAction === 'request_quote' ||
      item.primaryAction === 'request_quote';
    const executionAction = preferQuote
      ? 'request_quote'
      : item.executionAction ?? (isQuoteBusiness ? 'request_quote' : 'book');
    const primaryAction = preferQuote ? 'request_quote' : executionAction === 'book' ? 'book' : executionAction;
    const serviceMode = preferQuote
      ? 'quote_required'
      : item.serviceMode ?? (isQuoteBusiness ? 'quote_required' : 'fixed_booking');

    const base = {
      ...item,
      name: name || item.name,
      title: name || item.title,
      itemType: contentRole === 'product' || contentRole === 'product_category' ? 'product' : 'service',
      type: contentRole === 'service_category' ? 'service_category' : contentRole === 'product' ? 'product' : 'service',
      kind: contentRole === 'product' || contentRole === 'product_category' ? 'product' : 'service',
      serviceMode,
      executionAction,
      primaryAction,
      bookingEnabled: !preferQuote && executionAction === 'book',
      purchaseEnabled: false,
      catalogSource: 'research',
      sourceEvidence,
      isService: contentRole === 'service' || contentRole === 'service_category' || contentRole === 'unknown',
      contentRole: item.contentRole ?? contentRole,
      catalogEligible: true,
    };

    const enriched = normalizeServiceCatalogItem(base, {
      businessType,
      businessName,
      itemType: base.itemType === 'product' ? 'product' : 'service',
    });

    return {
      ...base,
      ...enriched,
      // Preserve semantic role — normalizer must not flatten to generic service.
      contentRole: item.contentRole ?? base.contentRole,
      roleConfidence: item.roleConfidence,
      roleReason: item.roleReason,
      executionAction: preferQuote ? 'request_quote' : enriched.executionAction ?? executionAction,
      primaryAction: preferQuote ? 'request_quote' : primaryAction,
      bookingEnabled: preferQuote ? false : base.bookingEnabled,
      serviceMode: preferQuote ? 'quote_required' : enriched.serviceMode ?? serviceMode,
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

  // Phase 2: classify BEFORE enrich overwrites extract `type: service_category`.
  let productsForEnrich = catalog.products;
  let classificationMeta = null;
  if (isDesignLibraryV1Enabled()) {
    const classified = classifyResearchCatalogProducts(catalog.products, {
      businessType: bp?.businessType,
      businessName,
      contentOrigin: 'sourced',
    });
    productsForEnrich = classified.products;
    classificationMeta = classified.summary;
  }

  const products = enrichResearchCatalogProducts(productsForEnrich, {
    businessProfile: bp,
    businessType: bp?.businessType,
    businessName,
    primaryAction: bp?.presentation?.primaryCTA,
  });
  const pendingOwnerReview = isResearchCatalogPendingOwnerReview(research);

  const facts = research?.facts && typeof research.facts === 'object' ? research.facts : {};
  const split = splitSourcedProductsByRole(products, {
    facts,
    research,
    profile: catalog.profile,
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
    bypassLegacyCategoryNormalization: true,
    canonicalSourcedContent: {
      ...split.envelope,
      // Drop raw item payloads from meta (keep refs + offerings summary).
      offerings: split.envelope.offerings.map(({ _raw, ...rest }) => rest),
    },
    sourcedCatalogSplit: split.diagnostics,
    ...(classificationMeta
      ? {
          contentClassification: {
            classifierVersion: classificationMeta.classifierVersion,
            ...classificationMeta,
          },
        }
      : {}),
  };

  const stampedProducts = products.map((item) => {
    if (!item || typeof item !== 'object') return item;
    return {
      ...item,
      contentOrigin: item.contentOrigin === 'suggested' ? 'suggested' : 'sourced',
      needsOwnerReview: pendingOwnerReview || Boolean(item.needsOwnerReview),
      // Preserve Phase 2 classification through enrich/stamp
      contentRole: item.contentRole,
      roleConfidence: item.roleConfidence,
      roleReason: item.roleReason,
      roleClassifierVersion: item.roleClassifierVersion,
      roleEvidence: item.roleEvidence,
    };
  });

  if (classificationMeta) {
    emitClassificationCompleted({
      missionId: params.missionId ?? research?.missionId ?? null,
      draftStoreId: params.draftId ?? params.draftStoreId ?? null,
      summary: classificationMeta,
    });
  }

  // stampSourcedCatalogOrigin must not strip classification fields.
  const stamped = stampSourcedCatalogOrigin(
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

  // Avoid double-classification inside stampSuggested path; restore meta classification.
  if (classificationMeta && stamped?.meta) {
    stamped.meta.contentClassification = {
      classifierVersion: classificationMeta.classifierVersion,
      ...classificationMeta,
    };
  }

  // Phase 3–5: advisory commerce policy + blueprint scoring + section projection.
  // Projection runs on the FULL classified set (offerings + non-offerings).
  let next = stamped;
  if (isDesignLibraryV1Enabled()) {
    const ctx = {
      research,
      businessProfile: bp,
      businessType: bp?.businessType,
      businessName,
      phone: facts.phone ?? research?.phone ?? params.phone,
      bookingUrl: facts.bookingUrl ?? research?.bookingUrl ?? params.bookingUrl,
      bookingProvider: research?.bookingProvider ?? params.bookingProvider,
      deliveryUrl: facts.deliveryUrl,
      reservationUrl: facts.reservationUrl,
      sourcesUsed: research?.sourcesUsed,
      preferredBlueprintId: params.preferredBlueprintId ?? stamped?.meta?.preferredBlueprintId,
      preferredPreviewSampleId:
        params.preferredPreviewSampleId ??
        params.previewSampleId ??
        stamped?.meta?.preferredPreviewSampleId ??
        stamped?.meta?.previewSampleId,
      themeId: params.themeId ?? stamped?.meta?.themeId,
      facts,
    };
    const opts = {
      missionId: params.missionId ?? research?.missionId ?? null,
      draftStoreId: params.draftId ?? params.draftStoreId ?? null,
    };
    next = applyDesignLibraryCommercePolicy(stamped, ctx, opts).catalog;
    next = applyDesignLibraryBlueprintRecommendation(next, ctx, opts).catalog;
    next = applyDesignLibraryStorefrontProjection(next, ctx, opts).catalog;
    next = applyDesignLibraryRenderShadow(next, ctx, opts).catalog;
  }

  // Preserve full classified set for projection adapter lookups; mark non-offerings
  // ineligible for catalog/image generation. Sync categories so Other-flatten cannot run.
  if (next?.products && Array.isArray(next.products)) {
    next.products = next.products.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const role = resolveItemContentRole(item);
      if (item.contentRole && isNonOfferingContentRole(role)) {
        return {
          ...item,
          catalogEligible: false,
          skipCatalogImageGeneration: true,
          bookingEnabled: false,
          purchaseEnabled: false,
        };
      }
      return { ...item, catalogEligible: item.catalogEligible !== false };
    });
    // Keep a parallel offerings-only list for grounded media/QA authority.
    const offeringOnly = assertNoNonOfferingRolesInCatalog(
      next.products.filter((p) => p?.catalogEligible !== false && isOfferingContentRole(resolveItemContentRole(p))),
    );
    next.meta = {
      ...(next.meta && typeof next.meta === 'object' ? next.meta : {}),
      bypassLegacyCategoryNormalization: true,
      canonicalSourcedContent: next.meta?.canonicalSourcedContent ?? meta.canonicalSourcedContent,
      sourcedOfferingProductIds: offeringOnly.items.map((p) => p.id).filter(Boolean),
    };
    const catPreview = { items: next.products.filter((p) => p?.catalogEligible !== false), categories: next.categories };
    syncCategoriesFromSourcedItems(catPreview);
    next.categories = catPreview.categories;
    // Re-apply synced categoryIds onto matching products
    const byId = new Map(catPreview.items.map((p) => [p.id, p]));
    next.products = next.products.map((p) => {
      const synced = p?.id != null ? byId.get(p.id) : null;
      return synced ? { ...p, categoryId: synced.categoryId, category: synced.category, categoryName: synced.categoryName } : p;
    });
  }

  emitStoreCreationAuthorityTrace({
    missionId: params.missionId ?? research?.missionId ?? null,
    draftId: params.draftId ?? params.draftStoreId ?? null,
    discovery: {
      websiteResolved: Boolean(facts.website || research?.sourcesUsed?.length),
      sourceCount: Array.isArray(research?.sourcesUsed) ? research.sourcesUsed.length : 0,
      offeringCount: split.diagnostics.offeringCount,
      nonOfferingCount: split.diagnostics.nonOfferingCount,
    },
    truth: {
      canonicalEnvelopeBuilt: Boolean(next?.meta?.canonicalSourcedContent?.version),
      sourcedOfferingCount: split.diagnostics.offeringCount,
      testimonialCount: split.envelope.sections.testimonial?.length ?? 0,
      policyCount: split.envelope.sections.policy?.length ?? 0,
      careerCount: split.envelope.sections.career?.length ?? 0,
    },
    catalog: {
      authority: pendingOwnerReview ? 'sourced_pending_review' : 'sourced',
      suggestedCount: 0,
      fallbackReason: null,
    },
    projection: {
      blueprintId: next?.meta?.designLibraryBlueprintRecommendation?.selectedBlueprintId ?? null,
      sectionCount: next?.meta?.designLibraryStorefrontProjection?.sections?.length ?? null,
      primaryAction: next?.meta?.designLibraryCommercePolicy?.primaryAction ?? null,
    },
    renderer: {
      legacyNormalizerBypassed: true,
    },
  });

  return next;
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
  const commercePolicy = preview.meta?.designLibraryCommercePolicy;
  const policyPrimary = commercePolicy?.primaryAction ?? null;
  const isQuote =
    bp.businessType === 'service_quote_required' ||
    bp.businessType === 'service_quote' ||
    policyPrimary === 'request_quote' ||
    String(bp.presentation?.primaryCTA ?? '').toLowerCase().includes('quote');
  preview.commerceMode = isQuote
    ? 'quote'
    : bp.commerceMode ?? preview.commerceMode ?? 'booking';
  preview.transactionMode = isQuote ? 'quote' : 'booking';
  preview.ctaLabel = isQuote
    ? 'Request a quote'
    : preview.ctaLabel ?? legacy.ctaLabel ?? (policyPrimary === 'request_quote' ? 'Request a quote' : 'Book');
  if (isQuote) {
    preview.primaryCTA = 'Request a quote';
  }
  preview.meta = {
    ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
    catalogSource: 'research',
    businessType: bp.businessType,
    businessProfile: bp,
    catalogMode: preview.catalogMode,
    catalogLabel: preview.catalogLabel,
    primaryCTA: preview.primaryCTA,
    bypassLegacyCategoryNormalization: true,
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
