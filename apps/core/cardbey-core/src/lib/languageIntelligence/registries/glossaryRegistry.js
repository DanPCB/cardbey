import { assertGlossaryEntry, resolveGlossaryTerm } from '../contracts/glossaryEntry.js';

/** @type {Map<string, import('../contracts/glossaryEntry.js').GlossaryEntry>} */
const store = new Map();
let sealed = false;

function assertOpen() {
  if (sealed) {
    throw new Error('[languageIntelligence] Glossary registry is sealed; runtime mutation is not allowed');
  }
}

/**
 * @param {unknown} definition
 */
export function registerGlossaryEntry(definition) {
  assertOpen();
  const entry = assertGlossaryEntry(definition);
  if (store.has(entry.id)) {
    throw new Error(`[languageIntelligence] Duplicate glossary id "${entry.id}"`);
  }
  store.set(entry.id, entry);
  return entry;
}

/** @param {string} id */
export function getGlossaryEntry(id) {
  return store.get(String(id ?? '').trim()) ?? null;
}

export function listGlossaryEntries() {
  return Object.freeze([...store.values()]);
}

/**
 * Find glossary hits in free text (simple case-insensitive contains).
 * @param {string} text
 * @param {string} targetLanguage
 * @returns {Array<{ entry: import('../contracts/glossaryEntry.js').GlossaryEntry, resolution: ReturnType<typeof resolveGlossaryTerm> }>}
 */
export function matchGlossaryInText(text, targetLanguage) {
  const hay = String(text ?? '');
  if (!hay) return [];
  const lower = hay.toLowerCase();
  /** @type {Array<{ entry: import('../contracts/glossaryEntry.js').GlossaryEntry, resolution: ReturnType<typeof resolveGlossaryTerm> }>} */
  const hits = [];
  for (const entry of store.values()) {
    if (lower.includes(entry.term.toLowerCase())) {
      hits.push({ entry, resolution: resolveGlossaryTerm(entry, targetLanguage) });
    }
  }
  return hits;
}

export function sealGlossaryRegistry() {
  sealed = true;
}

/** @internal */
export function __resetGlossaryRegistryForTests() {
  store.clear();
  sealed = false;
}
