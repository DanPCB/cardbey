/**
 * Deterministic system shortcuts only.
 *
 * Phase 5B removed store-setup regex fast-paths from Intake V2 classification.
 * Store creation detection is owned by IntentReasoner + storeCreateFastPath.
 * `primaryMode` / frontscreen handoff forces a create-store shortcut (then message wins for runway).
 */

import { classifyStoreWebsiteCreateIntent } from './storeWebsiteRunwayClassifier.js';
import { validateStoreCreationFields } from './intakeErrorTypes.js';
import { findUnknownStoreCreateFormFields } from './createStoreIntakeMetadata.js';

const STORE_CREATE_PRIMARY_MODES = new Set(['create', 'website', 'store_setup']);

const CREATE_RUNWAY_CLARIFY_MESSAGE =
  'Do you want an online store with products, or a mini website / landing page? Pick one to continue.';

function resolvePrimaryMode(input) {
  const pm = String(input?.primaryMode ?? input?.primaryModeHint ?? '')
    .trim()
    .toLowerCase();
  return pm || null;
}

/** @param {unknown} form */
/**
 * Validates create-store / mini-website payload before dispatching the pipeline or tool runner.
 *
 * @param {Record<string, unknown>} payload
 * @returns {Array<{ field: string; message: string }>}
 */
export function validateCreateStorePayload(payload = {}) {
  const errors = [];
  const envelope =
    payload?.storeCreateForm && typeof payload.storeCreateForm === 'object' && !Array.isArray(payload.storeCreateForm)
      ? payload.storeCreateForm
      : null;
  if (envelope) {
    for (const field of findUnknownStoreCreateFormFields(envelope)) {
      errors.push({
        field: `storeCreateForm.${field}`,
        message: `Unknown store field: ${field}`,
        code: 'UNKNOWN_STORE_FIELD',
      });
    }
  }
  return [
    ...errors,
    ...validateStoreCreationFields(payload).map(({ field, message, code, suggestion, errorAction }) => ({
      field,
      message,
      ...(code ? { code } : {}),
      ...(suggestion ? { suggestion } : {}),
      ...(errorAction ? { errorAction } : {}),
    })),
  ];
}

function storeCreateFormShortcut(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return null;
  const storeName = String(/** @type {Record<string, unknown>} */ (form).storeName ?? '').trim();
  if (!storeName) return null;
  const mode = String(/** @type {Record<string, unknown>} */ (form).intentMode ?? '')
    .trim()
    .toLowerCase();
  return {
    type: 'create_store',
    intentMode: mode === 'website' ? 'website' : 'store',
  };
}

/**
 * @param {object} input
 * @param {string} input.userMessage
 * @param {string} [input.primaryMode]
 * @param {string} [input.primaryModeHint]
 * @param {string} [input.intentSource]
 * @param {object} [input.storeCreateForm]
 * @param {{ userId?: string | null, isGuest?: boolean }} input.auth
 * @returns {
 *   | { type: 'create_store', intentMode: 'store'|'website', intentLabel?: string }
 *   | { type: 'clarify_create_runway', message: string }
 *   | { type: 'auth_required', message: string }
 *   | { type: 'missing_store', message: string }
 *   | null
 * }
 */
export function detectIntent(input) {
  const formShortcut = storeCreateFormShortcut(input?.storeCreateForm);
  if (formShortcut) return formShortcut;

  const raw = String(input?.userMessage ?? '').trim();
  if (!raw) return null;

  const primaryMode = resolvePrimaryMode(input);
  const intentSource = String(input?.intentSource ?? '')
    .trim()
    .toLowerCase();
  const runway = classifyStoreWebsiteCreateIntent(raw);

  if (primaryMode === 'website') {
    return { type: 'create_store', intentMode: 'website', intentLabel: 'create_mini_website' };
  }

  if (primaryMode === 'store_setup') {
    return {
      type: 'create_store',
      intentMode: runway.intentMode === 'website' ? 'website' : 'store',
      ...(runway.label ? { intentLabel: runway.label } : {}),
    };
  }

  if (primaryMode === 'create' || (intentSource === 'frontscreen' && primaryMode === 'create')) {
    if (runway.ambiguous) {
      return { type: 'clarify_create_runway', message: CREATE_RUNWAY_CLARIFY_MESSAGE };
    }
    if (runway.intentMode) {
      return {
        type: 'create_store',
        intentMode: runway.intentMode,
        ...(runway.label ? { intentLabel: runway.label } : {}),
      };
    }
    return { type: 'clarify_create_runway', message: CREATE_RUNWAY_CLARIFY_MESSAGE };
  }

  return null;
}

/**
 * Completed store-build missions must not restart create_store from chip/chat follow-ups.
 *
 * @param {string | null | undefined} missionStatus
 * @param {string | null | undefined} resolvedTool
 * @returns {{ tool: 'general_chat', confidence: number } | null}
 */
export function blockCreateStoreOnCompletedMission(missionStatus, resolvedTool) {
  const status = String(missionStatus ?? '').trim().toLowerCase();
  const tool = String(resolvedTool ?? '').trim();
  if (status === 'completed' && tool === 'create_store') {
    return { tool: 'general_chat', confidence: 0.5 };
  }
  return null;
}

