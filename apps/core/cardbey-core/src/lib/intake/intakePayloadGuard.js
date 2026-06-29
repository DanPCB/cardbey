/**
 * Intake payload size guard — strip heavy client context before planner/memory paths.
 */
import { isDecisionLoopEnabled } from '../../config/features.js';
import { isStoreCreationDraftConfirmationSubmit } from './storeCreationDraft.js';

export const DEFAULT_INTAKE_PAYLOAD_MAX_BYTES = 256 * 1024;

/** Fields required for upload → Ask panel when decision-loop authority is on. */
const DECISION_LOOP_EVIDENCE_KEYS = new Set(['attachments', 'imageDataUrl', 'intentSourceContext']);

const HEAVY_TOP_LEVEL_KEYS = [
  'unifiedMemory',
  'learnedSignals',
  'memorySummary',
  'history',
  'attachments',
  'imageDataUrl',
  'intentSourceContext',
  'blackboardContext',
  'pendingIntent',
  'parameters',
  'metadataJson',
  'posterElements',
];

const HEAVY_CONTEXT_KEYS = [
  'unifiedMemory',
  'learnedSignals',
  'memorySummary',
  'activeStoreId',
  'activeDraftId',
  'activeWebsiteId',
  'activeMissionId',
  'storeId',
  'draftId',
  'posterElements',
  'posterId',
  'pendingSkill',
  'pendingInputs',
];

/**
 * @param {unknown} value
 * @returns {number}
 */
export function estimateJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} obj
 * @param {number} [limit]
 * @returns {Array<{ key: string; bytes: number }>}
 */
