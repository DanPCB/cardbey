/**
 * BusinessProfile persistence — storefrontSettings.businessProfile SSOT storage.
 */

import { BSL_VERSION } from './types.js';
import { buildBusinessProfile } from './BusinessProfileBuilder.js';

const PROFILE_KEY = 'businessProfile';

/**
 * @param {object | null | undefined} storefrontSettings
 */
export function extractBusinessProfile(storefrontSettings) {
  if (!storefrontSettings || typeof storefrontSettings !== 'object') return null;
  const raw = storefrontSettings[PROFILE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.businessType || !raw.version) return null;
  return raw;
}

/**
 * Merge BusinessProfile into storefrontSettings without clobbering other keys.
 * @param {object | null | undefined} storefrontSettings
 * @param {import('./types.js').BusinessProfile} profile
 */
export function attachBusinessProfileToStorefrontSettings(storefrontSettings, profile) {
  const base =
    storefrontSettings && typeof storefrontSettings === 'object' && !Array.isArray(storefrontSettings)
      ? { ...storefrontSettings }
      : {};
  base[PROFILE_KEY] = profile;
  base.businessType = profile.businessType;
  base.catalogMode = profile.catalogMode;
  base.generatedContentProfile = profile.generationProfile?.recommendedCatalog ?? null;
  base.primaryCTA = profile.presentation?.primaryCTA ?? null;
  base.commerceMode = profile.runtimeProfile?.quotationEnabled
    ? 'inquiry'
    : profile.runtimeProfile?.bookingEnabled
      ? 'booking'
      : 'order';
  return base;
}

/**
 * @param {import('./types.js').BusinessSemanticInput} input
 * @param {{ persist?: boolean, existingSettings?: object | null }} [opts]
 */
export function createAndPersistBusinessProfile(input, opts = {}) {
  const result = buildBusinessProfile(input);
  const profile = { ...result.profile, storeId: input.storeId ?? result.profile.storeId };
  const storefrontSettings = attachBusinessProfileToStorefrontSettings(opts.existingSettings, profile);

  console.log(
    '[BUSINESS_PROFILE_CREATED]',
    JSON.stringify({
      storeId: profile.storeId ?? null,
      businessType: profile.businessType,
      industry: profile.industry,
      catalogMode: profile.catalogMode,
      version: profile.version,
      confidence: result.confidence,
    }),
  );

  return {
    ...result,
    profile,
    storefrontSettings,
  };
}

/**
 * Load profile from store row or infer if missing.
 * @param {object} store - Business row or public store DTO
 * @param {object} [opts]
 */
export function loadOrCreateBusinessProfile(store, opts = {}) {
  let settings = store?.storefrontSettings;
  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = null;
    }
  }

  const existing = extractBusinessProfile(settings);
  if (existing && !opts.forceReclassify) {
    return { profile: existing, created: false, confidence: existing.metadata?.confidence ?? 1 };
  }

  const result = buildBusinessProfile({
    storeId: store?.id ?? store?.storeId,
    businessName: store?.name ?? store?.storeName,
    businessType: store?.type ?? store?.storeType,
    category: store?.category ?? store?.businessCategory,
    description: store?.description,
    items: opts.items ?? store?.products,
  });

  return { ...result, created: true };
}

/**
 * @param {import('./types.js').BusinessProfile | null | undefined} profile
 * @param {string} capability
 */
export function profileHasCapability(profile, capability) {
  return profile?.capabilities?.[capability] === true;
}

/**
 * @param {import('./types.js').BusinessProfile | null | undefined} profile
 */
export function isProfileStale(profile) {
  return !profile || profile.version !== BSL_VERSION;
}
