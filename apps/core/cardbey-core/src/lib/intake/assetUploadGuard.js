/**
 * Upload intake guard — attachment uploads must not imply user intent.
 */

import { isGraphicOrPromotionIntent } from './intentDetectors.js';
import { peekPendingDocumentExtraction } from './storeCandidate.js';
import { isCasualChatTurn } from './intakeCasualChatTurn.js';
import { isIntakeConfirmAffirmation } from './intakeConfirmIntercept.js';

/** Tools that require an existing store or draft — invalid for upload-only store creation. */
export const STORE_CHECK_TOOLS_WITHOUT_CONTEXT = new Set([
  'validate_store_context',
  'validate_store_input',
  'analyze_store',
  'store_health_check',
  'existing_store_review',
]);

/** User explicitly wants a new store seeded from a recent upload (not an existing store check). */
export const CREATE_STORE_FROM_UPLOADED_ASSET_PATTERNS = [
  /create\s+(?:a\s+)?store\s+from\s+(?:the\s+)?upload(?:ed)?\s+(?:card|image|photo|document|menu|file)/i,
  /create\s+(?:a\s+)?store\s+from\s+(?:this|the)\s+(?:card|image|photo|document|menu|upload|business\s+card)/i,
  /create\s+(?:a\s+)?store\s+from\s+(?:uploaded|attached)\b/i,
  /create\s+(?:a\s+)?store\s+(?:form\s+)?(?:the\s+)?upload(?:ed)?\s+(?:card|image|business\s+card)\b/i,
  /create\s+(?:a\s+)?store\s+(?:from\s+)?(?:the\s+)?(?:card|image)\s+above\b/i,
  /(?:card|image|business\s+card)\s+above\b.*create\s+(?:a\s+)?store/i,
  /build\s+(?:a\s+)?store\s+from\s+(?:this|the|upload|uploaded|attached)/i,
  /store\s+from\s+(?:this|the|upload|uploaded)\s+(?:business\s+)?card/i,
  /make\s+(?:a\s+)?store\s+from\s+(?:this|the|upload|uploaded)\s+(?:card|image|menu)/i,
];

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
 * Upload + explicit create-store or create-website wording (not attachment-only placeholders).
 * Rule 2: card/menu/image + this intent → OCR + auto-fill store draft (skip ask step).
 * @param {string} message
 */
export function hasExplicitUploadCreateStoreOrWebsiteIntent(message) {
  const msg = String(message ?? '').trim();
  if (!msg || isAttachmentOnlyPlaceholderMessage(msg)) return false;
  return detectCreateStoreFromUploadedAssetIntent(msg) || detectExplicitStoreIntent(msg);
}

/**
 * Attachment evidence on the intake turn (body, handoff context, or session stash).
 * @param {object} [ctx]
 */
export function hasUploadAttachmentEvidence(ctx = {}) {
  if (Array.isArray(ctx.attachments) && ctx.attachments.length > 0) return true;
  if (String(ctx.imageDataUrl ?? '').trim()) return true;
  const isc =
    ctx.intentSourceContext && typeof ctx.intentSourceContext === 'object'
      ? ctx.intentSourceContext
      : null;
  if (String(isc?.pendingImageDataUrl ?? '').trim()) return true;
  if (isc?.assetIngestResult || isc?.storeCandidate || isc?.documentExtraction || isc?.cardExtraction) {
    return true;
  }
  if (ctx.hasSessionPendingExtraction) return true;
  const sessionId = String(ctx.sessionId ?? '').trim();
  if (sessionId && peekPendingDocumentExtraction(sessionId)) return true;
  return false;
}

/**
 * Explicit create-store from upload (message wording or Ask-panel assetAction handoff).
 * @param {{ userMessage?: string; intentSourceContext?: Record<string, unknown> | null }} [opts]
 */
export function isExplicitCreateStoreFromUploadContext(opts = {}) {
  const msg = String(opts.userMessage ?? '').trim();
  if (isAttachmentOnlyPlaceholderMessage(msg)) return false;
  if (hasExplicitUploadCreateStoreOrWebsiteIntent(msg)) return true;
  const isc =
    opts.intentSourceContext && typeof opts.intentSourceContext === 'object'
      ? opts.intentSourceContext
      : null;
  if (String(isc?.assetAction ?? '').trim() === 'create_store') return true;
  if (String(isc?.fromAskSelection ?? '').trim() === 'create_store') return true;
  return false;
}

