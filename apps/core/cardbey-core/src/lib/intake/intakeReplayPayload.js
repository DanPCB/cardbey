/**
 * Lightweight intake replay payloads — reference-only after upload evidence is frozen.
 */

export const HEAVY_UPLOAD_FIELD_KEYS = new Set([
  'imageDataUrl',
  'dataUrl',
  'previewDataUrl',
  'fileData',
  'base64',
  'rawBytes',
  'pendingImageDataUrl',
  'image',
]);

const ATTACHMENT_REF_KEYS = [
  'type',
  'mimeType',
  'mime',
  'filename',
  'name',
  'uploadId',
  'fileAssetId',
  'evidenceId',
  'streamId',
  'attachmentId',
  'artifactType',
  'uri',
];

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isHeavyDataUrl(value) {
  const s = String(value ?? '').trim();
  return s.startsWith('data:') && s.length > 200;
}

/**
 * @param {unknown} att
 * @returns {Record<string, unknown> | null}
 */
export function slimAttachmentRef(att) {
  if (!att || typeof att !== 'object' || Array.isArray(att)) return null;
  /** @type {Record<string, unknown>} */
  const slim = {};
  for (const key of ATTACHMENT_REF_KEYS) {
    if (!(key in att)) continue;
    const value = att[key];
    if (value == null || value === '') continue;
    if (key === 'uri' && isHeavyDataUrl(value)) continue;
    slim[key] = value;
  }
  return Object.keys(slim).length > 0 ? slim : null;
}

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function stripHeavyUploadFieldsDeep(value, depth = 0) {
  if (depth > 10) return null;
  if (value == null) return value;
  if (typeof value === 'string') {
    return isHeavyDataUrl(value) ? undefined : value;
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value
      .map((entry) => stripHeavyUploadFieldsDeep(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (HEAVY_UPLOAD_FIELD_KEYS.has(key)) continue;
    if (key === 'attachments' && Array.isArray(child)) {
      const slimAttachments = child.map((att) => slimAttachmentRef(att)).filter(Boolean);
      if (slimAttachments.length > 0) out.attachments = slimAttachments;
      continue;
    }
    if (key === 'imageAssetId' && isHeavyDataUrl(child)) continue;
    const next = stripHeavyUploadFieldsDeep(child, depth + 1);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

/**
 * @param {Record<string, unknown> | null | undefined} draft
 * @returns {Record<string, unknown> | null | undefined}
 */
export function slimPreseededDraftForReplay(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return draft ?? null;
  const next = { ...draft };
  if (isHeavyDataUrl(next.imageAssetId)) delete next.imageAssetId;
  return next;
}

/**
 * @param {Record<string, unknown> | null | undefined} analysis
 * @returns {Record<string, unknown> | null | undefined}
 */
export function slimAttachmentAnalysisForReplay(analysis) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return analysis ?? null;
  const next = stripHeavyUploadFieldsDeep(analysis);
  if (!next || typeof next !== 'object' || Array.isArray(next)) return null;
  if (next.preseededDraft && typeof next.preseededDraft === 'object') {
    next.preseededDraft = slimPreseededDraftForReplay(
      /** @type {Record<string, unknown>} */ (next.preseededDraft),
    );
  }
  return /** @type {Record<string, unknown>} */ (next);
}

/**
 * @param {unknown} body
 * @returns {boolean}
 */
const LOYALTY_REPLAY_TOOLS = new Set(['setup_loyalty_program', 'create_loyalty_program']);

/**
 * @param {unknown} tool
 */
function isLoyaltyReplayTool(tool) {
  return LOYALTY_REPLAY_TOOLS.has(String(tool ?? '').trim());
}

export function isIntakeSelectionReplay(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const sel = body.intakeV2Selection;
  if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return false;
  const params = sel.selectedParameters;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return false;
  return Boolean(String(params.storeId ?? params.activeStoreId ?? '').trim());
}

/**
 * Skip upload-ask when resuming a clarify chip / store confirm (loyalty replay).
 *
 * @param {unknown} body
 */
export function shouldSkipUploadAskForIntakeSelectionReplay(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const sel = body.intakeV2Selection;
  if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return false;
  const params =
    sel.selectedParameters && typeof sel.selectedParameters === 'object' && !Array.isArray(sel.selectedParameters)
      ? sel.selectedParameters
      : {};
  if (isLoyaltyReplayTool(sel.selectedTool)) return true;
  if (params.confirmedActiveSpace === true) return true;
  const selectionMethod = String(params.selectionMethod ?? '').trim();
  if (selectionMethod === 'active-space' || selectionMethod === 'manual') return true;

  const pending =
    body.pendingIntent && typeof body.pendingIntent === 'object' && !Array.isArray(body.pendingIntent)
      ? body.pendingIntent
      : null;
  if (isLoyaltyReplayTool(pending?.lockedTool ?? pending?.tool ?? pending?.originalTool)) return true;
  if (String(pending?.clarifyType ?? '').trim() === 'active_space_confirm') return true;
  return false;
}

/**
 * @param {unknown} body
 * @returns {boolean}
 */
export function hasFrozenUploadEvidenceRef(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (String(body.evidenceId ?? body.intakeEvidenceId ?? '').trim()) return true;
  const isc =
    body.intentSourceContext && typeof body.intentSourceContext === 'object' && !Array.isArray(body.intentSourceContext)
      ? body.intentSourceContext
      : null;
  if (String(isc?.evidenceId ?? '').trim()) return true;
  const params =
    body.intakeV2Selection &&
    typeof body.intakeV2Selection === 'object' &&
    body.intakeV2Selection.selectedParameters &&
    typeof body.intakeV2Selection.selectedParameters === 'object'
      ? body.intakeV2Selection.selectedParameters
      : null;
  if (String(params?.evidenceId ?? params?.attachmentAnalysis?.evidenceId ?? '').trim()) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function buildIntakeReplayPayloadFromSelection(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  const selection =
    input.intakeV2Selection && typeof input.intakeV2Selection === 'object' && !Array.isArray(input.intakeV2Selection)
      ? { ...input.intakeV2Selection }
      : null;
  const selectedParameters =
    selection?.selectedParameters && typeof selection.selectedParameters === 'object'
      ? { ...selection.selectedParameters }
      : {};

  const selectedStoreId = String(selectedParameters.storeId ?? selectedParameters.activeStoreId ?? '').trim();
  if (selectedStoreId) {
    selectedParameters.storeId = selectedStoreId;
    selectedParameters.activeStoreId = selectedStoreId;
  }

  if (selectedParameters.attachmentAnalysis) {
    selectedParameters.attachmentAnalysis = slimAttachmentAnalysisForReplay(
      /** @type {Record<string, unknown>} */ (selectedParameters.attachmentAnalysis),
    );
  }
  if (selectedParameters.preseededDraft) {
    selectedParameters.preseededDraft = slimPreseededDraftForReplay(
      /** @type {Record<string, unknown>} */ (selectedParameters.preseededDraft),
    );
  }

  const message = String(
    selection?.originalGoal ?? input.userMessage ?? input.text ?? input.goal ?? '',
  ).trim();

  /** @type {Record<string, unknown>} */
  const normalized = {
    userMessage: message,
    text: message,
    goal: message,
    message,
    ...(input.locale != null ? { locale: input.locale } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.conversationSessionId ? { conversationSessionId: input.conversationSessionId } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    intakeV2Selection: {
      selectedTool: String(selection?.selectedTool ?? '').trim(),
      selectedParameters: stripHeavyUploadFieldsDeep(selectedParameters),
      originalGoal: String(selection?.originalGoal ?? message).trim(),
    },
  };

  const evidenceId = String(
    input.evidenceId ??
      input.intakeEvidenceId ??
      selectedParameters.evidenceId ??
      selectedParameters.attachmentAnalysis?.evidenceId ??
      '',
  ).trim();
  const streamId = String(
    input.streamId ?? selectedParameters.streamId ?? selectedParameters.attachmentAnalysis?.streamId ?? '',
  ).trim();

  if (evidenceId) normalized.evidenceId = evidenceId;
  if (streamId) normalized.streamId = streamId;

  const pendingIntent =
    input.pendingIntent && typeof input.pendingIntent === 'object' && !Array.isArray(input.pendingIntent)
      ? stripHeavyUploadFieldsDeep(input.pendingIntent)
      : null;
  if (pendingIntent && typeof pendingIntent === 'object' && !Array.isArray(pendingIntent)) {
    normalized.pendingIntent = pendingIntent;
  }

  const intentSourceContext =
    input.intentSourceContext && typeof input.intentSourceContext === 'object' && !Array.isArray(input.intentSourceContext)
      ? stripHeavyUploadFieldsDeep(input.intentSourceContext)
      : null;
  if (intentSourceContext && typeof intentSourceContext === 'object' && !Array.isArray(intentSourceContext)) {
    normalized.intentSourceContext = {
      ...intentSourceContext,
      uploadedAssetPending: false,
      ...(evidenceId ? { evidenceId } : {}),
      ...(streamId ? { streamId } : {}),
    };
  } else if (evidenceId || streamId) {
    normalized.intentSourceContext = {
      uploadedAssetPending: false,
      ...(evidenceId ? { evidenceId } : {}),
      ...(streamId ? { streamId } : {}),
    };
  }

  return /** @type {Record<string, unknown>} */ (stripHeavyUploadFieldsDeep(normalized));
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ body: Record<string, unknown>; applied: boolean }}
 */
export function normalizeIntakeReplayBody(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  const shouldNormalize = isIntakeSelectionReplay(input) || hasFrozenUploadEvidenceRef(input);
  if (!shouldNormalize) {
    return { body: input, applied: false };
  }
  const normalized = isIntakeSelectionReplay(input)
    ? buildIntakeReplayPayloadFromSelection(input)
    : /** @type {Record<string, unknown>} */ (stripHeavyUploadFieldsDeep(input));
  return { body: normalized, applied: true };
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function estimateJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {number}
 */
export function estimateIntakeReplayPayloadBytes(body) {
  return estimateJsonBytes(normalizeIntakeReplayBody(body).body);
}
