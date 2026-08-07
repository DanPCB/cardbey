export {
  setTranslationProvider,
  getTranslationProvider,
  __resetTranslationProviderForTests,
} from './translationProvider.js';
export { createStubTranslationProvider } from './stubTranslationProvider.js';
export { createOpenAiTranslationProvider } from './openaiTranslationProvider.js';

import { getTranslationProvider, setTranslationProvider } from './translationProvider.js';
import { createOpenAiTranslationProvider } from './openaiTranslationProvider.js';
import { createStubTranslationProvider } from './stubTranslationProvider.js';

/**
 * Ensure a provider is registered. Prefers OpenAI when key present; else stub in non-prod tests.
 */
export function ensureDefaultTranslationProvider() {
  if (getTranslationProvider()) return getTranslationProvider();
  if (process.env.OPENAI_API_KEY) {
    return setTranslationProvider(createOpenAiTranslationProvider());
  }
  if (process.env.NODE_ENV === 'test' || process.env.LANGUAGE_INTELLIGENCE_STUB_PROVIDER === 'true') {
    return setTranslationProvider(createStubTranslationProvider());
  }
  return setTranslationProvider(createOpenAiTranslationProvider());
}
