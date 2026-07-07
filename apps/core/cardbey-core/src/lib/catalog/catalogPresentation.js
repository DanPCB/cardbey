/**
 * Resolve storefront catalog presentation labels with safe fallbacks.
 * Delegates to Business Semantic Layer (BSL).
 */

import { getBusinessCatalogPresentation, extractBusinessProfile } from '../businessSemantic/index.js';
import { shouldOverrideStoredCatalogLabel } from './classifyBusinessType.js';

export { shouldOverrideStoredCatalogLabel };

/**
 * @param {object | null | undefined} store
 * @param {object[] | null | undefined} items
 */
export function getStoreCatalogPresentation(store, items = []) {
  const settings =
    store?.storefrontSettings && typeof store.storefrontSettings === 'object'
      ? store.storefrontSettings
      : {};
  const storedProfile = extractBusinessProfile(settings);
  const presentation = getBusinessCatalogPresentation(
    {
      ...store,
      storefrontSettings: storedProfile ? { ...settings, businessProfile: storedProfile } : settings,
    },
    items,
  );

  return {
    businessType: presentation.businessType,
    catalogMode: presentation.catalogMode ?? store?.catalogMode,
    catalogLabel: presentation.catalogLabel,
    sectionTitle: presentation.sectionTitle,
    primaryCTA: presentation.primaryCTA,
    defaultCTA: presentation.primaryCTA,
    itemCardVariant: presentation.itemCardVariant,
    showBookingControls: presentation.showBookingControls,
    showQuoteControls: presentation.showQuoteControls,
    showCartControls: presentation.showCartControls,
    generatedContentProfile:
      store?.generatedContentProfile ?? presentation.businessProfile?.generationProfile?.recommendedCatalog,
    businessProfile: presentation.businessProfile,
    capabilities: presentation.capabilities,
    runtimeProfile: presentation.runtimeProfile,
    dashboardWidgets: presentation.dashboardWidgets,
    performerRecommendations: presentation.performerRecommendations,
    confidence: presentation.businessProfile?.metadata?.confidence,
    reasoning: presentation.businessProfile?.metadata?.reasoning,
  };
}

/**
 * Runtime repair for legacy stores with wrong generated labels.
 * @param {object} store
 * @param {object[]} items
 */
export function repairCatalogPresentation(store, items = []) {
  const presentation = getStoreCatalogPresentation(store, items);
  const stored = String(store?.catalogLabel ?? '').trim();
  const needsRepair = shouldOverrideStoredCatalogLabel(stored, presentation.catalogLabel);
  if (needsRepair) {
    console.log(
      '[catalog_presentation_resolved]',
      JSON.stringify({
        storeId: store?.id ?? null,
        storedLabel: stored || null,
        resolvedLabel: presentation.catalogLabel,
        businessType: presentation.businessType,
      }),
    );
  }
  return { ...presentation, repaired: needsRepair };
}
