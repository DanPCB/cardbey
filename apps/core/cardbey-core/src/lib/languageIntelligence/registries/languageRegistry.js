import { isLanguageCode } from '../contracts/languageCode.js';

/**
 * @typedef {Object} LanguageDefinition
 * @property {string} id
 * @property {number} version
 * @property {string} name
 * @property {string} nativeName
 * @property {'ltr'|'rtl'} direction
 * @property {string} bcp47
 */

/** @type {Map<string, LanguageDefinition>} */
const store = new Map();
let sealed = false;

function assertOpen() {
  if (sealed) {
    throw new Error('[languageIntelligence] Language registry is sealed; runtime mutation is not allowed');
  }
}

/**
 * @param {unknown} definition
 */
export function registerLanguage(definition) {
  assertOpen();
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error('[languageIntelligence] Invalid language definition');
  }
  const d = /** @type {Record<string, unknown>} */ (definition);
  if (!isLanguageCode(d.id)) {
    throw new Error(`[languageIntelligence] Unsupported language id "${String(d.id)}"`);
  }
  if (typeof d.version !== 'number' || !Number.isFinite(d.version)) {
    throw new Error(`[languageIntelligence] Language version invalid for "${d.id}"`);
  }
  if (typeof d.name !== 'string' || !d.name.trim()) {
    throw new Error(`[languageIntelligence] Language name required for "${d.id}"`);
  }
  const id = String(d.id).trim().toLowerCase();
  if (store.has(id)) {
    throw new Error(`[languageIntelligence] Duplicate language id "${id}"`);
  }
  const entry = Object.freeze({
    id,
    version: /** @type {number} */ (d.version),
    name: String(d.name),
    nativeName: String(d.nativeName ?? d.name),
    direction: d.direction === 'rtl' ? 'rtl' : 'ltr',
    bcp47: String(d.bcp47 ?? id),
  });
  store.set(id, entry);
  return entry;
}

/** @param {string} id */
export function getLanguage(id) {
  return store.get(String(id ?? '').trim().toLowerCase()) ?? null;
}

export function listLanguages() {
  return Object.freeze([...store.values()]);
}

/** @param {string} id */
export function hasLanguage(id) {
  return store.has(String(id ?? '').trim().toLowerCase());
}

export function sealLanguageRegistry() {
  sealed = true;
}

/** @internal */
export function __resetLanguageRegistryForTests() {
  store.clear();
  sealed = false;
}
