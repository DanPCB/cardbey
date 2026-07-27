/**
 * Translation Utils - JavaScript wrapper
 * Re-exports from TypeScript implementation for compatibility with .js imports
 */

// Node ESM cannot import `.ts` without a TS loader. Mirror runtime exports here.

export function getTranslatedField(model, fieldName, lang) {
  if (!lang) return (model && model[fieldName] != null) ? model[fieldName] : null;
  const translations = model && model.translations;
  if (translations && typeof translations === 'object') {
    const langTranslations = translations[lang];
    if (langTranslations && typeof langTranslations === 'object' && fieldName in langTranslations) {
      const translatedValue = langTranslations[fieldName];
      if (translatedValue != null) return translatedValue;
    }
  }
  return (model && model[fieldName] != null) ? model[fieldName] : null;
}

export function setTranslatedFields(model, lang, values) {
  const existingTranslations = (model && model.translations) || {};
  const translations =
    typeof existingTranslations === 'object' && existingTranslations !== null && !Array.isArray(existingTranslations)
      ? { ...existingTranslations }
      : {};
  translations[lang] = { ...(translations[lang] || {}), ...(values || {}) };
  return { translations };
}

export function isValidTranslations(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const lang in value) {
    const langTranslations = value[lang];
    if (typeof langTranslations !== 'object' || langTranslations === null || Array.isArray(langTranslations)) {
      return false;
    }
    for (const field in langTranslations) {
      if (typeof langTranslations[field] !== 'string') return false;
    }
  }
  return true;
}

