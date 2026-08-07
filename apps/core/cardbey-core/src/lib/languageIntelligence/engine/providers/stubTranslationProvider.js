/**
 * Deterministic stub provider for tests / offline.
 */

/**
 * @returns {import('./translationProvider.js').TranslationProvider}
 */
export function createStubTranslationProvider(options = {}) {
  const prefix = options.prefix != null ? String(options.prefix) : '[stub]';
  return {
    id: 'stub',
    async translateBatch(items, targetLanguage) {
      return (items || []).map((item) => {
        /** @type {Record<string, string>} */
        const translated = {};
        for (const [field, value] of Object.entries(item.fields || {})) {
          translated[field] = `${prefix}:${targetLanguage}:${value}`;
        }
        return {
          id: item.id,
          type: item.type,
          translated,
          providerId: 'stub',
        };
      });
    },
  };
}
