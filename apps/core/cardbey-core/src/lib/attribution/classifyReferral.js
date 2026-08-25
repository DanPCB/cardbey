/**
 * First-party referral / UTM classification for marketing attribution.
 * Pure function — no I/O. Used by visit ingest when marketingOperator.attributionV1 is on.
 */

export const ReferralClass = Object.freeze({
  AI_SEARCH: 'AI_SEARCH',
  SOCIAL: 'SOCIAL',
  EMAIL: 'EMAIL',
  PAID: 'PAID',
  ORGANIC_SEARCH: 'ORGANIC_SEARCH',
  DIRECT: 'DIRECT',
  CARDBEY_INTERNAL: 'CARDBEY_INTERNAL',
  UNKNOWN: 'UNKNOWN',
});

const AI_REFERRER_PATTERNS = [
  { pattern: /perplexity\.ai/i, engine: 'perplexity' },
  { pattern: /chatgpt\.com|chat\.openai\.com/i, engine: 'chatgpt' },
  { pattern: /claude\.ai/i, engine: 'claude' },
  { pattern: /gemini\.google\.com/i, engine: 'gemini' },
  { pattern: /bing\.com\/chat|copilot\.microsoft\.com/i, engine: 'bing_copilot' },
  { pattern: /you\.com/i, engine: 'you_com' },
  { pattern: /phind\.com/i, engine: 'phind' },
  { pattern: /kagi\.com/i, engine: 'kagi' },
];

const AI_UTM_SOURCE = /^(ai|llm|ai[._-]?search|assistant|chatgpt|perplexity|claude|gemini)$/i;

/**
 * @param {string | null | undefined} referrer
 * @param {string | null | undefined} utmSource
 * @param {string | null | undefined} utmMedium
 * @returns {{ referralClass: string, aiEngine: string | null, confidence: number }}
 */
export function classifyReferral(referrer, utmSource, utmMedium) {
  const ref = referrer ? String(referrer) : null;
  const source = utmSource ? String(utmSource).trim() : null;
  const medium = utmMedium ? String(utmMedium).trim().toLowerCase() : null;

  if (ref) {
    for (const { pattern, engine } of AI_REFERRER_PATTERNS) {
      if (pattern.test(ref)) {
        return { referralClass: ReferralClass.AI_SEARCH, aiEngine: engine, confidence: 0.95 };
      }
    }
  }

  if (source && AI_UTM_SOURCE.test(source)) {
    return {
      referralClass: ReferralClass.AI_SEARCH,
      aiEngine: source.toLowerCase(),
      confidence: 0.85,
    };
  }

  if (ref && /cardbey\.com/i.test(ref)) {
    return { referralClass: ReferralClass.CARDBEY_INTERNAL, aiEngine: null, confidence: 0.99 };
  }
  if (ref && /(google\.|bing\.|duckduckgo\.|yahoo\.)/i.test(ref)) {
    return { referralClass: ReferralClass.ORGANIC_SEARCH, aiEngine: null, confidence: 0.9 };
  }
  if (medium === 'email') {
    return { referralClass: ReferralClass.EMAIL, aiEngine: null, confidence: 0.9 };
  }
  if (medium === 'cpc' || medium === 'paid' || medium === 'ppc') {
    return { referralClass: ReferralClass.PAID, aiEngine: null, confidence: 0.9 };
  }
  if (ref && /(facebook\.|instagram\.|tiktok\.|linkedin\.|twitter\.|x\.com)/i.test(ref)) {
    return { referralClass: ReferralClass.SOCIAL, aiEngine: null, confidence: 0.85 };
  }
  if (!ref && !source) {
    return { referralClass: ReferralClass.DIRECT, aiEngine: null, confidence: 0.75 };
  }

  return { referralClass: ReferralClass.UNKNOWN, aiEngine: null, confidence: 0.5 };
}
