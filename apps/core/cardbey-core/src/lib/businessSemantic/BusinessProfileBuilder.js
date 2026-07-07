/**
 * BusinessProfile builder — assembles canonical BusinessProfile from semantic classification.
 */

import { BSL_VERSION } from './types.js';
import { classifyBusinessSemantic } from './BusinessSemanticClassifier.js';
import { resolveCapabilities } from './BusinessCapabilityResolver.js';
import {
  resolveCatalogMode,
  resolveCommerceType,
  resolveCustomerJourney,
  resolveExecutionModel,
  resolveFulfillmentModel,
  resolvePricingModel,
  resolvePrimaryIntent,
} from './BusinessJourneyResolver.js';
import { resolvePresentation } from './BusinessPresentationResolver.js';
import { resolveRuntimeProfile } from './BusinessWorkflowResolver.js';
import {
  resolveDashboardWidgets,
  resolveGenerationProfile,
  resolvePerformerRecommendations,
} from './BusinessGenerationResolver.js';

/**
 * @param {import('./types.js').BusinessSemanticInput} input
 * @returns {import('./types.js').BusinessSemanticResult}
 */
export function buildBusinessProfile(input = {}) {
  const semantic = classifyBusinessSemantic(input);
  const { businessType, corpus, industry, subIndustry, suggestedSubcategories, confidence, reasoning } =
    semantic;

  const commerceType = resolveCommerceType(businessType);
  const executionModel = resolveExecutionModel(businessType);
  const catalogMode = resolveCatalogMode(businessType);
  const pricingModel = resolvePricingModel(businessType);
  const fulfillmentModel = resolveFulfillmentModel(businessType, corpus);
  const customerJourney = resolveCustomerJourney(businessType, executionModel);
  const primaryIntent = resolvePrimaryIntent(businessType);
  const capabilities = resolveCapabilities(businessType, corpus);
  const presentation = resolvePresentation(businessType, corpus);
  const runtimeProfile = resolveRuntimeProfile(capabilities);
  const generationProfile = resolveGenerationProfile(businessType, corpus, suggestedSubcategories);
  const performerRecommendations = resolvePerformerRecommendations(businessType, corpus);
  const dashboardWidgets = resolveDashboardWidgets(businessType);

  /** @type {import('./types.js').BusinessProfile} */
  const profile = {
    storeId: input.storeId ?? null,
    version: BSL_VERSION,
    businessType,
    industry,
    subIndustry: subIndustry ?? undefined,
    commerceType,
    executionModel,
    catalogMode,
    pricingModel,
    fulfillmentModel,
    customerJourney,
    primaryIntent,
    capabilities,
    presentation,
    runtimeProfile,
    generationProfile,
    metadata: {
      classifiedAt: new Date().toISOString(),
      confidence,
      reasoning,
      corpusLength: corpus?.length ?? 0,
      performerRecommendations,
      dashboardWidgets,
    },
  };

  return {
    profile,
    confidence,
    reasoning,
    recommendations: performerRecommendations,
  };
}

/**
 * Flat compatibility layer for legacy catalog generation consumers.
 * @param {import('./types.js').BusinessProfile} profile
 */
export function businessProfileToLegacyCatalogProfile(profile) {
  return {
    businessType: profile.businessType,
    confidence: profile.metadata?.confidence ?? 0.8,
    reasoning: profile.metadata?.reasoning ?? '',
    catalogLabel: profile.presentation.catalogLabel,
    catalogMode: profile.catalogMode,
    primaryCTA: profile.presentation.primaryCTA,
    ctaLabel: profile.presentation.primaryCTA,
    ctaAction: profile.runtimeProfile.quotationEnabled
      ? 'inquiry'
      : profile.runtimeProfile.bookingEnabled
        ? 'booking'
        : 'order',
    transactionMode: profile.runtimeProfile.bookingEnabled ? 'booking' : 'order',
    commerceMode: profile.runtimeProfile.quotationEnabled
      ? 'inquiry'
      : profile.runtimeProfile.bookingEnabled
        ? 'booking'
        : 'order',
    generatedContentProfile: profile.generationProfile.recommendedCatalog,
    defaultItemType:
      profile.businessType === 'product_retail'
        ? 'product'
        : profile.businessType === 'food_menu'
          ? 'menu_item'
          : 'service',
    defaultPricingMode: profile.pricingModel,
    suggestedSubcategories: profile.generationProfile.defaultCategories,
    categoryHints: profile.generationProfile.defaultCategories,
  };
}
