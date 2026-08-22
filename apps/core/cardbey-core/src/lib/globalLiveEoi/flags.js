/**
 * Global Live EOI confirmation + tracking feature flags (default OFF for new surfaces).
 */

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

export function isEoiConfirmationEmailV2Enabled() {
  return parseBool(process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2, false);
}

export function isEoiApplicantTrackingEnabled() {
  return parseBool(process.env.ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1, false);
}
