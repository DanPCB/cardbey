/**
 * PreferenceService — load durable prefs into LanguageResolver.
 */

import { resolveLanguage } from '../resolution/languageResolver.js';
import { getUserLocalePreference } from './userPreferenceStore.js';
import { getBusinessLocalePreference } from './businessPreferenceStore.js';
import { getRegion } from '../registries/index.js';

/**
 * Resolve language for a user, honoring saved account preference.
 * @param {string|null|undefined} userId
 * @param {import('../resolution/languageResolver.js').ResolveLanguageInput} [hints]
 */
export async function resolveLanguageForUser(userId, hints = {}) {
  let accountPreference = hints.accountPreference;
  if (userId && !accountPreference) {
    const saved = await getUserLocalePreference(userId);
    accountPreference = saved;
  }
  return resolveLanguage({
    ...hints,
    accountPreference,
  });
}

/**
 * Resolve language/region defaults for a store visitor or owner tools.
 * @param {string} storeId
 * @param {import('../resolution/languageResolver.js').ResolveLanguageInput} [hints]
 */
export async function resolveLanguageForStore(storeId, hints = {}) {
  const business = await getBusinessLocalePreference(storeId);
  const locale = business?.locale || {};
  const region =
    hints.region ||
    locale.preferredRegion ||
    business?.regionHint ||
    null;

  return resolveLanguage({
    ...hints,
    region,
    accountPreference: {
      ...locale,
      preferredRegion: locale.preferredRegion || region || undefined,
    },
  });
}

/**
 * Effective cultural style: business override → region default → friendly.
 * @param {{ storeId?: string, region?: string, styleOverride?: string|null }} input
 */
export async function resolveEffectiveCulturalStyle(input = {}) {
  let style = input.styleOverride || null;
  let regionId = input.region || null;

  if (input.storeId) {
    const biz = await getBusinessLocalePreference(input.storeId);
    if (!style && biz?.culturalStyle) style = biz.culturalStyle;
    if (!regionId) {
      regionId = biz?.locale?.preferredRegion || biz?.regionHint || null;
    }
  }

  if (!style && regionId) {
    const region = getRegion(regionId);
    style = region?.communicationStyle || null;
  }

  return Object.freeze({
    communicationStyle: style || 'friendly',
    region: regionId,
  });
}
