/**
 * Business Semantic Layer (BSL) — public API.
 * Single Source of Truth for business classification, capabilities, and presentation.
 */

export { BSL_VERSION, BUSINESS_TYPES, CAPABILITY_KEYS } from './types.js';

export { classifyBusinessSemantic } from './BusinessSemanticClassifier.js';
export {
  buildBusinessProfile,
  businessProfileToLegacyCatalogProfile,
} from './BusinessProfileBuilder.js';
export { resolveCapabilities, hasCapability } from './BusinessCapabilityResolver.js';
export {
  resolveExecutionModel,
  resolveCustomerJourney,
  resolvePrimaryIntent,
  resolveCommerceType,
  resolveCatalogMode,
  resolvePricingModel,
  resolveFulfillmentModel,
} from './BusinessJourneyResolver.js';
export { resolvePresentation, formatSectionTitle } from './BusinessPresentationResolver.js';
export { resolveRuntimeProfile, isRuntimeCapabilityEnabled } from './BusinessWorkflowResolver.js';
export {
  resolveGenerationProfile,
  resolvePerformerRecommendations,
  resolveDashboardWidgets,
} from './BusinessGenerationResolver.js';
export {
  extractBusinessProfile,
  attachBusinessProfileToStorefrontSettings,
  createAndPersistBusinessProfile,
  loadOrCreateBusinessProfile,
  profileHasCapability,
  isProfileStale,
} from './BusinessProfileRepository.js';

export {
  resolveStoreCommercePresentation,
  inferServiceSignalsFromItems,
  includedInServicesMarketplace,
  storeMatchesFeedCategory,
  logServicesMarketplaceResolve,
  filterBusinessesForFeedCategory,
} from './resolveStoreCommercePresentation.js';
import {
  extractBusinessProfile,
  loadOrCreateBusinessProfile,
  profileHasCapability,
} from './BusinessProfileRepository.js';
import { formatSectionTitle } from './BusinessPresentationResolver.js';
import { shouldOverrideStoredCatalogLabel } from '../catalog/classifyBusinessType.js';

/**
 * Unified presentation resolver for storefront UI.
 * @param {object} store
 * @param {object[]} [items]
 */
export function getBusinessCatalogPresentation(store, items = []) {
  const { profile } = loadOrCreateBusinessProfile(store, { items });
  const storedLabel = store?.catalogLabel ?? profile.presentation?.catalogLabel;
  const inferredLabel = profile.presentation.catalogLabel;
  const catalogLabel = shouldOverrideStoredCatalogLabel(storedLabel, inferredLabel)
    ? inferredLabel
    : String(storedLabel ?? inferredLabel).trim() || inferredLabel;

  const count = Array.isArray(items) ? items.length : 0;
  return {
    businessProfile: profile,
    businessType: profile.businessType,
    catalogMode: profile.catalogMode,
    catalogLabel,
    sectionTitle: formatSectionTitle({ catalogLabel }, count),
    primaryCTA: profile.presentation.primaryCTA,
    secondaryCTA: profile.presentation.secondaryCTA,
    capabilities: profile.capabilities,
    runtimeProfile: profile.runtimeProfile,
    showBookingControls: profile.runtimeProfile.bookingEnabled,
    showQuoteControls: profile.runtimeProfile.quotationEnabled,
    showCartControls: profile.runtimeProfile.orderingEnabled || profileHasCapability(profile, 'cart'),
    dashboardWidgets: profile.metadata?.dashboardWidgets ?? [],
    performerRecommendations: profile.metadata?.performerRecommendations ?? [],
    itemCardVariant:
      profile.businessType === 'product_retail'
        ? 'product'
        : profile.businessType === 'food_menu'
          ? 'menu'
          : profile.businessType === 'service_quote_required'
            ? 'quote_service'
            : profile.businessType === 'service_fixed_booking'
              ? 'fixed_service'
              : 'mixed',
  };
}

/**
 * Performer-facing business context.
 * @param {object} store
 */
export function getPerformerBusinessContext(store) {
  const { profile, recommendations } = loadOrCreateBusinessProfile(store);
  return {
    businessProfile: profile,
    recommendations: recommendations ?? profile.metadata?.performerRecommendations ?? [],
    capabilities: profile.capabilities,
    primaryIntent: profile.primaryIntent,
    executionModel: profile.executionModel,
  };
}

/**
 * Dashboard widget list from BusinessProfile.
 * @param {object} store
 */
export function getDashboardWidgetsForStore(store) {
  const { profile } = loadOrCreateBusinessProfile(store);
  return profile.metadata?.dashboardWidgets ?? [];
}
