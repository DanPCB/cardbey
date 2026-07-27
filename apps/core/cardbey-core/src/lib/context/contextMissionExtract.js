/**
 * Extract store/campaign IDs from mission pipeline records and outputs.
 */

/**
 * @param {unknown} value
 */
function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} value
 */
function asTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * @param {{
 *   targetId?: string | null;
 *   targetType?: string | null;
 *   type?: string | null;
 *   metadataJson?: unknown;
 *   outputsJson?: unknown;
 * }} pipeline
 * @param {Record<string, unknown>} [result]
 */
export function extractStoreIdFromMission(pipeline, result = {}) {
  const outputs = { ...asObject(pipeline?.outputsJson), ...asObject(result) };
  const meta = asObject(pipeline?.metadataJson);
  const ssb = asObject(outputs.structured_store_build);
  const metaResult = asObject(meta.result);

  const targetId = asTrimmedString(pipeline?.targetId);
  const fromTarget =
    targetId && targetId !== 'temp' && (pipeline?.targetType === 'store' || pipeline?.targetType === 'draft_store')
      ? targetId
      : null;

  return (
    fromTarget ||
    asTrimmedString(outputs.storeId) ||
    asTrimmedString(ssb.storeId) ||
    asTrimmedString(ssb.businessId) ||
    asTrimmedString(outputs.committedStoreId) ||
    asTrimmedString(outputs.businessId) ||
    asTrimmedString(meta.storeId) ||
    asTrimmedString(metaResult.storeId) ||
    asTrimmedString(result.storeId) ||
    asTrimmedString(asObject(result.result).storeId) ||
    asTrimmedString(asObject(result.output).storeId) ||
    null
  );
}

/**
 * @param {{
 *   metadataJson?: unknown;
 *   outputsJson?: unknown;
 * }} pipeline
 * @param {Record<string, unknown>} [result]
 */
export function extractDraftIdFromMission(pipeline, result = {}) {
  const outputs = { ...asObject(pipeline?.outputsJson), ...asObject(result) };
  const meta = asObject(pipeline?.metadataJson);
  const ssb = asObject(outputs.structured_store_build);

  return (
    asTrimmedString(outputs.draftId) ||
    asTrimmedString(outputs.draftStoreId) ||
    asTrimmedString(ssb.draftId) ||
    asTrimmedString(ssb.draftStoreId) ||
    asTrimmedString(meta.draftId) ||
    asTrimmedString(result.draftId) ||
    asTrimmedString(asObject(result.result).draftId) ||
    null
  );
}

/**
 * @param {unknown} guestSessionId
 */
export function normalizeGuestSessionId(guestSessionId) {
  const raw = asTrimmedString(guestSessionId);
  if (!raw) return null;
  return raw.startsWith('guest_') ? raw : `guest_${raw}`;
}

/**
 * @param {{
 *   targetId?: string | null;
 *   targetType?: string | null;
 *   metadataJson?: unknown;
 *   outputsJson?: unknown;
 * }} pipeline
 * @param {Record<string, unknown>} [result]
 */
export function extractCampaignIdFromMission(pipeline, result = {}) {
  const outputs = { ...asObject(pipeline?.outputsJson), ...asObject(result) };
  const meta = asObject(pipeline?.metadataJson);

  const targetId = asTrimmedString(pipeline?.targetId);
  const fromTarget = targetId && pipeline?.targetType === 'campaign' ? targetId : null;

  return (
    fromTarget ||
    asTrimmedString(outputs.campaignId) ||
    asTrimmedString(meta.campaignId) ||
    asTrimmedString(result.campaignId) ||
    asTrimmedString(asObject(result.result).campaignId) ||
    null
  );
}

/**
 * @param {unknown} metadataJson
 */
export function sessionIdFromMissionMetadata(metadataJson) {
  const meta = asObject(metadataJson);
  const sid = meta.sessionId ?? meta.conversationSessionId ?? meta.contextSessionId;
  return asTrimmedString(sid);
}
