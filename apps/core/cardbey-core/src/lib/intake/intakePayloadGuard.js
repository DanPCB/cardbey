/**
 * Intake payload size guard — strip heavy client context before planner/memory paths.
 */
import { isDecisionLoopEnabled } from '../../config/features.js';
import { isStoreCreationDraftConfirmationSubmit } from './storeCreationDraft.js';
import {
  normalizeIntakeReplayBody,
  stripHeavyUploadFieldsDeep,
} from './intakeReplayPayload.js';

export const DEFAULT_INTAKE_PAYLOAD_MAX_BYTES = 256 * 1024;

/** Upload turns with loop evidence may carry a compressed image — higher ceiling after slimming. */
export const DECISION_LOOP_UPLOAD_PAYLOAD_MAX_BYTES = 512 * 1024;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUsableImageRef(value) {
  const s = String(value ?? '').trim();
  return s.length > 20;
}

const SLIM_INTENT_SOURCE_KEYS = [
  'pendingImageDataUrl',
  'imageDataUrl',
  'cardExtraction',
  'uploadedAssetPending',
  'assetAction',
  'fromAskSelection',
  'type',
  'storeCandidate',
  'documentExtraction',
  'workflowContext',
  // Phase 2: STORE_WEBSITE template selection → generation foundation
  'websiteTemplateId',
  'websiteTemplateSlug',
  'websiteTemplateName',
  'baseWebsiteTemplate',
];

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
    websiteUrl: String(raw.websiteUrl ?? raw.website ?? '').trim(),
    phone: String(raw.phone ?? '').trim(),
    email: String(raw.email ?? '').trim(),
  };
}

