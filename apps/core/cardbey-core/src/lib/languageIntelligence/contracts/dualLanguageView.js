/**
 * DualLanguageView — presentation modes for original + localized text.
 */

export const DUAL_LANGUAGE_MODES = Object.freeze(['original', 'translated', 'both']);

/**
 * @typedef {Object} DualLanguageView
 * @property {'original'|'translated'|'both'} mode
 * @property {string} originalLanguage
 * @property {string} originalText
 * @property {string|null} localizedLanguage
 * @property {string|null} localizedText
 * @property {boolean} showTranslatedByAttribution
 * @property {string} [attributionLabel]
 */

/**
 * @param {object} input
 * @param {'original'|'translated'|'both'} [input.mode]
 * @param {string} input.originalLanguage
 * @param {string} input.originalText
 * @param {string|null} [input.localizedLanguage]
 * @param {string|null} [input.localizedText]
 * @param {boolean} [input.showTranslatedByAttribution]
 * @returns {DualLanguageView}
 */
export function buildDualLanguageView(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('[languageIntelligence] buildDualLanguageView requires input');
  }
  const mode = DUAL_LANGUAGE_MODES.includes(input.mode) ? input.mode : 'translated';
  const originalText = String(input.originalText ?? '');
  const localizedText =
    input.localizedText == null || input.localizedText === ''
      ? null
      : String(input.localizedText);

  return Object.freeze({
    mode,
    originalLanguage: String(input.originalLanguage ?? ''),
    originalText,
    localizedLanguage: input.localizedLanguage == null ? null : String(input.localizedLanguage),
    localizedText,
    showTranslatedByAttribution: Boolean(
      input.showTranslatedByAttribution ?? (localizedText != null && mode !== 'original'),
    ),
    attributionLabel: 'Translated by Cardbey AI',
  });
}

/**
 * Pick display strings for a mode (UI helper — no mutation).
 * @param {DualLanguageView} view
 * @returns {{ primary: string, secondary: string|null }}
 */
export function pickDualLanguageDisplay(view) {
  const localized = view.localizedText ?? view.originalText;
  if (view.mode === 'original') {
    return { primary: view.originalText, secondary: null };
  }
  if (view.mode === 'both') {
    return { primary: localized, secondary: view.originalText };
  }
  return { primary: localized, secondary: null };
}
