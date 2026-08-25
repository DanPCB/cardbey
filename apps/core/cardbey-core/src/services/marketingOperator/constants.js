/**
 * Facebook Marketing Operator — shared constants.
 * Status strings align with Prisma Marketing* models.
 */

export const CONTENT_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  VALIDATING: 'VALIDATING',
  NEEDS_REVISION: 'NEEDS_REVISION',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SCHEDULED: 'SCHEDULED',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
});

export const INTENTS = Object.freeze({
  AWARENESS: 'awareness',
  EDUCATION: 'education',
  PILOT_INVITE: 'pilot_invite',
  FAQ: 'faq',
  ENGAGEMENT: 'engagement',
  CONVERSION: 'conversion',
});

/**
 * Campaign target type for future Marketing Operations layer.
 * This phase only uses USER_ACQUISITION. INVESTOR_DISCOVERY is reserved — no investor CRM.
 */
export const TARGET_TYPES = Object.freeze({
  USER_ACQUISITION: 'USER_ACQUISITION',
  INVESTOR_DISCOVERY: 'INVESTOR_DISCOVERY',
});

export const RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

export const PERMISSIONS = Object.freeze({
  MARKETING_VIEWER: 'marketing_viewer',
  MARKETING_EDITOR: 'marketing_editor',
  MARKETING_APPROVER: 'marketing_approver',
  MARKETING_PUBLISHER: 'marketing_publisher',
  ENGAGEMENT_OPERATOR: 'engagement_operator',
  MARKETING_ADMINISTRATOR: 'marketing_administrator',
});

export const ALL_MARKETING_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

export const POSITIONING_THEMES = Object.freeze([
  'ai_business_creation_platform',
  'under_development',
  'vietnamese_sme_pilot',
  'build_with_us',
  'early_access',
  'local_first_en_vi',
]);

/** Claims that are allowed in marketing copy (must match capability registry). */
export const ALLOWED_CLAIM_PATTERNS = Object.freeze([
  /under\s+development/i,
  /early\s+access/i,
  /pilot/i,
  /build\s+(cardbey\s+)?with\s+us/i,
  /vietnamese?\s+sme/i,
  /english\s*(and|&|\/)\s*vietnamese/i,
  /ai[- ]?(assisted|powered)?\s*business\s+creation/i,
]);

