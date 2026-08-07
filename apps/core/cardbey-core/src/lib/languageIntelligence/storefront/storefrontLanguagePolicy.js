/**
 * StorefrontLanguagePolicy — per-store public localization gate (Stage 4).
 *
 * Defaults fail closed: publicLocalizationEnabled=false, original_only.
 * Stored under Business.stylePreferences.languageIntelligence.storefrontLanguagePolicy.
 */

import { isLanguageCode, normalizeLanguageCode, FALLBACK_LANGUAGE } from '../contracts/languageCode.js';

/** Local reader — avoid circular import with businessPreferenceStore. */
function readLiBlock(stylePreferences) {
  let prefs = stylePreferences;
  if (typeof prefs === 'string') {
    try {
      prefs = JSON.parse(prefs);
    } catch {
      prefs = {};
    }
  }
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};
  const block =
    prefs.languageIntelligence && typeof prefs.languageIntelligence === 'object'
      ? prefs.languageIntelligence
      : {};
  return /** @type {Record<string, unknown>} */ (block);
}

export const STOREFRONT_LANGUAGE_POLICY_VERSION = 'storefront-language-policy-v1';

const DISPLAY_MODES = Object.freeze(['original', 'translated', 'both']);
const TRANSLATION_POLICIES = Object.freeze(['original_only', 'existing_translations_only']);

/**
 * @typedef {Object} StorefrontLanguagePolicy
 * @property {string} canonicalLanguage
 * @property {string[]} supportedDisplayLanguages
 * @property {boolean} publicLocalizationEnabled
 * @property {'original_only'|'existing_translations_only'} translationPolicy
 * @property {'original'|'translated'|'both'} defaultDisplayMode
 * @property {string} version
 */

/**
 * @param {unknown} raw
 * @param {{ defaultCanonical?: string|null }} [opts]
 * @returns {StorefrontLanguagePolicy}
 */
export function normalizeStorefrontLanguagePolicy(raw, opts = {}) {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};

  const canonical =
    normalizeLanguageCode(base.canonicalLanguage) ||
    normalizeLanguageCode(opts.defaultCanonical) ||
    FALLBACK_LANGUAGE;

  let supported = Array.isArray(base.supportedDisplayLanguages)
    ? base.supportedDisplayLanguages
        .map((x) => normalizeLanguageCode(x))
        .filter((x) => x && isLanguageCode(x))
    : [];
  if (!supported.includes(canonical)) supported = [canonical, ...supported];
  // Always allow canonical original
  supported = [...new Set(supported.filter(Boolean))];

  const publicLocalizationEnabled = base.publicLocalizationEnabled === true;

  // When opted in without explicit policy, allow existing translations only (never live AI).
  const translationPolicy = !publicLocalizationEnabled
    ? 'original_only'
    : TRANSLATION_POLICIES.includes(/** @type {string} */ (base.translationPolicy))
      ? /** @type {'original_only'|'existing_translations_only'} */ (base.translationPolicy)
      : 'existing_translations_only';

  const defaultDisplayMode = !publicLocalizationEnabled
    ? 'original'
    : DISPLAY_MODES.includes(/** @type {string} */ (base.defaultDisplayMode))
      ? /** @type {'original'|'translated'|'both'} */ (base.defaultDisplayMode)
      : 'translated';

  return Object.freeze({
    version: STOREFRONT_LANGUAGE_POLICY_VERSION,
    canonicalLanguage: canonical,
    supportedDisplayLanguages: Object.freeze(supported),
    publicLocalizationEnabled,
    translationPolicy,
    defaultDisplayMode,
  });
}

/**
 * Read policy from business row / stylePreferences.
 * @param {object|null|undefined} business
 */
export function getStorefrontLanguagePolicyFromBusiness(business) {
  const block = readLiBlock(business?.stylePreferences);
  const localePreferred =
    block.locale && typeof block.locale === 'object'
      ? /** @type {Record<string, unknown>} */ (block.locale).preferredLanguage
      : null;
  return normalizeStorefrontLanguagePolicy(block.storefrontLanguagePolicy, {
    defaultCanonical: localePreferred || business?.defaultLanguage || null,
  });
}

/**
 * Merge policy into LI block (in-memory; caller persists via setBusinessLocalePreference path).
 * @param {Record<string, unknown>} block
 * @param {Partial<StorefrontLanguagePolicy>} patch
 */
export function mergeStorefrontLanguagePolicyIntoBlock(block, patch = {}) {
  const current = normalizeStorefrontLanguagePolicy(block.storefrontLanguagePolicy, {
    defaultCanonical:
      block.locale && typeof block.locale === 'object'
        ? /** @type {Record<string, unknown>} */ (block.locale).preferredLanguage
        : null,
  });
  const next = normalizeStorefrontLanguagePolicy({
    ...current,
    ...patch,
    supportedDisplayLanguages:
      patch.supportedDisplayLanguages !== undefined
        ? patch.supportedDisplayLanguages
        : current.supportedDisplayLanguages,
  });
  return {
    ...block,
    storefrontLanguagePolicy: next,
  };
}

export function isSupportedStorefrontDisplayLanguage(policy, language) {
  const lang = normalizeLanguageCode(language);
  if (!lang) return false;
  return policy.supportedDisplayLanguages.includes(lang);
}
