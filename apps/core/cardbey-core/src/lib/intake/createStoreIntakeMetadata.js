/**
 * create_store intake metadata — body/envelope fields that must not be validated as tool parameters.
 * `source` is intake routing metadata, not store business data.
 */

/** @type {ReadonlySet<string>} */
export const CREATE_STORE_INTAKE_SOURCE_VALUES = new Set([
  'store_creation_draft',
  'create_store_form',
  'business_card',
  'asset_panel',
  'chat',
  'performer_pill',
  'manual',
]);

/**
 * Keys stripped from `classification.parameters` before strict create_store schema validation.
 * Includes reasoner aliases normalized elsewhere and runtime/body spillover.
 */
export const CREATE_STORE_INTAKE_METADATA_PARAM_KEYS = [
  'source',
  'sourceType',
  'intent',
  'message',
  'intentLabel',
  'intentText',
  'storeCreationDraft',
  'storeCreateForm',
  'assetAction',
  'assetIngestResult',
  'imageDataUrl',
  'attachments',
  'context',
  'runwayContext',
  'workspaceId',
  'traceId',
  'storeId',
  'missionId',
  'tenantId',
  'deviceId',
  'pipelineId',
  'stepId',
  'draftId',
  'clientRequestId',
  'requestId',
  'evidenceId',
  'attachmentId',
  'attachmentIds',
  'contentHash',
  'fromAskSelection',
  'cardExtraction',
  'storeCandidate',
  '_performerMode',
  '_performerSource',
  '_manualAction',
  // classifier / legacy aliases (mapped then removed)
  'name',
  'businessName',
  'category',
  'businessType',
  'type',
  'city',
  'address',
  'region',
];

/** @type {ReadonlySet<string>} */
export const STORE_CREATE_FORM_ALLOWED_KEYS = new Set([
  'storeName',
  'businessName',
  'storeType',
  'category',
  'businessType',
  'location',
  'intentMode',
  'websiteUrl',
  'website',
  'phone',
  'email',
]);

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isCreateStoreIntakeMetadataParamKey(key) {
  return CREATE_STORE_INTAKE_METADATA_PARAM_KEYS.includes(String(key ?? '').trim());
}

/**
 * @param {unknown} source
 * @returns {{ field: string; reason: string; message: string } | null}
 */
export function validateCreateStoreIntakeSource(source) {
  if (source == null || source === '') return null;
  const s = String(source).trim();
  if (!s) return null;
  if (CREATE_STORE_INTAKE_SOURCE_VALUES.has(s)) return null;
  return {
    field: 'source',
    reason: 'invalid_intake_source',
    message: `Unknown intake source: ${s}`,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} form
 * @returns {string[]}
 */
export function findUnknownStoreCreateFormFields(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return [];
  return Object.keys(form).filter((key) => !STORE_CREATE_FORM_ALLOWED_KEYS.has(key));
}

/**
 * @param {Record<string, unknown>} parameters
 * @returns {Record<string, unknown>}
 */
export function stripCreateStoreIntakeMetadataFromParameters(parameters) {
  const p =
    parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? { ...parameters } : {};
  for (const key of CREATE_STORE_INTAKE_METADATA_PARAM_KEYS) {
    if (key in p) delete p[key];
  }
  return p;
}
