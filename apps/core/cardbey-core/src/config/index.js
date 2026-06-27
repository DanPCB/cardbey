/**
 * Central configuration — env-backed defaults with safe fallbacks.
 */

/**
 * @param {unknown} value
 * @returns {'manual' | 'automation'}
 */
function normalizePerformerMode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'manual' || normalized === 'automation') return normalized;
  return 'automation';
}

export const config = {
  performer: {
    /** Default intake mode when header/body omit mode (automation = full reasoning pipeline). */
    defaultMode: normalizePerformerMode(process.env.PERFORMER_DEFAULT_MODE),
  },
};

export default config;
