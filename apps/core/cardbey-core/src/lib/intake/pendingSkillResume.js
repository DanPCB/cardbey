// DANH: skill-round6-document
/**
 * Preserve skill context across store-clarification turns (document ingestion).
 */

export const PENDING_SKILL_DOCUMENT_INGESTION = 'document_ingestion';

const DOCUMENT_PENDING_KEYS = [
  'documentUrl',
  'documentBase64',
  'mimeType',
  'imageUrl',
  'imageDataUrl',
];

/**
 * @param {Record<string, unknown> | null | undefined} inputs
 * @returns {Record<string, unknown>}
 */
export function pickDocumentPendingInputs(inputs) {
  const src = inputs && typeof inputs === 'object' && !Array.isArray(inputs) ? inputs : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of DOCUMENT_PENDING_KEYS) {
    const v = src[key];
    if (v != null && v !== '') out[key] = v;
  }
  return out;
}

/**
 * @param {string} pendingSkill
 * @param {Record<string, unknown>} pendingInputs
 */
export function buildPendingSkillMissionContext(pendingSkill, pendingInputs) {
  return {
    pendingSkill,
    pendingInputs: pickDocumentPendingInputs(pendingInputs),
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} sources
 * @returns {{ pendingSkill: string, pendingInputs: Record<string, unknown> } | null}
 */
export function readPendingSkillContext(sources) {
  if (!sources || typeof sources !== 'object') return null;

  const bags = [
    sources,
    sources.missionContext,
    sources.runwayContext,
    sources.blackboardContext,
    sources.currentContext,
    sources.pendingIntent,
  ].filter((b) => b && typeof b === 'object' && !Array.isArray(b));

  for (const bag of bags) {
    const pendingSkill = String(bag.pendingSkill ?? '').trim();
    if (!pendingSkill) continue;
    const pendingInputs = pickDocumentPendingInputs(
      bag.pendingInputs && typeof bag.pendingInputs === 'object' ? bag.pendingInputs : {},
    );
    return { pendingSkill, pendingInputs };
  }
  return null;
}

/**
 * @param {{
 *   isSelectionConfirm?: boolean;
 *   intakeV2Selection?: unknown;
 *   pendingSkillContext?: { pendingSkill?: string } | null;
 *   resolvedStoreId?: string | null;
 * }} opts
 */
export function isPendingSkillClarificationReply(opts) {
  if (opts?.isSelectionConfirm) return true;
  if (opts?.intakeV2Selection && typeof opts.intakeV2Selection === 'object') return true;
  if (opts?.pendingSkillContext?.pendingSkill && opts?.resolvedStoreId) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} pendingInputs
 * @param {string} storeId
 */
export function resumeDocumentIngestionClassification(pendingInputs, storeId) {
  const sid = String(storeId ?? '').trim();
  return {
    executionPath: 'direct_action',
    tool: 'ingest_document',
    confidence: 0.98,
    parameters: {
      storeId: sid,
      ...pickDocumentPendingInputs(pendingInputs),
    },
    _fastPath: 'document_ingestion_resume',
    _pendingSkillResume: true,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} classification
 * @param {{ userMessage?: string } | null | undefined} pendingIntentBase
 */
export function enrichPendingIntentForDocumentIngestion(classification, pendingIntentBase) {
  const tool = String(classification?.tool ?? '').trim();
  if (tool !== 'ingest_document' && tool !== 'scan_document') {
    return pendingIntentBase ?? { userMessage: '' };
  }
  const pendingInputs = pickDocumentPendingInputs(classification?.parameters);
  if (!Object.keys(pendingInputs).length) {
    return pendingIntentBase ?? { userMessage: '' };
  }
  return {
    ...(pendingIntentBase && typeof pendingIntentBase === 'object' ? pendingIntentBase : {}),
    pendingSkill: PENDING_SKILL_DOCUMENT_INGESTION,
    pendingInputs,
  };
}

/**
 * Merge pending document inputs into forced selection parameters.
 * @param {Record<string, unknown>} forcedParams
 * @param {{ pendingSkill?: string, pendingInputs?: Record<string, unknown> } | null} pendingCtx
 */
export function mergePendingDocumentIntoForcedParams(forcedParams, pendingCtx) {
  if (pendingCtx?.pendingSkill !== PENDING_SKILL_DOCUMENT_INGESTION) {
    return forcedParams;
  }
  const pendingInputs = pickDocumentPendingInputs(pendingCtx.pendingInputs);
  if (!Object.keys(pendingInputs).length) return forcedParams;
  return {
    ...pendingInputs,
    ...forcedParams,
    storeId: forcedParams.storeId ?? forcedParams.activeStoreId ?? pendingInputs.storeId,
  };
}
