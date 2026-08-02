/**
 * Attach Phase 3 business-model + CTA policy metadata to a catalog.
 * Flag-gated; never authoritative for live CTA/render.
 */

import { isDesignLibraryV1Enabled, isDesignLibraryAuthoritative } from '../flags.js';
import { gatherCommerceEvidence } from './commerceEvidence.js';
import { inferBusinessModel, BUSINESS_MODEL_POLICY_VERSION } from './businessModelInference.js';
import { resolveCtaDecision, CTA_POLICY_VERSION } from './ctaDecisionPolicy.js';

/**
 * @typedef {{
 *   businessModel: import('./businessModelInference.js').BusinessModelInference,
 *   cta: import('./ctaDecisionPolicy.js').CtaDecision,
 *   evidenceSummary: {
 *     hasBookingProvider: boolean,
 *     hasBookingUrl: boolean,
 *     hasPricedPurchasableProduct: boolean,
 *     hasQuoteSignal: boolean,
 *     hasPhone: boolean,
 *   },
 * }} DesignLibraryCommercePolicy
 */

/**
 * @param {unknown[]} products
 * @param {Record<string, unknown>} [context]
 * @returns {DesignLibraryCommercePolicy}
 */
export function resolveDesignLibraryCommercePolicy(products, context = {}) {
  void isDesignLibraryAuthoritative(); // always false in Phase 3
  const evidence = gatherCommerceEvidence(products, context);
  const businessModel = inferBusinessModel(evidence);
  const cta = resolveCtaDecision(businessModel.businessModel, evidence);
  return Object.freeze({
    businessModel,
    cta,
    evidenceSummary: Object.freeze({
      hasBookingProvider: evidence.hasBookingProvider,
      hasBookingUrl: evidence.hasBookingUrl,
      hasPricedPurchasableProduct: evidence.hasPricedPurchasableProduct,
      hasQuoteSignal: evidence.hasQuoteSignal,
      hasPhone: evidence.hasPhone,
    }),
  });
}

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean, emit?: boolean, missionId?: string|null, draftStoreId?: string|null }} [opts]
 */
export function applyDesignLibraryCommercePolicy(catalog, context = {}, opts = {}) {
  if (!catalog || typeof catalog !== 'object') {
    return { catalog, policy: null, attached: false };
  }
  if (!opts.force && !isDesignLibraryV1Enabled()) {
    return { catalog, policy: null, attached: false };
  }

  const policy = resolveDesignLibraryCommercePolicy(catalog.products, {
    ...context,
    research: context.research,
    businessProfile: context.businessProfile ?? context.research?.businessProfile,
    businessType: context.businessType ?? context.businessProfile?.businessType,
    phone: context.phone,
    bookingUrl: context.bookingUrl,
    bookingProvider: context.bookingProvider,
    sourcesUsed: context.sourcesUsed ?? context.research?.sourcesUsed,
  });

  const next = {
    ...catalog,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      designLibraryCommercePolicy: {
        policyVersion: CTA_POLICY_VERSION,
        businessModelPolicyVersion: BUSINESS_MODEL_POLICY_VERSION,
        businessModel: policy.businessModel.businessModel,
        businessModelConfidence: policy.businessModel.confidence,
        businessModelReasons: policy.businessModel.reasons,
        primaryAction: policy.cta.primary.action,
        primaryLabel: policy.cta.primary.label,
        secondaryAction: policy.cta.secondary?.action ?? null,
        secondaryLabel: policy.cta.secondary?.label ?? null,
        ctaReasons: policy.cta.reasons,
        evidenceSummary: policy.evidenceSummary,
        // Explicit: advisory only — live storefront still uses resolveStoreCommerce
        authoritative: false,
      },
    },
  };

  if (opts.emit !== false) {
    emitCommercePolicyCompleted({
      missionId: opts.missionId ?? null,
      draftStoreId: opts.draftStoreId ?? null,
      policy,
    });
  }

  return { catalog: next, policy, attached: true };
}

/**
 * @param {{
 *   missionId?: string|null,
 *   draftStoreId?: string|null,
 *   policy: DesignLibraryCommercePolicy,
 * }} payload
 */
export function emitCommercePolicyCompleted(payload) {
  const { policy } = payload;
  const event = {
    event: 'storefront.commerce_policy.completed',
    missionId: payload.missionId ?? null,
    draftStoreId: payload.draftStoreId ?? null,
    businessModel: policy.businessModel.businessModel,
    businessModelConfidence: policy.businessModel.confidence,
    primaryAction: policy.cta.primary.action,
    secondaryAction: policy.cta.secondary?.action ?? null,
    policyVersion: CTA_POLICY_VERSION,
  };
  if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
    try {
      console.info('[storefrontDesignLibrary]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
  return event;
}