/**
 * Prefer explicit form fields, then client OCR / storeCandidate handoff.
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function seedStoreCreateFormFromUploadContext(body) {
  const base = pickStoreCreateForm(body);
  const isc =
    body.intentSourceContext && typeof body.intentSourceContext === 'object' && !Array.isArray(body.intentSourceContext)
      ? /** @type {Record<string, unknown>} */ (body.intentSourceContext)
      : {};
  const currentImage = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
  const ctxImage = String(isc.pendingImageDataUrl ?? isc.imageDataUrl ?? '').trim();
  const candidate =
    isc.storeCandidate && typeof isc.storeCandidate === 'object' && !Array.isArray(isc.storeCandidate)
      ? /** @type {Record<string, unknown>} */ (isc.storeCandidate)
      : {};
  const candidateImage = String(candidate.imageDataUrl ?? '').trim();
  // Reject unscoped / mismatched OCR handoff when this turn has upload pixels.
  // No context image fingerprint ⇒ do not trust cardExtraction (may be prior PTH).
  const identityImage = candidateImage || ctxImage;
  const identityOk =
    !currentImage ||
    (Boolean(identityImage) &&
      identityImage.length === currentImage.length &&
      identityImage.slice(0, 96) === currentImage.slice(0, 96) &&
      identityImage.slice(-48) === currentImage.slice(-48));
  const card =
    identityOk &&
    isc.cardExtraction &&
    typeof isc.cardExtraction === 'object' &&
    !Array.isArray(isc.cardExtraction)
      ? /** @type {Record<string, unknown>} */ (isc.cardExtraction)
      : {};
  const safeCandidate = identityOk ? candidate : {};
  return {
    storeName:
      base.storeName ||
      String(card.businessName ?? card.name ?? safeCandidate.businessName ?? safeCandidate.name ?? '').trim(),
    location:
      base.location ||
      String(card.location ?? safeCandidate.location ?? safeCandidate.city ?? safeCandidate.suburb ?? '').trim(),
    storeType:
      base.storeType ||
      String(card.vertical ?? card.category ?? safeCandidate.category ?? safeCandidate.businessType ?? '').trim(),
    intentMode: base.intentMode,
    websiteUrl:
      base.websiteUrl ||
      String(
        card.website ??
          card.websiteUrl ??
          safeCandidate.website ??
          safeCandidate.websiteUrl ??
          '',
      ).trim(),
    phone:
      base.phone ||
      String(card.phone ?? safeCandidate.phone ?? '').trim(),
    email:
      base.email ||
      String(card.email ?? safeCandidate.email ?? '').trim(),
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
/**
 * Ask → Create store: keep upload runway markers. Do not force hollow draft confirmation
 * (`_autoSubmit` + empty storeCreateForm) — that 400s MISSING_* before OCR/draft projection.
 *
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function normalizeCreateStoreFromUploadBody(body) {
  const message = String(body.userMessage ?? body.text ?? body.goal ?? body.message ?? '').trim();
  const sessionId = String(body.conversationSessionId ?? body.sessionId ?? '').trim();
  const traceId = String(body.traceId ?? body.cardbeyTraceId ?? '').trim();
  const seeded = seedStoreCreateFormFromUploadContext(body);
  const hasSeed = Boolean(seeded.storeName || seeded.location || seeded.storeType);
  const normalized = {
    message,
    text: message,
    goal: message,
    userMessage: message,
    intent: 'create_store',
    action: 'create_store',
    source: String(body.source ?? 'performer').trim() || 'performer',
    intentSource: String(body.intentSource ?? 'business_card').trim() || 'business_card',
    freshStoreMission: true,
    ...(hasSeed ? { storeCreateForm: seeded } : {}),
    ...(sessionId ? { conversationSessionId: sessionId, sessionId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(body.locale != null ? { locale: body.locale } : {}),
  };
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (imageDataUrl && imageDataUrl.length > 0 && imageDataUrl.length <= 400_000) {
    normalized.imageDataUrl = imageDataUrl;
  }
  if (body.intakeV2Selection && typeof body.intakeV2Selection === 'object' && !Array.isArray(body.intakeV2Selection)) {
    normalized.intakeV2Selection = stripHeavyUploadFieldsDeep(body.intakeV2Selection);
  }
  const intentSourceContext = slimIntentSourceContextForLoop(body.intentSourceContext);
  if (intentSourceContext) {
    normalized.intentSourceContext = intentSourceContext;
  }
  Object.assign(normalized, pickWebsiteTemplateFields(body));
  return normalized;
}

/**
 * Preserve selected STORE_WEBSITE template through fresh-store slim body.
 * Adaptive path: no websiteTemplateId → empty object (unchanged behaviour).
 *
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
function pickWebsiteTemplateFields(body) {
  const params =
    body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
      ? /** @type {Record<string, unknown>} */ (body.parameters)
      : {};
  const isc =
    body.intentSourceContext &&
    typeof body.intentSourceContext === 'object' &&
    !Array.isArray(body.intentSourceContext)
      ? /** @type {Record<string, unknown>} */ (body.intentSourceContext)
      : {};
  const id = String(
    body.websiteTemplateId ?? params.websiteTemplateId ?? isc.websiteTemplateId ?? '',
  ).trim();
  if (!id) return {};
  const slug = String(
    body.websiteTemplateSlug ??
      params.baseWebsiteTemplateSlug ??
      isc.websiteTemplateSlug ??
      '',
  ).trim();
  const name = String(isc.websiteTemplateName ?? body.websiteTemplateName ?? '').trim();
  return {
    websiteTemplateId: id,
    ...(slug ? { websiteTemplateSlug: slug } : {}),
    ...(name ? { websiteTemplateName: name } : {}),
    parameters: {
      websiteTemplateId: id,
      baseWebsiteTemplate: id,
      ...(slug ? { baseWebsiteTemplateSlug: slug } : {}),
    },
  };
}

