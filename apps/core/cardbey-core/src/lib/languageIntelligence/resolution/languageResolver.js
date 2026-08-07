/**
 * LanguageResolver — deterministic preference chain.
 *
 * explicit → account → browser → device → region_default → English fallback
 * Never overrides manual selection.
 */

import {
  coerceLanguageOrNull,
  fallbackLanguage,
  assertLanguageResolution,
} from '../contracts/languageResolution.js';
import { normalizeUserLocalePreference } from '../contracts/userLocalePreference.js';
import { getLanguage, getRegion } from '../registries/index.js';

const DEFAULT_REGION = 'AU';

/**
 * @typedef {Object} ResolveLanguageInput
 * @property {unknown} [explicitLanguage]     Query/header/body override
 * @property {unknown} [accountPreference]    Saved UserLocalePreference or language string
 * @property {unknown} [browserLanguage]      Accept-Language
 * @property {unknown} [deviceLanguage]       Device locale hint
 * @property {unknown} [region]               Preferred / inferred region code
 * @property {boolean} [manualSelection]      Force honor account/explicit as manual
 */

/**
 * @param {ResolveLanguageInput} [input]
 * @returns {import('../contracts/languageResolution.js').LanguageResolution}
 */
export function resolveLanguage(input = {}) {
  /** @type {import('../contracts/languageResolution.js').LanguageResolutionEvidence[]} */
  const evidence = [];

  const accountPref =
    typeof input.accountPreference === 'string'
      ? normalizeUserLocalePreference({ preferredLanguage: input.accountPreference })
      : normalizeUserLocalePreference(input.accountPreference);

  const regionId =
    (typeof input.region === 'string' && input.region.trim()
      ? input.region.trim().toUpperCase()
      : null) ||
    accountPref.preferredRegion ||
    DEFAULT_REGION;

  const regionProfile = getRegion(regionId) || getRegion(DEFAULT_REGION);

  const manual =
    Boolean(input.manualSelection) ||
    Boolean(accountPref.manualLanguageSelection) ||
    coerceLanguageOrNull(input.explicitLanguage) != null;

  /** @type {{ language: string|null, source: string }} */
  let picked = { language: null, source: 'fallback' };

  const candidates = [
    { raw: input.explicitLanguage, source: 'explicit' },
    { raw: accountPref.preferredLanguage, source: 'account' },
    { raw: input.browserLanguage, source: 'browser' },
    { raw: input.deviceLanguage, source: 'device' },
    { raw: regionProfile?.defaultLanguage, source: 'region_default' },
  ];

  for (const c of candidates) {
    const lang = coerceLanguageOrNull(c.raw);
    evidence.push({
      source: c.source,
      raw: c.raw == null ? undefined : String(c.raw),
      note: lang ? `resolved:${lang}` : 'unresolved',
    });
    if (!picked.language && lang) {
      picked = { language: lang, source: c.source };
      // Manual selection: stop after first of explicit/account when present
      if (manual && (c.source === 'explicit' || c.source === 'account')) {
        break;
      }
      if (!manual) {
        // Keep first available; continue only for evidence collection? Prefer first win.
        break;
      }
    }
  }

  if (!picked.language) {
    picked = { language: fallbackLanguage(), source: 'fallback' };
    evidence.push({ source: 'fallback', raw: fallbackLanguage(), note: 'English fallback' });
  }

  // When manual and explicit/account won, do not let later sources override (already enforced).
  const languageDef = getLanguage(picked.language);
  const currency = accountPref.preferredCurrency || regionProfile?.currency || 'AUD';
  const dateFormat = accountPref.preferredDateFormat || regionProfile?.dateFormat || 'dd/MM/yyyy';
  const measurementUnits =
    accountPref.preferredMeasurementUnits || regionProfile?.measurementUnits || 'metric';
  const communicationStyle = regionProfile?.communicationStyle || 'friendly';
  const intlLocale = languageDef?.bcp47 || regionProfile?.intlLocale || 'en';

  return assertLanguageResolution({
    language: picked.language,
    region: regionProfile?.id ?? regionId,
    currency,
    dateFormat,
    measurementUnits,
    communicationStyle,
    resolvedFrom: picked.source,
    manualSelectionHonored: manual && (picked.source === 'explicit' || picked.source === 'account'),
    evidence,
    intlLocale,
  });
}
