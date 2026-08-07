/**
 * Build a LocalizedConsumptionView — the shared UI integration envelope.
 *
 * Pure (no I/O, no engine calls). Surfaces pass already-resolved texts/status.
 */

import { DUAL_LANGUAGE_MODES, buildDualLanguageView } from '../contracts/dualLanguageView.js';
import { renderDualLanguage, withViewMode } from '../dualLanguage/index.js';
import { normalizeLanguageCode } from '../contracts/languageCode.js';
import { assertContentOwnership, requiresExplicitOptIn, defaultAllowGenerate } from './contentOwnership.js';
import { normalizeConsumptionStatus } from './consumptionStatus.js';
import { applyFallbackToOriginal } from './fallbackPolicy.js';
import { CONSUMPTION_BOUNDARY_VERSION } from './consumptionBoundary.js';
import { isLanguageIntelligenceAuthoritative } from '../flags.js';

/**
 * @typedef {Object} LocalizedConsumptionInput
 * @property {string} contentOwnership
 * @property {string} originalText
 * @property {string} [originalLanguage]
 * @property {string|null} [localizedText]
 * @property {string} [targetLanguage]
 * @property {'original'|'translated'|'both'} [displayMode]
 * @property {string} [status]
 * @property {unknown} [error]
 * @property {boolean} [explicitOptIn]
 * @property {boolean} [allowGenerate]
 * @property {object} [preference]
 * @property {object} [cultural]
 * @property {object[]} [glossaryHits]
 * @property {string} [surface]
 */

/**
 * @param {LocalizedConsumptionInput} input
 */
export function buildLocalizedConsumption(input = {}) {
  const contentOwnership = assertContentOwnership(input.contentOwnership || 'business_owned');
  const originalText = String(input.originalText ?? '');
  const originalLanguage =
    normalizeLanguageCode(input.originalLanguage) || String(input.originalLanguage || '');
  const targetLanguage =
    normalizeLanguageCode(input.targetLanguage) || String(input.targetLanguage || '');
  const requestedMode = DUAL_LANGUAGE_MODES.includes(input.displayMode)
    ? input.displayMode
    : 'translated';
  const explicitOptIn = Boolean(input.explicitOptIn);
  const allowGenerate =
    input.allowGenerate !== undefined
      ? Boolean(input.allowGenerate)
      : defaultAllowGenerate(contentOwnership);

  let status = normalizeConsumptionStatus(input.status, input.localizedText ? 'ready' : 'missing');
  let localizedText =
    input.localizedText == null || input.localizedText === '' ? null : String(input.localizedText);

  const crossLanguage =
    Boolean(originalLanguage) &&
    Boolean(targetLanguage) &&
    originalLanguage !== targetLanguage;

  if (crossLanguage && requiresExplicitOptIn(contentOwnership) && !explicitOptIn) {
    status = 'opt_in_required';
    localizedText = null;
  } else if (originalLanguage && targetLanguage && originalLanguage === targetLanguage) {
    status = 'same_language';
    localizedText = null;
  }

  const fallback = applyFallbackToOriginal({
    originalText,
    localizedText,
    status,
    error: input.error,
  });

  const showTranslated =
    !fallback.usedFallback &&
    fallback.status === 'ready' &&
    localizedText != null &&
    requestedMode !== 'original';

  const viewMode = showTranslated ? requestedMode : 'original';
  const view = withViewMode(
    buildDualLanguageView({
      mode: viewMode,
      originalLanguage,
      originalText,
      localizedLanguage: targetLanguage || null,
      localizedText: showTranslated ? localizedText : null,
      showTranslatedByAttribution: showTranslated,
    }),
    viewMode,
  );

  const render = renderDualLanguage(view);
  const finalStatus =
    input.error || fallback.status === 'fallback_original'
      ? 'fallback_original'
      : status;

  return Object.freeze({
    version: CONSUMPTION_BOUNDARY_VERSION,
    contentOwnership,
    surface: input.surface ? String(input.surface) : null,
    displayMode: view.mode,
    status: finalStatus,
    originalLanguage,
    targetLanguage: targetLanguage || null,
    originalText,
    localizedText: showTranslated ? localizedText : null,
    canonicalPreserved: true,
    authoritative: isLanguageIntelligenceAuthoritative(),
    usedFallback: fallback.usedFallback || finalStatus === 'fallback_original',
    allowGenerate,
    explicitOptIn,
    dualLanguageView: view,
    render,
    attribution: render.attribution,
    labels: render.labels,
    preference: input.preference ? Object.freeze({ ...input.preference }) : null,
    cultural: input.cultural ? Object.freeze({ ...input.cultural }) : null,
    glossaryHits: Array.isArray(input.glossaryHits)
      ? Object.freeze([...input.glossaryHits])
      : Object.freeze([]),
    error: input.error ? String(input.error?.message || input.error) : null,
  });
}
