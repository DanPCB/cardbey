/**
 * Canonical create_store intent contract — shared by fast path, greenfield gates, ontology.
 * One source of truth for synonyms / normalization / deterministic patterns.
 */

/** Stable intent id used across starter, NL, and runtime. */
export const CREATE_STORE_INTENT = Object.freeze({
  intent: 'create_store',
  aliases: [
    'create business',
    'create shop',
    'start business',
    'set up store',
    'build store',
    'create my store',
    'create my first store',
    'create a new store',
    'start my business',
    'set up my shop',
    'build a store for me',
    'i want to create a shop',
  ],
  requiresExistingStore: false,
  createsStoreContext: true,
  runtimeAction: 'create_store',
});

/**
 * @param {string} value
 */
export function normalizeIntentText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic high-confidence create-store patterns (after normalizeIntentText).
 * Accepts: create/start/set up/build + optional my|a|new|first + store|shop|business
 */
export const CREATE_STORE_PATTERNS = Object.freeze([
  /\bcreate(?:\s+(?:my|a|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\bstart(?:\s+(?:my|a|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\bset up(?:\s+(?:my|a|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\bbuild(?:\s+(?:my|a|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\bmake(?:\s+(?:my|a|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\bopen(?:\s+(?:my|a|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\blaunch(?:\s+(?:my|a|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\bi want to create(?:\s+(?:a|my|my first|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\bcan you create(?:\s+(?:a|my|my first|new|first)){0,3}\s+(?:store|shop|business)\b/,
  /\bcreate(?:\s+(?:a|my|new|first)){0,3}\s+(?:store|shop|business) for (?:me|my business)\b/,
]);

/** Exact phrase list (normalized). Kept for bare-request detection. */
export const CREATE_STORE_EXACT_PHRASES = Object.freeze([
  'create a store',
  'create store',
  'create my store',
  'create my first store',
  'create a new store',
  'create a business',
  'create my business',
  'create my first business',
  'create a shop',
  'create my shop',
  'new store',
  'start business',
  'start a business',
  'start my business',
  'open shop',
  'open a shop',
  'build store',
  'build a store',
  'build a store for me',
  'make store',
  'make a store',
  'create a store for my business',
  'set up a store',
  'set up my store',
  'set up my shop',
  'i want to create a shop',
  'i want to create a store',
]);

/**
 * Repair common live typos before pattern match.
 * @param {string} text
 */
export function normalizeCreateStoreTypos(text) {
  let s = normalizeIntentText(text);
  if (!s) return s;
  s = s.replace(/\bcreat\b/g, 'create');
  s = s.replace(/\bas\s+tore\b/g, 'a store');
  s = s.replace(/\ba\s+tore\b/g, 'a store');
  s = s.replace(/\bastore\b/g, 'a store');
  s = s.replace(/\ba\s+stor\b/g, 'a store');
  s = s.replace(/\b(stroe|strore|stoer)\b/g, 'store');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Emit structured create-store diagnostic (no secrets).
 * @param {string} event
 * @param {Record<string, unknown>} [payload]
 */
export function emitCreateStoreDiag(event, payload = {}) {
  try {
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info(`[CREATE_STORE] ${event}`, {
        ...payload,
        ts: new Date().toISOString(),
      });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Deterministic match → create_store before model classification.
 *
 * @param {string} rawInput
 * @returns {{
 *   matched: boolean,
 *   intent: 'create_store' | null,
 *   confidence: number,
 *   rawInput: string,
 *   normalizedInput: string,
 *   matchedBy: 'exact' | 'pattern' | null,
 *   requiresExistingStore: false,
 * }}
 */
export function matchCreateStoreIntent(rawInput) {
  const raw = String(rawInput ?? '');
  const normalizedInput = normalizeCreateStoreTypos(raw);
  emitCreateStoreDiag('CREATE_STORE_INTENT_NORMALIZED', {
    rawInput: raw.slice(0, 120),
    normalizedInput: normalizedInput.slice(0, 120),
  });

  if (!normalizedInput) {
    return {
      matched: false,
      intent: null,
      confidence: 0,
      rawInput: raw,
      normalizedInput,
      matchedBy: null,
      requiresExistingStore: false,
    };
  }

  // Reject clear video/creative overlays handled elsewhere — keep contract pure;
  // callers that already video-gated may skip this. Soft: "store video" still store unless
  // pattern is purely create video (not our patterns).

  for (const phrase of CREATE_STORE_EXACT_PHRASES) {
    if (normalizedInput === phrase || normalizedInput.includes(phrase)) {
      const result = {
        matched: true,
        intent: /** @type {'create_store'} */ ('create_store'),
        confidence: 1,
        rawInput: raw,
        normalizedInput,
        matchedBy: /** @type {'exact'} */ ('exact'),
        requiresExistingStore: false,
      };
      emitCreateStoreDiag('CREATE_STORE_INTENT_RESOLVED', {
        ...result,
        rawInput: raw.slice(0, 120),
        normalizedInput: normalizedInput.slice(0, 120),
      });
      return result;
    }
  }

  for (const re of CREATE_STORE_PATTERNS) {
    if (re.test(normalizedInput)) {
      const result = {
        matched: true,
        intent: /** @type {'create_store'} */ ('create_store'),
        confidence: 0.98,
        rawInput: raw,
        normalizedInput,
        matchedBy: /** @type {'pattern'} */ ('pattern'),
        requiresExistingStore: false,
      };
      emitCreateStoreDiag('CREATE_STORE_INTENT_RESOLVED', {
        ...result,
        rawInput: raw.slice(0, 120),
        normalizedInput: normalizedInput.slice(0, 120),
      });
      return result;
    }
  }

  return {
    matched: false,
    intent: null,
    confidence: 0,
    rawInput: raw,
    normalizedInput,
    matchedBy: null,
    requiresExistingStore: false,
  };
}

/**
 * Shared RegExp sources for ontology / greenfield (case-insensitive on raw text).
 */
export const CREATE_STORE_LEGACY_REGEXES = Object.freeze([
  /\b(create|build|set\s+up|make|start|open|launch)\b.{0,24}\b(store|shop|business)\b/i,
  /\bcreate\s+(?:my\s+)?(?:first\s+)?(?:a\s+|new\s+)?(store|shop|business)\b/i,
  /\b(i\s+want\s+to\s+create|can\s+you\s+create)\s+(?:a\s+|my\s+|my\s+first\s+)?(store|shop|business)\b/i,
  /\bnew\s+(store|shop|business)\b/i,
]);
