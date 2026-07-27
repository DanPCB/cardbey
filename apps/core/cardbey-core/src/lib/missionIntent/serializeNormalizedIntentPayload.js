/**
 * Phase 1: flatten normalized intent back to legacy-compatible JSON for IntentRequest.payload.
 * First-class fields win over metadata on key conflicts (apply metadata first, then overlays).
 */

/**
 * Emit `source` when it adds information the old verbatim path would not have had empty-only objects,
 * or when the client used structured payloads / explicit source / any non-empty payload signal.
 * @param {object} normalized
 * @returns {boolean}
 */
function shouldPersistSource(normalized) {
  if (normalized.explicitSourceProvided) return true;
  if (normalized.payloadShape === 'structured') return true;
  if (normalized.message) return true;
  const c = normalized.contextRefs || {};
  if (Object.keys(c).length > 0) return true;
  const e = normalized.entityRefs || {};
  if (Object.keys(e).length > 0) return true;
  const m = normalized.metadata || {};
  if (Object.keys(m).length > 0) return true;
  return false;
}

/**
 * @param {object} normalized NormalizedMissionIntent from normalizeCreateMissionIntentRequest
 * @returns {Record<string, unknown> | null}
 */
export function serializeNormalizedIntentPayload(normalized) {
  if (!normalized.hadPayloadObject) {
    return null;
  }

  const out = {};

  if (normalized.metadata && typeof normalized.metadata === 'object') {
    for (const [k, v] of Object.entries(normalized.metadata)) {
      if (v !== undefined) {
        out[k] = v;
      }
    }
  }

  const { message } = normalized;
  if (message != null && message !== '') {
    out.message = message;
  }

  const ctx = normalized.contextRefs || {};
  if (ctx.storeId != null && ctx.storeId !== '') out.storeId = ctx.storeId;
  if (ctx.draftId != null && ctx.draftId !== '') out.draftId = ctx.draftId;
  if (ctx.generationRunId != null && ctx.generationRunId !== '') out.generationRunId = ctx.generationRunId;
  if (ctx.campaignId != null && ctx.campaignId !== '') out.campaignId = ctx.campaignId;

  const ent = normalized.entityRefs || {};
  if (ent.entityType != null && ent.entityType !== '') out.entityType = ent.entityType;
  if (ent.entityId != null && ent.entityId !== '') out.entityId = ent.entityId;
  if (ent.productId != null && ent.productId !== '') out.productId = ent.productId;
  if (ent.productName != null && ent.productName !== '') out.productName = ent.productName;
  if (ent.categoryId != null && ent.categoryId !== '') out.categoryId = ent.categoryId;
  if (ent.categoryLabel != null && ent.categoryLabel !== '') out.categoryLabel = ent.categoryLabel;

  if (shouldPersistSource(normalized)) {
    out.source = normalized.source;
  }

  if (Object.keys(out).length === 0) {
    return {};
  }
  return out;
}