/**
 * Rule 1: document uploaded without clear chat intent → read + ask before next step.
 * @param {string} message
 * @param {{ attachments?: unknown[]; imageDataUrl?: string | null; intentSourceContext?: Record<string, unknown> | null; sessionId?: string | null; hasSessionPendingExtraction?: boolean }} [ctx]
 */
export function isUploadWithoutClearUserIntent(message, ctx = {}) {
  const msg = String(message ?? '').trim();
  if (isCasualChatTurn(msg) || isIntakeConfirmAffirmation(msg)) return false;
  if (!hasUploadAttachmentEvidence(ctx)) return false;
  if (isGraphicOrPromotionIntent(message)) return false;
  if (detectExplicitAssetIntent(message)) return false;
  if (hasExplicitUploadCreateStoreOrWebsiteIntent(message)) return false;
  return isAttachmentOnlyPlaceholderMessage(message) || Boolean(msg);
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
  const msg = String(message ?? '').trim();
  if (isCasualChatTurn(msg) || isIntakeConfirmAffirmation(msg)) return false;
  return isUploadWithoutClearUserIntent(message, ctx);
}

/**
 * True when the user asked to create a store from an uploaded card/image/menu/document.
 * @param {string} message
 */
export function detectCreateStoreFromUploadedAssetIntent(message) {
  const msg = String(message ?? '').trim();
  if (!msg || isAttachmentOnlyPlaceholderMessage(msg)) return false;
  return CREATE_STORE_FROM_UPLOADED_ASSET_PATTERNS.some((pattern) => pattern.test(msg));
}

/**
 * Recent upload evidence in the current intake turn (body, handoff context, or session stash).
 * @param {object} [ctx]
 */
export function hasRecentUploadedAssetInContext(ctx = {}) {
  return hasUploadAttachmentEvidence(ctx);
}

/**
 * Route upload → analyze → StoreCandidate before any store-detail check.
 * @param {object} opts
 */
export function shouldAnalyzeUploadedAssetForStoreCreation(opts = {}) {
  const userMessage = String(opts.userMessage ?? '').trim();
  const explicitCreate = isExplicitCreateStoreFromUploadContext({
    userMessage,
    intentSourceContext: opts.intentSourceContext,
  });
  const hasAsset = hasRecentUploadedAssetInContext(opts);
  if (!explicitCreate && !opts.forceAssetStoreCreation) return false;
  if (!hasAsset) return false;
  return true;
}

/**
 * Store-check tools are invalid when no store/draft exists and the user is creating from an upload.
 * @param {string} tool
 * @param {object} opts
 */
export function shouldBlockStoreCheckWithoutContext(tool, opts = {}) {
  const t = String(tool ?? '').trim();
  if (!STORE_CHECK_TOOLS_WITHOUT_CONTEXT.has(t)) return false;
  const storeId = String(opts.storeId ?? '').trim();
  const draftId = String(opts.draftId ?? '').trim();
  if (storeId || draftId) return false;
  if (!hasRecentUploadedAssetInContext(opts)) return false;
  return (
    detectCreateStoreFromUploadedAssetIntent(opts.userMessage) ||
    opts.forceAssetStoreCreation === true
  );
}

/**
 * create_store must not return an empty draft when an upload still needs ingest/OCR.
 * @param {{
 *   userMessage?: string;
 *   classificationTool?: string;
 *   draftConfirmationSubmit?: boolean;
 *   storeFormSubmit?: boolean;
 *   hasMeaningfulExtraction?: boolean;
 *   attachments?: unknown[];
 *   imageDataUrl?: string | null;
 *   intentSourceContext?: Record<string, unknown> | null;
 *   sessionId?: string | null;
 *   hasSessionPendingExtraction?: boolean;
 * }} opts
 */
export function shouldDeferCreateStoreDraftForAssetIngest(opts = {}) {
  if (opts.draftConfirmationSubmit || opts.storeFormSubmit) return false;
  if (shouldRouteToAssetIntentDetection(opts.userMessage, opts)) return true;
  if (shouldAnalyzeUploadedAssetForStoreCreation(opts)) return true;
  if (
    String(opts.classificationTool ?? '').trim() === 'create_store' &&
    hasRecentUploadedAssetInContext(opts) &&
    opts.hasMeaningfulExtraction === false
  ) {
    return true;
  }
  return false;
}
