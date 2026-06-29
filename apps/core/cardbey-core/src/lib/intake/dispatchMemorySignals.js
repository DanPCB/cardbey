/**
 * Memory signal helpers for backend dispatch planning (mirrors dashboard memorySignals).
 */

export const MEMORY_SIGNAL_KEYS = {
  LOW_ENGAGEMENT: 'low_engagement',
  PROFILE_INCOMPLETE: 'profile_incomplete',
  CAMPAIGN_FAILED_RECENTLY: 'campaign_failed_recently',
  REQUIRES_CONFIRMATION: 'requires_confirmation',
  HIGH_INTENT: 'high_intent',
  EXIT_INTENT: 'exit_intent',
  FIRST_TIME_USER: 'first_time_user',
  TIME_PRESSURE: 'time_pressure',
  POWER_USER: 'power_user',
};

/**
 * @param {unknown} value
 */
export function normalizeSignalToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * @param {unknown[] | undefined} signals
 * @param {string} key
 */
export function hasLearnedSignal(signals, key) {
  const token = normalizeSignalToken(key);
  if (!Array.isArray(signals) || !token) return false;
  return signals.some((s) => normalizeSignalToken(s) === token);
}

/**
 * @param {Record<string, unknown> | null | undefined} bundle
 */
export function collectLearnedSignals(bundle) {
  const out = [];
  const session = bundle?.session;
  if (session && typeof session === 'object' && Array.isArray(session.learnedSignals)) {
    out.push(...session.learnedSignals);
  }
  const business = bundle?.business;
  if (business && typeof business === 'object' && Array.isArray(business.learnedSignals)) {
    out.push(...business.learnedSignals);
  }
  return out.map(normalizeSignalToken).filter(Boolean);
}
