/**
 * Read-only / view-layer bridge to existing translations JSON helpers.
 * Enforces Language Intelligence policy: never treat primary fields as writable via translate.
 */

import {
  getTranslatedField,
  setTranslatedFields,
  isValidTranslations,
} from '../../../services/i18n/translationUtils.js';

/**
 * Read a localized field without mutating the model.
 * @param {object} model
 * @param {string} fieldName
 * @param {string|null|undefined} lang
 */
export function readLocalizedField(model, fieldName, lang) {
  return getTranslatedField(model, fieldName, lang);
}

/**
 * Build a translations-layer patch only (does not mutate primary fields).
 * Callers must persist `translations` — never assign returned values onto name/description.
 * @param {object} model
 * @param {string} lang
 * @param {Record<string, string>} values
 * @returns {{ translations: Record<string, Record<string, string>> }}
 */
export function buildTranslationsLayerPatch(model, lang, values) {
  return setTranslatedFields(model, lang, values);
}

/**
 * Canonical (source) field value — ignores translations map.
 * @param {object} model
 * @param {string} fieldName
 */
export function readCanonicalField(model, fieldName) {
  if (!model || typeof model !== 'object') return null;
  return model[fieldName] != null ? model[fieldName] : null;
}

export { isValidTranslations };
