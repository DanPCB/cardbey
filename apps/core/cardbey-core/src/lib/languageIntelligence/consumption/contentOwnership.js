/**
 * Content ownership — routes chrome vs business-owned vs conversation consumption.
 */

export const CONTENT_OWNERSHIP = Object.freeze([
  'system_ui',
  'business_owned',
  'campaign',
  'conversation',
  'crm_note',
  'storefront_public',
  'ai_suggestion',
  'notification',
]);

export const CONTENT_OWNERSHIP_SET = new Set(CONTENT_OWNERSHIP);

/**
 * Business-owned classes must never be auto-translated by chrome language toggles.
 */
export const REQUIRES_EXPLICIT_OPT_IN = Object.freeze([
  'business_owned',
  'campaign',
  'conversation',
  'crm_note',
  'storefront_public',
]);

/**
 * Public / latency-sensitive surfaces: generation off by default.
 */
export const DEFAULT_ALLOW_GENERATE = Object.freeze({
  system_ui: false,
  business_owned: false,
  campaign: false,
  conversation: true, // on-read OK when user opts into auto-translate
  crm_note: false,
  storefront_public: false,
  ai_suggestion: false,
  notification: false,
});

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isContentOwnership(value) {
  return CONTENT_OWNERSHIP_SET.has(String(value ?? ''));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function assertContentOwnership(value) {
  const v = String(value ?? '');
  if (!isContentOwnership(v)) {
    throw new Error(`[languageIntelligence.consumption] Invalid contentOwnership: ${v}`);
  }
  return v;
}

/**
 * @param {string} ownership
 * @returns {boolean}
 */
export function requiresExplicitOptIn(ownership) {
  return REQUIRES_EXPLICIT_OPT_IN.includes(ownership);
}

/**
 * @param {string} ownership
 * @returns {boolean}
 */
export function defaultAllowGenerate(ownership) {
  return Boolean(DEFAULT_ALLOW_GENERATE[ownership]);
}