export function normalizeFreshStoreCreationBody(body) {
  const message = String(body.userMessage ?? body.text ?? body.goal ?? body.message ?? '').trim();
  const sessionId = String(body.conversationSessionId ?? body.sessionId ?? '').trim();
  const traceId = String(body.traceId ?? body.cardbeyTraceId ?? '').trim();
  const websiteTpl = pickWebsiteTemplateFields(body);
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
    ...websiteTpl,
  };
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (imageDataUrl && imageDataUrl.length > 0 && imageDataUrl.length <= 400_000) {
    normalized.imageDataUrl = imageDataUrl;
  }
  // Ask → Create store sends freshStoreMission + selection. Keep skip-Ask signals;
  // stripping them re-opens Upload Ask and stalls the draft runway.
  if (body.intakeV2Selection && typeof body.intakeV2Selection === 'object' && !Array.isArray(body.intakeV2Selection)) {
    normalized.intakeV2Selection = stripHeavyUploadFieldsDeep(body.intakeV2Selection);
  }
  const intentSourceContext = slimIntentSourceContextForLoop(body.intentSourceContext);
  if (intentSourceContext) {
    normalized.intentSourceContext = intentSourceContext;
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasIntakeUploadEvidence(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (isUsableImageRef(body.imageDataUrl)) return true;
  if (Array.isArray(body.attachments) && body.attachments.length > 0) return true;
  const isc = body.intentSourceContext;
  if (isc && typeof isc === 'object' && !Array.isArray(isc)) {
    if (isUsableImageRef(isc.pendingImageDataUrl)) return true;
    if (isUsableImageRef(isc.imageDataUrl)) return true;
  }
  return false;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown> | undefined}
 */
function slimIntentSourceContextForLoop(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const slim = {};
  for (const key of SLIM_INTENT_SOURCE_KEYS) {
    if (raw[key] !== undefined) slim[key] = raw[key];
  }
  return Object.keys(slim).length > 0 ? slim : undefined;
}

/**
 * Minimal intake body for upload + decision loop — drops history/memory bloat, keeps image evidence.
 *
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function normalizeDecisionLoopUploadBody(body) {
  const message = String(body.userMessage ?? body.text ?? body.goal ?? body.message ?? '').trim();
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 1) : [];
  let intentSourceContext = slimIntentSourceContextForLoop(body.intentSourceContext);

  if (intentSourceContext && isUsableImageRef(imageDataUrl)) {
    const pending = String(intentSourceContext.pendingImageDataUrl ?? '').trim();
    if (pending === imageDataUrl) {
      const next = { ...intentSourceContext };
      delete next.pendingImageDataUrl;
      delete next.imageDataUrl;
      intentSourceContext = Object.keys(next).length > 0 ? next : undefined;
    }
  }

  const normalized = {
    userMessage: message,
    text: message,
    goal: message,
    message,
    ...(body.locale != null ? { locale: body.locale } : {}),
    ...(body.sessionId ? { sessionId: body.sessionId } : {}),
    ...(body.conversationSessionId ? { conversationSessionId: body.conversationSessionId } : {}),
    ...(body.mode ? { mode: body.mode } : {}),
    ...(body.intakeV2Selection && typeof body.intakeV2Selection === 'object'
      ? {
          intakeV2Selection: stripHeavyUploadFieldsDeep(body.intakeV2Selection),
        }
      : {}),
    ...(intentSourceContext ? { intentSourceContext } : {}),
  };

  if (isUsableImageRef(imageDataUrl)) {
    normalized.imageDataUrl = imageDataUrl;
  } else if (attachments.length > 0) {
    normalized.attachments = attachments;
  }

  return normalized;
}

/**
 * @param {Record<string, unknown>} body
 * @param {string[]} stripped
 * @returns {Record<string, unknown>}
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
  const input = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  const uploadEvidence = hasIntakeUploadEvidence(input);
  const decisionLoopUpload =
    isDecisionLoopEnabled() && uploadEvidence && !isFreshStoreCreationMission(input);

  let maxBytes =
    options.maxBytes ??
    (uploadEvidence || decisionLoopUpload
      ? DECISION_LOOP_UPLOAD_PAYLOAD_MAX_BYTES
      : DEFAULT_INTAKE_PAYLOAD_MAX_BYTES);

  const rawSize = estimateJsonBytes(input);
  const largestKeys = getTopLevelKeySizes(input);
  const stripped = [];

  const freshStoreMission = isFreshStoreCreationMission(input);
  let normalized = input;

  const replayNormalized = normalizeIntakeReplayBody(normalized);
  if (replayNormalized.applied) {
    normalized = replayNormalized.body;
    for (const key of Object.keys(input)) {
      if (!(key in normalized)) stripped.push(key);
    }
  }

  if (!replayNormalized.applied) {
    if (freshStoreMission) {
      normalized = normalizeFreshStoreCreationBody(input);
      for (const key of Object.keys(input)) {
        if (!(key in normalized)) stripped.push(key);
      }
    } else if (uploadEvidence && rawSize > DEFAULT_INTAKE_PAYLOAD_MAX_BYTES) {
      normalized = normalizeDecisionLoopUploadBody(input);
      for (const key of Object.keys(input)) {
        if (!(key in normalized)) stripped.push(key);
      }
    } else if (rawSize > maxBytes) {
      normalized = trimHeavyIntakeFields(input, stripped, {
        preserveLoopEvidence: uploadEvidence || isDecisionLoopEnabled(),
      });
    }
  } else if (estimateJsonBytes(normalized) > maxBytes) {
    normalized = trimHeavyIntakeFields(normalized, stripped, {
      preserveLoopEvidence: false,
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
