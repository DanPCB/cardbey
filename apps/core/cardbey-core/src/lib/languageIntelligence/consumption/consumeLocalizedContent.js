/**
 * Shared facade for surfaces — preference-aware consumption without direct engine calls.
 *
 * Phase 5A: synchronous assembly only. Does not call TranslationEngine.
 * Generation remains behind opt-in localizers / translate APIs (5B–5E consumers).
 */

import { resolveLanguage } from '../resolution/languageResolver.js';
import { resolveCulturalAdaptation } from '../cultural/index.js';
import { normalizeUserLocalePreference } from '../contracts/userLocalePreference.js';
import { readLocalizedField, readCanonicalField } from '../adapters/translationUtilsAdapter.js';
import { isLanguageIntelligenceConsumptionV1Enabled } from '../flags.js';
import { assertContentOwnership, requiresExplicitOptIn } from './contentOwnership.js';
import { buildLocalizedConsumption } from './buildLocalizedConsumption.js';
import { assertConsumptionBoundary, CONSUMPTION_BOUNDARY_VERSION } from './consumptionBoundary.js';

/**
 * @typedef {Object} ConsumeLocalizedContentInput
 * @property {string} contentOwnership
 * @property {string} [surface]
 * @property {string} [originalText]
 * @property {object} [entity]  Model with canonical fields + translations JSON
 * @property {string} [field]   Field name when entity provided
 * @property {string} [originalLanguage]
 * @property {string} [targetLanguage]
 * @property {object} [accountPreference]
 * @property {object} [languageHints]  ResolveLanguageInput extras
 * @property {'original'|'translated'|'both'} [displayMode]
 * @property {boolean} [explicitOptIn]
 * @property {boolean} [allowGenerate]
 * @property {string} [region]
 * @property {string} [brandTone]
 * @property {string} [communicationStyle]
 * @property {object[]} [glossaryHits]
 * @property {boolean} [force]  Bypass consumption flag (tests)
 */

/**
 * Assemble a LocalizedConsumptionView from entity translations and/or provided text.
 * @param {ConsumeLocalizedContentInput} input
 */
export function consumeLocalizedContent(input = {}) {
  if (!input.force && !isLanguageIntelligenceConsumptionV1Enabled()) {
    const originalText =
      input.originalText != null
        ? String(input.originalText)
        : input.entity && input.field
          ? String(readCanonicalField(input.entity, input.field) ?? '')
          : '';
    return buildLocalizedConsumption({
      contentOwnership: assertContentOwnership(input.contentOwnership || 'business_owned'),
      surface: input.surface,
      originalText,
      originalLanguage: input.originalLanguage,
      localizedText: null,
      targetLanguage: input.targetLanguage,
      displayMode: 'original',
      status: 'missing',
      explicitOptIn: false,
    });
  }

  assertConsumptionBoundary(input.surface || 'unknown', { callsEngineDirectly: false });

  const contentOwnership = assertContentOwnership(input.contentOwnership || 'business_owned');
  const accountPreference = normalizeUserLocalePreference(input.accountPreference);
  const resolution = resolveLanguage({
    ...(input.languageHints || {}),
    explicitLanguage: input.targetLanguage ?? input.languageHints?.explicitLanguage,
    accountPreference,
    region: input.region ?? accountPreference.preferredRegion,
  });

  const targetLanguage = resolution.language;
  let originalText = input.originalText != null ? String(input.originalText) : '';
  if (!originalText && input.entity && input.field) {
    originalText = String(readCanonicalField(input.entity, input.field) ?? '');
  }

  const originalLanguage =
    input.originalLanguage ||
    accountPreference.preferredLanguage ||
    resolution.language;

  let localizedText = null;
  let status = 'missing';
  if (input.entity && input.field && targetLanguage) {
    const fromLayer = readLocalizedField(input.entity, input.field, targetLanguage);
    if (fromLayer != null && String(fromLayer) !== originalText) {
      localizedText = String(fromLayer);
      status = 'ready';
    }
  }

  const cultural = resolveCulturalAdaptation({
    region: input.region || resolution.region,
    language: targetLanguage,
    communicationStyle:
      input.communicationStyle || accountPreference.communicationStyleOverride || undefined,
    brandTone: input.brandTone,
  });

  const explicitOptIn =
    input.explicitOptIn !== undefined
      ? Boolean(input.explicitOptIn)
      : !requiresExplicitOptIn(contentOwnership);

  return buildLocalizedConsumption({
    contentOwnership,
    surface: input.surface,
    originalText,
    originalLanguage,
    localizedText,
    targetLanguage,
    displayMode: input.displayMode || 'translated',
    status,
    explicitOptIn,
    allowGenerate: input.allowGenerate,
    preference: {
      ...accountPreference,
      resolvedFrom: resolution.resolvedFrom,
      region: resolution.region,
      currency: resolution.currency,
      measurementUnits: resolution.measurementUnits,
    },
    cultural,
    glossaryHits: input.glossaryHits,
  });
}

/**
 * Diagnostics helper for consumers.
 */
export function getConsumptionFrameworkInfo() {
  return Object.freeze({
    version: CONSUMPTION_BOUNDARY_VERSION,
    enabled: isLanguageIntelligenceConsumptionV1Enabled(),
    authoritative: false,
    note: 'Surfaces must use consumeLocalizedContent / buildLocalizedConsumption; not TranslationEngine.',
  });
}
