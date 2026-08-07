/**
 * TranslationProvider contract — AI / MT backends plug in here.
 * Modules must not call OpenAI (or other vendors) directly for content translation.
 */

/**
 * @typedef {Object} ProviderTranslateItem
 * @property {string} id
 * @property {string} type
 * @property {Record<string, string>} fields
 * @property {string} [sourceLanguage]
 */

/**
 * @typedef {Object} ProviderTranslateResult
 * @property {string} id
 * @property {string} type
 * @property {Record<string, string>} translated
 * @property {string} [providerId]
 */

/**
 * @typedef {Object} TranslationProvider
 * @property {string} id
 * @property {(items: ProviderTranslateItem[], targetLanguage: string, opts?: object) => Promise<ProviderTranslateResult[]>} translateBatch
 */

/** @type {TranslationProvider|null} */
let activeProvider = null;

/**
 * @param {TranslationProvider} provider
 */
export function setTranslationProvider(provider) {
  if (!provider || typeof provider.translateBatch !== 'function' || !provider.id) {
    throw new Error('[languageIntelligence] Invalid TranslationProvider');
  }
  activeProvider = provider;
  return provider;
}

export function getTranslationProvider() {
  return activeProvider;
}

/** @internal */
export function __resetTranslationProviderForTests() {
  activeProvider = null;
}
