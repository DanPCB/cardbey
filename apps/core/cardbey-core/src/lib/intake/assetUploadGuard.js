/**
 * Upload intake guard — attachment uploads must not imply user intent.
 */

import { isGraphicOrPromotionIntent } from './intentDetectors.js';

const PLACEHOLDER_MESSAGES = new Set([
  '(image attached)',
  '(files attached)',
  'business card image attached — continue intake',
  'image attached',
  'files attached',
]);

const EXPLICIT_INTENT_PATTERNS = [
  { intent: 'create_store', patterns: [/create\s+(a\s+)?store/i, /build\s+(a\s+)?store/i, /set\s+up\s+(a\s+)?store/i, /open\s+(a\s+)?store/i, /store\s+from\s+this/i] },
  { intent: 'import_catalog', patterns: [/import\s+(the\s+)?(catalog|menu|products)/i, /import\s+these\s+products/i, /add\s+(these\s+)?products/i, /menu\s+import/i] },
  { intent: 'setup_loyalty_program', patterns: [/loyalty\s+program/i, /setup\s+loyalty/i, /rewards?\s+program/i, /stamp\s+card/i] },
  { intent: 'launch_campaign', patterns: [/launch\s+(a\s+)?campaign/i, /create\s+(a\s+)?campaign/i, /promo(tion)?\s+from\s+this/i, /marketing\s+campaign/i] },
  {
    intent: 'create_promotion_graphic',
    patterns: [
      /create\s+a?\s*(promotion|promo)\s*(graphic|image|visual|banner|poster)/i,
      /promotion\s*(graphic|image|visual)/i,
      /promo\s*(graphic|image|visual)/i,
      /graphic\s*for\s*(promotion|store|collection)/i,
      /design\s*a?\s*(promotion|promo)\s*(graphic|image)/i,
      /marketing\s*(graphic|visual|image)/i,
    ],
  },
  { intent: 'analyze_document', patterns: [/analyze\s+(this\s+)?(document|business|store)/i, /audit\s+/i, /review\s+this\s+(document|file)/i] },
  { intent: 'save_to_suitcase', patterns: [/save\s+to\s+suitcase/i, /store\s+in\s+suitcase/i, /keep\s+in\s+vault/i] },
  { intent: 'ingest_document', patterns: [/ingest\s+(this\s+)?(document|flyer|brochure)/i, /scan\s+this\s+(flyer|brochure|document)/i, /read\s+this\s+(flyer|document)/i] },
];

/**
 * @param {string} message
 * @returns {string | null}
 */
export function detectExplicitAssetIntent(message) {
  const msg = String(message ?? '').trim();
  if (!msg || isAttachmentOnlyPlaceholderMessage(msg)) return null;
  for (const { intent, patterns } of EXPLICIT_INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(msg))) return intent;
  }
  return null;
}

/** Explicit create-store wording in the user's own message (not OCR placeholders). */
const EXPLICIT_STORE_INTENT_PATTERNS = [
  /create\s+(a\s+)?store/i,
  /set\s+up\s+(a\s+)?store/i,
  /make\s+(a\s+)?store/i,
  /build\s+(a\s+)?store/i,
  /build\s+my\s+store/i,
  /start\s+(a\s+)?store/i,
  /open\s+(a\s+)?store/i,
  /new\s+store/i,
  /store\s+creation/i,
  /launch\s+store/i,
  /create\s+(a\s+)?(mini\s*)?(website|site)\b/i,
  /build\s+(a\s+)?(website|site)\b/i,
];

/**
 * True when the user explicitly asked to create a store/website (gates _autoSubmit on uploads).
 * @param {string} message
 */
export function detectExplicitStoreIntent(message) {
  const msg = String(message ?? '').trim();
  if (!msg || isAttachmentOnlyPlaceholderMessage(msg)) return false;
  if (detectExplicitAssetIntent(msg) === 'create_store') return true;
  return EXPLICIT_STORE_INTENT_PATTERNS.some((pattern) => pattern.test(msg));
}

/**
 * Gates create_store pipeline _autoSubmit — uploads without explicit store wording stay manual.
 * @param {{ userMessage?: string, hasAttachment?: boolean, storeFormEnvelope?: unknown }} opts
 */
export function shouldAutoSubmitCreateStoreClassification(opts = {}) {
  const { userMessage, hasAttachment, storeFormEnvelope } = opts;
  if (storeFormEnvelope && typeof storeFormEnvelope === 'object' && !Array.isArray(storeFormEnvelope)) {
    return true;
  }
  if (!hasAttachment) return true;
  return detectExplicitStoreIntent(userMessage);
}

/**
 * @param {string} message
 */
export function isAttachmentOnlyPlaceholderMessage(message) {
  const normalized = String(message ?? '').trim().toLowerCase();
  if (!normalized) return true;
  if (PLACEHOLDER_MESSAGES.has(normalized)) return true;
  return false;
}

/**
 * @param {string} message
 * @param {{ attachments?: unknown[]; imageDataUrl?: string | null }} [ctx]
 */
export function shouldRouteToAssetIntentDetection(message, ctx = {}) {
  const hasAttachment =
    (Array.isArray(ctx.attachments) && ctx.attachments.length > 0) ||
    Boolean(ctx.imageDataUrl?.trim());
  if (!hasAttachment) return false;
  if (isGraphicOrPromotionIntent(message)) return false;
  if (detectExplicitAssetIntent(message)) return false;
  return isAttachmentOnlyPlaceholderMessage(message);
}