export function getTopLevelKeySizes(obj, limit = 12) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj)
    .map(([key, value]) => ({ key, bytes: estimateJsonBytes(value) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

/**
 * @param {Record<string, unknown> | null | undefined} body
 * @returns {boolean}
 */
export function isFreshStoreCreationMission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (body.freshStoreMission === true) return true;
  return (
    isStoreCreationDraftConfirmationSubmit(body) &&
    body._autoSubmit === true &&
    String(body.intent ?? '').trim() === 'create_store'
  );
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
function pickStoreCreateForm(body) {
  const raw =
    body.storeCreateForm && typeof body.storeCreateForm === 'object' && !Array.isArray(body.storeCreateForm)
      ? body.storeCreateForm
      : {};
  const intentMode = String(raw.intentMode ?? 'store').trim().toLowerCase() === 'website' ? 'website' : 'store';
  return {
    storeName: String(raw.storeName ?? raw.businessName ?? '').trim(),
    storeType: String(raw.storeType ?? raw.category ?? raw.businessType ?? '').trim(),
    location: String(raw.location ?? '').trim(),
    intentMode,
  };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
function pickStoreCreationDraft(body) {
  const raw =
    body.storeCreationDraft && typeof body.storeCreationDraft === 'object' && !Array.isArray(body.storeCreationDraft)
      ? body.storeCreationDraft
      : {};
  const missingFields = Array.isArray(raw.missingFields)
    ? raw.missingFields.map((f) => String(f)).filter(Boolean)
    : [];
  return {
    name: String(raw.name ?? raw.storeName ?? '').trim(),
    category: String(raw.category ?? raw.storeType ?? '').trim(),
    location: String(raw.location ?? '').trim(),
    missingFields,
    source: String(raw.source ?? 'chat').trim() || 'chat',
  };
}

/**
 * Slim body for fresh store creation — no memory/history/active store context.
 *
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function normalizeFreshStoreCreationBody(body) {
  const message = String(body.userMessage ?? body.text ?? body.goal ?? body.message ?? '').trim();
  const sessionId = String(body.conversationSessionId ?? body.sessionId ?? '').trim();
  const traceId = String(body.traceId ?? body.cardbeyTraceId ?? '').trim();
  const normalized = {
    message,
    text: message,
    goal: message,
    userMessage: message,
    intent: 'create_store',
    source: 'store_creation_draft',
    intentSource: 'store_creation_draft',
    _autoSubmit: true,
    freshStoreMission: true,
    storeCreateForm: pickStoreCreateForm(body),
    storeCreationDraft: pickStoreCreationDraft(body),
    ...(sessionId ? { conversationSessionId: sessionId, sessionId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(body.locale != null ? { locale: body.locale } : {}),
  };
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (imageDataUrl && imageDataUrl.length > 0 && imageDataUrl.length <= 400_000) {
    normalized.imageDataUrl = imageDataUrl;
  }
  return normalized;
}

/**
 * @param {Record<string, unknown>} body
 * @param {string[]} stripped
 * @returns {Record<string, unknown>}
 */
/**
 * @param {Record<string, unknown>} body
 * @param {string[]} stripped
 * @param {{ preserveLoopEvidence?: boolean }} [options]
 */
export function trimHeavyIntakeFields(body, stripped = [], options = {}) {
  const preserveLoopEvidence = options.preserveLoopEvidence === true;
  const next = { ...body };
  for (const key of HEAVY_TOP_LEVEL_KEYS) {
    if (preserveLoopEvidence && DECISION_LOOP_EVIDENCE_KEYS.has(key)) continue;
    if (key in next) {
      delete next[key];
      stripped.push(key);
    }
  }
  if (next.currentContext && typeof next.currentContext === 'object' && !Array.isArray(next.currentContext)) {
    const ctx = { ...next.currentContext };
    for (const key of HEAVY_CONTEXT_KEYS) {
      if (key in ctx) {
        delete ctx[key];
        stripped.push(`currentContext.${key}`);
      }
    }
    next.currentContext = ctx;
  }
  return next;
}

/**
 * Strip intake-only metadata before create_store dispatch / planner handoff.
 *
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function normalizeCreateStoreDispatchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const stripped = [];
  const slim = trimHeavyIntakeFields(
    {
      message: String(body.message ?? body.userMessage ?? body.text ?? '').trim(),
      storeCreateForm: pickStoreCreateForm(body),
      storeCreationDraft: pickStoreCreationDraft(body),
      freshStoreMission: body.freshStoreMission === true,
      source: String(body.source ?? 'store_creation_draft').trim(),
      _autoSubmit: body._autoSubmit === true,
      ...(body.traceId ? { traceId: body.traceId } : {}),
    },
    stripped,
  );
  return slim;
}

/**
 * @param {unknown} body
 * @param {{ maxBytes?: number }} [options]
 */
export function applyIntakePayloadGuard(body, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_INTAKE_PAYLOAD_MAX_BYTES;
  const input = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  const rawSize = estimateJsonBytes(input);
  const largestKeys = getTopLevelKeySizes(input);
  const stripped = [];

  const freshStoreMission = isFreshStoreCreationMission(input);
  let normalized = input;

  if (freshStoreMission) {
    normalized = normalizeFreshStoreCreationBody(input);
    for (const key of Object.keys(input)) {
      if (!(key in normalized)) stripped.push(key);
    }
  } else if (rawSize > maxBytes) {
    normalized = trimHeavyIntakeFields(input, stripped, {
      preserveLoopEvidence: isDecisionLoopEnabled(),
    });
  }

  const finalSize = estimateJsonBytes(normalized);
  const rejected = !freshStoreMission && finalSize > maxBytes;

  if (stripped.length > 0 || rawSize > 32 * 1024 || freshStoreMission) {
    console.log(
      JSON.stringify({
        evt: 'intake_payload_guard',
        rawSize,
        finalSize,
        freshStoreMission,
        rejected,
        stripped: stripped.slice(0, 24),
        largestKeys: largestKeys.slice(0, 8),
      }),
    );
  }

  return {
    body: normalized,
    freshStoreMission,
    stripped,
    rawSize,
    finalSize,
    rejected,
    maxBytes,
    largestKeys,
  };
}
