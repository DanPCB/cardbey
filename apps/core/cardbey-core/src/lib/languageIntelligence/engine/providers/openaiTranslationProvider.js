/**
 * OpenAI TranslationProvider — wraps legacy aiTranslationService without DB writes.
 */

import { translateBatch as legacyTranslateBatch } from '../../../../services/i18n/aiTranslationService.js';
import { getLanguage } from '../../registries/index.js';
import { normalizeLanguageCode } from '../../contracts/languageCode.js';

/**
 * @returns {import('./translationProvider.js').TranslationProvider}
 */
export function createOpenAiTranslationProvider() {
  return {
    id: 'openai',
    async translateBatch(items, targetLanguage) {
      const lang = normalizeLanguageCode(targetLanguage) || String(targetLanguage);
      const def = getLanguage(lang);
      const langName = def?.name || lang;

      // Legacy service historically typed en|vi; pass through string for prompt (service updated).
      const results = await legacyTranslateBatch(
        items.map((it) => ({
          id: it.id,
          type: /** @type {'store'|'category'|'product'} */ (it.type),
          fields: it.fields,
        })),
        /** @type {any} */ (lang),
        { languageName: langName },
      );

      return results.map((r) => ({
        id: r.id,
        type: r.type,
        translated: r.translated,
        providerId: 'openai',
      }));
    },
  };
}
