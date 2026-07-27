/**
 * Context Engine — singleton factory and feature flag.
 */

import { getPrismaClient } from '../prisma.js';
import { ContextStore } from './contextStore.js';
import { ContextProvider } from './contextProvider.js';
import { ContextExtractor, contextExtractor } from './contextExtractor.js';
import { clearContextCacheForTests } from './contextCache.js';

/** @type {ContextProvider | null} */
let providerInstance = null;

/** @type {ContextStore | null} */
let storeInstance = null;

/**
 * Context Engine is enabled unless DISABLE_CONTEXT_ENGINE=true.
 */
export function isContextEngineEnabled() {
  return String(process.env.DISABLE_CONTEXT_ENGINE ?? '').trim().toLowerCase() !== 'true';
}

/**
 * @returns {ContextStore}
 */
export function getContextStore() {
  if (!storeInstance) {
    storeInstance = new ContextStore({ db: getPrismaClient() });
  }
  return storeInstance;
}

/**
 * @returns {ContextProvider}
 */
export function getContextProvider() {
  if (!providerInstance) {
    providerInstance = new ContextProvider({ store: getContextStore() });
  }
  return providerInstance;
}

export function getContextExtractor() {
  return contextExtractor;
}

/** @internal tests */
export function resetContextEngineForTests() {
  providerInstance = null;
  storeInstance = null;
  clearContextCacheForTests();
}

export { ContextStore, ContextProvider, ContextExtractor, contextExtractor };