const POSTER_TRIGGERS = [
  'create.*poster',
  'make.*poster',
  'design.*poster',
  'promotional.*poster',
  'create.*flyer',
  'make.*flyer',
  'social.*post',
  'instagram.*post',
  'marketing.*material',
];

/** Promotion graphic / promo image — routes to create_promotion_graphic (not campaign runway). */
export const PROMOTION_GRAPHIC_INTENT_RE =
  /\b(create|make|generate|design)\b[\s\S]{0,48}\b(promotion|promo)\b[\s\S]{0,24}\b(graphic|image|visual|banner|artwork)\b|\b(promotion|promo)\b[\s\S]{0,24}\b(graphic|image|visual)\b|\bcreate\s+a\s+promotion\s+graphic\b/i;

/**
 * @param {string | null | undefined} userMessage
 * @returns {boolean}
 */
export function isPromotionGraphicIntent(userMessage) {
  const text = String(userMessage ?? '').trim();
  if (!text || !PROMOTION_GRAPHIC_INTENT_RE.test(text)) return false;
  if (/\blaunch\s+(a\s+)?campaign\b/i.test(text)) return false;
  return true;
}

/**
 * Detect AI promotion graphic intent — one-shot image + copy + Content Studio canvas.
 *
 * @param {string} userMessage
 * @param {string | null | undefined} activeStoreId
 * @returns {{ tool: 'create_promotion_graphic', executionPath: 'proactive_plan', confidence: number, params: { storeId: string, prompt: string, description: string } } | null}
 */
export function detectPromotionGraphicIntent(userMessage, activeStoreId) {
  const text = String(userMessage ?? '').trim();
  const storeId = typeof activeStoreId === 'string' ? activeStoreId.trim() : '';
  if (!text || !storeId || !isPromotionGraphicIntent(text)) return null;

  return {
    tool: 'create_promotion_graphic',
    executionPath: 'proactive_plan',
    confidence: 0.95,
    params: {
      storeId,
      prompt: text,
      description: text,
    },
  };
}

/** Desktop / SuperCopilot control — not C-Net signage device listing. */
const DEVICE_TRIGGERS = [
  /\bdevice\s+control\b/i,
  /\buse the device\b/i,
  /\bopen .+ on (my )?(computer|screen|machine)\b/i,
  /\bcontrol (my )?(computer|screen|device)\b/i,
  /\btype .+ (on|in) notepad\b/i,
  /\bopen notepad\b/i,
  /\bclick .+ on (my )?(screen|computer)\b/i,
  /\b(on|in) (my )?(computer|machine)\b/i,
];

const SIGNAGE_DEVICE_LIST_RE =
  /\b(list|show|what|which|paired)\b.*\b(screens?|displays?|tvs?)\b/i;

/**
 * SuperCopilot desktop control (device.sendInput) — deterministic shortcut before LLM classifier.
 *
 * @param {string} userMessage
 * @returns {{ tool: 'device.sendInput', executionPath: 'direct_action', confidence: number, params: { task: string } } | null}
 */
export function detectDeviceIntent(userMessage) {
  const text = String(userMessage ?? '').trim();
  if (!text) return null;
  if (SIGNAGE_DEVICE_LIST_RE.test(text)) return null;

  const matched = DEVICE_TRIGGERS.some((pattern) => pattern.test(text));
  if (!matched) return null;

  const task = text.replace(/^use the device (to )?/i, '').trim() || text;
  return {
    tool: 'device.sendInput',
    executionPath: 'direct_action',
    confidence: 0.95,
    params: { task },
  };
}

/**
 * Detect poster / flyer creation intent for Performer direct_action.
 *
 * @param {string} userMessage
 * @param {string | null | undefined} activeStoreId
 * @returns {{ tool: 'generate_poster', executionPath: 'direct_action', confidence: number, params: { storeId: string, posterType: string } } | null}
 */
export function detectPosterIntent(userMessage, activeStoreId) {
  const text = String(userMessage ?? '').trim();
  const storeId = typeof activeStoreId === 'string' ? activeStoreId.trim() : '';
  if (!text || !storeId) return null;

  const isPosterIntent = POSTER_TRIGGERS.some((pattern) => new RegExp(pattern, 'i').test(text));
  if (!isPosterIntent) return null;

  return {
    tool: 'generate_poster',
    executionPath: 'direct_action',
    confidence: 0.9,
    params: {
      storeId,
      posterType: text.includes('story') ? 'story' : text.includes('offer') ? 'offer' : 'promotional',
    },
  };
}

const POSTER_EDIT_TRIGGERS =
  /\b(change|update|swap|replace|edit|make)\b.*\b(title|subtitle|headline|image|photo|background|color|font)\b/i;

/**
 * @param {string} userMessage
 * @param {boolean} hasPosterContext — e.g. prior poster elements in request body
 */
export function detectPosterEditIntent(userMessage, hasPosterContext) {
  const text = String(userMessage ?? '').trim();
  if (!text || !hasPosterContext) return null;
  if (!POSTER_EDIT_TRIGGERS.test(text)) return null;
  return {
    tool: 'mutate_poster',
    executionPath: 'direct_action',
    confidence: 0.88,
    params: { instruction: text },
  };
}
