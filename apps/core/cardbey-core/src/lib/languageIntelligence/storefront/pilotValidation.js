/**
 * Pilot language publish validation checklist (Stage 5A).
 */

import { evaluateTranslationReadiness } from './translationReadiness.js';
import { isSupportedStorefrontDisplayLanguage } from './storefrontLanguagePolicy.js';
import { isPilotPublicLocalizationAllowed } from './storefrontPilotState.js';

/**
 * @param {object} input
 */
export function validateStorefrontLanguagePilot(input) {
  const {
    policy,
    pilot,
    business,
    products,
    metaMap,
    targetLanguage,
    storeIsActive = true,
  } = input;

  /** @type {Array<{ code: string, fieldPath?: string, message: string }>} */
  const blockers = [];
  /** @type {Array<{ code: string, fieldPath?: string, message: string }>} */
  const warnings = [];

  if (!storeIsActive) {
    blockers.push({
      code: 'STORE_NOT_PUBLIC',
      message: 'Store is not publicly accessible',
    });
  }
  if (!policy?.canonicalLanguage) {
    blockers.push({ code: 'CANONICAL_INVALID', message: 'Canonical language is invalid' });
  }
  if (!isSupportedStorefrontDisplayLanguage(policy, targetLanguage)) {
    blockers.push({
      code: 'LANGUAGE_UNSUPPORTED',
      message: 'Target language is not in supportedDisplayLanguages',
    });
  }
  if (!isPilotPublicLocalizationAllowed(pilot)) {
    blockers.push({
      code: 'PILOT_NOT_ACTIVE',
      message: 'Pilot is not enrolled or is paused',
    });
  }
  if (!policy.publicLocalizationEnabled) {
    blockers.push({
      code: 'PUBLIC_LOCALIZATION_DISABLED',
      message: 'Store public localization is disabled',
    });
  }

  const readiness = evaluateTranslationReadiness({
    storeId: business?.id,
    canonicalLanguage: policy.canonicalLanguage,
    targetLanguage,
    business,
    products,
    metaMap,
  });

  if (!readiness.publishable) {
    blockers.push({
      code: 'LANGUAGE_NOT_PUBLISHABLE',
      message: `Language status is ${readiness.status}`,
    });
  }
  if (readiness.counts.stale > 0) {
    blockers.push({
      code: 'STALE_REQUIRED_TRANSLATIONS',
      message: `${readiness.counts.stale} stale translation(s)`,
    });
  }
  if (readiness.counts.missing > 0) {
    warnings.push({
      code: 'MISSING_TRANSLATIONS',
      message: `${readiness.counts.missing} required field(s) missing translation`,
    });
  }

  return Object.freeze({
    ready: blockers.length === 0,
    language: targetLanguage,
    readiness,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
  });
}