/** Blocked / high-risk claim patterns — must not appear in approved copy. */
export const BLOCKED_CLAIM_PATTERNS = Object.freeze([
  { id: 'guaranteed_results', pattern: /guaranteed?\s+(results?|roi|revenue|sales)/i, risk: RISK_LEVELS.HIGH },
  { id: 'finished_platform', pattern: /\b(fully\s+finished|production[- ]ready\s+platform|complete\s+platform)\b/i, risk: RISK_LEVELS.HIGH },
  { id: 'autonomous_platform', pattern: /\b(fully\s+autonomous|runs\s+itself|no\s+human\s+needed)\b/i, risk: RISK_LEVELS.HIGH },
  { id: 'global_availability', pattern: /\b(available\s+(worldwide|globally|in\s+all\s+countries)|worldwide\s+launch)\b/i, risk: RISK_LEVELS.HIGH },
  { id: 'fabricated_testimonial', pattern: /\b(customers?\s+say|users?\s+report|#\d+\s+happy\s+customers)\b/i, risk: RISK_LEVELS.CRITICAL },
  { id: 'fabricated_metric', pattern: /\b(\d{2,}%\s+(growth|increase|roi)|millions?\s+of\s+users)\b/i, risk: RISK_LEVELS.CRITICAL },
  { id: 'meta_partnership', pattern: /\b(official\s+meta\s+partner|facebook\s+certified\s+partner)\b/i, risk: RISK_LEVELS.HIGH },
  { id: 'live_verified_false', pattern: /\b(live[- ]verified\s+on\s+facebook|meta[- ]verified\s+operator)\b/i, risk: RISK_LEVELS.CRITICAL },
]);

export const CONVERSION_EVENTS = Object.freeze({
  LANDING_VISIT: 'LANDING_VISIT',
  REGISTRATION: 'REGISTRATION',
  BUSINESS_CREATED: 'BUSINESS_CREATED',
  FIRST_PRODUCT_OR_SERVICE_ADDED: 'FIRST_PRODUCT_OR_SERVICE_ADDED',
  FEEDBACK_SUBMITTED: 'FEEDBACK_SUBMITTED',
  SEVEN_DAY_RETURN: 'SEVEN_DAY_RETURN',
});

/** Legacy lowercase aliases → canonical CONVERSION_EVENTS values. */
export const CONVERSION_EVENT_ALIASES = Object.freeze({
  registration: CONVERSION_EVENTS.REGISTRATION,
  business_created: CONVERSION_EVENTS.BUSINESS_CREATED,
  first_product: CONVERSION_EVENTS.FIRST_PRODUCT_OR_SERVICE_ADDED,
  feedback: CONVERSION_EVENTS.FEEDBACK_SUBMITTED,
  seven_day_return: CONVERSION_EVENTS.SEVEN_DAY_RETURN,
  LANDING_VISIT: CONVERSION_EVENTS.LANDING_VISIT,
  REGISTRATION: CONVERSION_EVENTS.REGISTRATION,
  BUSINESS_CREATED: CONVERSION_EVENTS.BUSINESS_CREATED,
  FIRST_PRODUCT_OR_SERVICE_ADDED: CONVERSION_EVENTS.FIRST_PRODUCT_OR_SERVICE_ADDED,
  FEEDBACK_SUBMITTED: CONVERSION_EVENTS.FEEDBACK_SUBMITTED,
  SEVEN_DAY_RETURN: CONVERSION_EVENTS.SEVEN_DAY_RETURN,
});

/**
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizeConversionEventType(raw) {
  const key = String(raw || '').trim();
  if (!key) return null;
  if (CONVERSION_EVENT_ALIASES[key]) return CONVERSION_EVENT_ALIASES[key];
  const upper = key.toUpperCase();
  if (Object.values(CONVERSION_EVENTS).includes(upper)) return upper;
  return null;
}

/** Canonical event keys for funnel analytics (no aliases). */
export const FUNNEL_STAGES = Object.freeze([
  { key: 'LANDING_VISIT', label: 'Landing visit' },
  { key: 'REGISTRATION', label: 'Registration' },
  { key: 'BUSINESS_CREATED', label: 'Business created' },
  { key: 'FIRST_PRODUCT_OR_SERVICE_ADDED', label: 'First product/service' },
  { key: 'FEEDBACK_SUBMITTED', label: 'Feedback submitted' },
  { key: 'SEVEN_DAY_RETURN', label: 'Seven-day return' },
]);

export const ENGAGEMENT_MOCK_TYPES = Object.freeze([
  'PRODUCT_QUESTION',
  'HOW_TO_START',
  'FEEDBACK',
  'BUG_REPORT',
  'PARTNERSHIP',
  'COMPLAINT',
  'ABUSE_OR_SPAM',
  'PROMPT_INJECTION',
]);

export const PROMPT_VERSION = 'marketing_operator_content_v1';

export const WORKER_LOCK_MS = 60_000;
export const WORKER_MAX_RETRIES = 5;
export const WORKER_BASE_BACKOFF_MS = 5_000;

/** Attribution windows (documented constants). */
export const ATTRIBUTION_WINDOWS = Object.freeze({
  CLICK_DAYS: 7,
  VIEW_DAYS: 1,
});

export const DEFAULT_GRAPH_API_VERSION = 'v21.0';

export function getMetaGraphApiVersion() {
  const raw = String(process.env.META_GRAPH_API_VERSION || '').trim();
  if (!raw) return DEFAULT_GRAPH_API_VERSION;
  return raw.startsWith('v') ? raw : `v${raw}`;
}

export const PILOT_CAMPAIGN_NAME = 'Build Cardbey With Us — Vietnamese SME Pilot';
