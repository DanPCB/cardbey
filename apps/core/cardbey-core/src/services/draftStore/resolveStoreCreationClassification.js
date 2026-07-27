/**
 * Store creation classification entry point — runs before catalog generation.
 * Uses Business Semantic Layer (BSL) as SSOT.
 */

import { buildCatalogGenerationProfile } from '../../lib/catalog/buildCatalogGenerationProfile.js';
import { createAndPersistBusinessProfile } from '../../lib/businessSemantic/index.js';

/**
 * @param {object} input - draft.input or generation params source
 */
export function resolveStoreCreationClassification(input = {}) {
  const bslResult = createAndPersistBusinessProfile(
    {
      storeId: input.storeId ?? null,
      businessName: input.businessName ?? input.storeName,
      storeName: input.storeName ?? input.businessName,
      category: input.category ?? input.businessCategory,
      businessType: input.businessType ?? input.storeType ?? input.vertical,
      storeType: input.storeType ?? input.businessType,
      description: input.description ?? input.storeDescription,
      prompt: input.prompt ?? input.userPrompt,
      userPrompt: input.userPrompt ?? input.prompt,
      documentText: input.documentText ?? input.ocrRawText ?? input.cardText,
      location: input.location,
      detectedServices: input.detectedServices,
      detectedProducts: input.detectedProducts,
      items: input.items ?? input.preloadedCatalogItems,
    },
    { existingSettings: input.storefrontSettings },
  );

  const profile = buildCatalogGenerationProfile({
    businessName: input.businessName ?? input.storeName,
    storeName: input.storeName ?? input.businessName,
    category: input.category ?? input.businessCategory,
    businessType: input.businessType ?? input.storeType ?? input.vertical,
    storeType: input.storeType ?? input.businessType,
    description: input.description ?? input.storeDescription,
    prompt: input.prompt ?? input.userPrompt,
    userPrompt: input.userPrompt ?? input.prompt,
    documentText: input.documentText ?? input.ocrRawText ?? input.cardText,
    location: input.location,
    detectedServices: input.detectedServices,
    detectedProducts: input.detectedProducts,
    items: input.items ?? input.preloadedCatalogItems,
  });

  console.log(
    '[business_type_classified]',
    JSON.stringify({
      businessType: profile.businessType,
      confidence: profile.confidence,
      reasoning: profile.reasoning,
      catalogLabel: profile.catalogLabel,
      catalogMode: profile.catalogMode,
      primaryCTA: profile.primaryCTA,
    }),
  );

  console.log(
    '[catalog_profile_selected]',
    JSON.stringify({
      generatedContentProfile: profile.generatedContentProfile,
      defaultItemType: profile.defaultItemType,
      defaultPricingMode: profile.defaultPricingMode,
      subcategoryCount: profile.suggestedSubcategories?.length ?? 0,
    }),
  );

  return {
    classification: profile,
    catalogGenerationProfile: profile,
    generationProfile: profile,
    classificationProfile: profile,
    businessProfile: bslResult.profile,
    storefrontSettings: bslResult.storefrontSettings,
    recommendations: bslResult.recommendations,
  };
}
