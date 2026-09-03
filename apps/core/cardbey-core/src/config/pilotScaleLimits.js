/**
 * Pilot scale limits — single reader for cohort / cap env flags (W9).
 * Pattern mirrors GUEST_MAX_DRAFTS in miRoutes.js.
 */

const DEFAULT_PILOT_COHORT_MAX = 12;

/**
 * Max human-review cohort size for Wave 0 / pilot admission.
 * Env: CARDBEY_PILOT_COHORT_MAX (integer ≥ 1). Default 12.
 */
export function getPilotCohortMax(defaultMax = DEFAULT_PILOT_COHORT_MAX) {
  const raw = process.env.CARDBEY_PILOT_COHORT_MAX;
  if (raw == null || String(raw).trim() === '') {
    return defaultMax;
  }
  const parsed = parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultMax;
  }
  return parsed;
}
