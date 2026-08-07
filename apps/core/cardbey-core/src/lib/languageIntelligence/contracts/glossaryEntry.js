/**
 * GlossaryEntry — business / platform terminology that must not be blindly translated.
 */

import { isLanguageCode, normalizeLanguageCode } from './languageCode.js';

export const GLOSSARY_POLICIES = Object.freeze([
  'never_translate',
  'preferred_term',
  'literal_allowed',
]);

/**
 * @typedef {Object} GlossaryEntry
 * @property {string} id
 * @property {string} term
 * @property {'never_translate'|'preferred_term'|'literal_allowed'} policy
 * @property {string} [sourceLanguage]
 * @property {Record<string, string>} [preferredByLanguage]  lang → preferred rendering
 * @property {string} [scope]   platform | store | industry
 * @property {string} [storeId]
 * @property {boolean} [ownerApproved]
 * @property {string} [note]
 */

/**
 * @param {unknown} value
 * @returns {GlossaryEntry}
 */
export function assertGlossaryEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[languageIntelligence] Invalid GlossaryEntry');
  }
  const v = /** @type {Record<string, unknown>} */ (value);
  if (typeof v.id !== 'string' || !v.id.trim()) {
    throw new Error('[languageIntelligence] GlossaryEntry.id required');
  }
  if (typeof v.term !== 'string' || !v.term.trim()) {
    throw new Error(`[languageIntelligence] GlossaryEntry.term required for "${v.id}"`);
  }
  if (!GLOSSARY_POLICIES.includes(/** @type {string} */ (v.policy))) {
    throw new Error(`[languageIntelligence] GlossaryEntry.policy invalid for "${v.id}"`);
  }
  if (v.sourceLanguage != null && !isLanguageCode(v.sourceLanguage)) {
    throw new Error(`[languageIntelligence] GlossaryEntry.sourceLanguage invalid for "${v.id}"`);
  }
  if (v.preferredByLanguage != null) {
    if (typeof v.preferredByLanguage !== 'object' || Array.isArray(v.preferredByLanguage)) {
      throw new Error(`[languageIntelligence] GlossaryEntry.preferredByLanguage invalid for "${v.id}"`);
    }
    for (const [lang, term] of Object.entries(v.preferredByLanguage)) {
      if (!normalizeLanguageCode(lang) || typeof term !== 'string') {
        throw new Error(
          `[languageIntelligence] GlossaryEntry.preferredByLanguage entry invalid for "${v.id}"`,
        );
      }
    }
  }
  return /** @type {GlossaryEntry} */ (Object.freeze({ ...v }));
}

/**
 * Resolve how a term should appear in a target language.
 * @param {GlossaryEntry} entry
 * @param {string} targetLanguage
 * @returns {{ action: 'keep'|'prefer'|'translate', text: string }}
 */
export function resolveGlossaryTerm(entry, targetLanguage) {
  const lang = normalizeLanguageCode(targetLanguage) || String(targetLanguage ?? '');
  if (entry.policy === 'never_translate') {
    return { action: 'keep', text: entry.term };
  }
  const preferred = entry.preferredByLanguage?.[lang];
  if (preferred) {
    return { action: 'prefer', text: preferred };
  }
  if (entry.policy === 'preferred_term' && entry.term) {
    return { action: 'prefer', text: entry.term };
  }
  return { action: 'translate', text: entry.term };
}
