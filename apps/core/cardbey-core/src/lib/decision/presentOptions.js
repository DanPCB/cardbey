/**
 * Present-options payloads for decision loop clarify steps.
 */

/**
 * Stamp durable attachment refs onto clarify options so Create store
 * does not depend on ephemeral client memory alone.
 * @param {import('./constants.js').BeliefSnapshot | null | undefined} belief
 */
export function buildUploadAttachmentActionContext(belief) {
  const upload = belief?.lastUpload && typeof belief.lastUpload === 'object' ? belief.lastUpload : null;
  const evidenceId = typeof upload?.evidenceId === 'string' ? upload.evidenceId.trim() : '';
  const attachmentId = typeof upload?.attachmentId === 'string' ? upload.attachmentId.trim() : '';
  const contentHash = typeof upload?.contentHash === 'string' ? upload.contentHash.trim() : '';
  const sourceMessageId =
    typeof upload?.sourceMessageId === 'string' ? upload.sourceMessageId.trim() : '';
  const attachmentIds = [attachmentId, evidenceId].filter(Boolean);
  /** @type {Record<string, unknown>} */
  const ctx = {
    source: 'upload_ask_selection',
    intent: 'create_store',
    type: 'CREATE_STORE_FROM_UPLOAD',
    sourceType: 'business_card',
  };
  if (evidenceId) ctx.evidenceId = evidenceId;
  if (attachmentId) ctx.attachmentId = attachmentId;
  if (contentHash) ctx.contentHash = contentHash;
  if (sourceMessageId) ctx.sourceMessageId = sourceMessageId;
  if (attachmentIds.length) ctx.attachmentIds = attachmentIds;
  if (belief?.sessionId) ctx.conversationId = belief.sessionId;
  if (belief?.sessionKey) ctx.sessionKey = belief.sessionKey;
  return ctx;
}

/**
 * Only claim a read name when it appears in this-turn OCR.
 * @param {import('./constants.js').BeliefLastUpload | null | undefined} upload
 * @returns {string | null}
 */
export function groundedReadNameFromUpload(upload) {
  const name = String(upload?.businessName ?? '').trim();
  const ocr = String(upload?.ocrText ?? '').trim();
  if (!name || !ocr) return null;
  const nameNorm = name.toLowerCase().replace(/\s+/g, ' ');
  const ocrNorm = ocr.toLowerCase().replace(/\s+/g, ' ');
  if (ocrNorm.includes(nameNorm)) return name;
  const tokens = nameNorm.split(' ').filter((t) => t.length > 1);
  if (tokens.length > 0 && tokens.every((t) => ocrNorm.includes(t))) return name;
  return null;
}

const MENU_DOCUMENT_TYPES = new Set(['menu', 'product_catalog', 'price_list']);

/**
 * @param {import('./constants.js').BeliefSnapshot} belief
 */
export function buildUploadGoalOptions(belief) {
  const name = groundedReadNameFromUpload(belief.lastUpload);
  const prefix = name ? `I read ${name} from your upload. ` : 'I see your upload. ';
  const attachmentCtx = buildUploadAttachmentActionContext(belief);
  const sharedParams = { ...attachmentCtx };
  delete sharedParams.intent;
  delete sharedParams.type;

  const createStore = {
    id: 'create_store',
    label: 'Create store',
    tool: 'create_store',
    parameters: { ...attachmentCtx },
  };
  const importCatalog = {
    id: 'import_catalog',
    label: 'Import catalog / menu',
    tool: 'replace_store_catalog',
    parameters: { ...sharedParams, intent: 'import_catalog' },
  };
  const analyzeDocument = {
    id: 'analyze_document',
    label: 'Analyze document',
    tool: 'ingest_asset_for_intent_detection',
    parameters: { ...sharedParams, intent: 'analyze_document' },
  };
  const documentType = String(belief.lastUpload?.documentType ?? '').toLowerCase();
  const options = MENU_DOCUMENT_TYPES.has(documentType)
    ? [importCatalog, createStore, analyzeDocument]
    : [createStore, importCatalog, analyzeDocument];

  return {
    question: `${prefix}What would you like to do next?`,
    options,
  };
}

/**
 * @param {import('./rankHypotheses.js').RankedHypothesis[]} ranked
 * @param {number} limit
 */
export function buildDisambiguationOptions(ranked, limit = 3) {
  return ranked.slice(0, limit).map((row) => ({
    id: row.intent,
    label: row.intent.replace(/_/g, ' '),
    tool: row.suggestedTool,
    parameters: {},
  }));
}
