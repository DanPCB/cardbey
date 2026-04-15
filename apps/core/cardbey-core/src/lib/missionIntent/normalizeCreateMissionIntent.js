/**
 * POST /api/mi/missions/:missionId/intents — normalize request body to a canonical internal shape.
 * missionId is taken only from the route; body.missionId is ignored.
 */

import {
  DEFAULT_INTENT_SOURCE,
  INTENT_MESSAGE_MAX_LENGTH,
  isStructuredMissionIntentPayload,
  legacyPayloadKeyBucket,
} from './missionIntentPayloadKeys.js';

function isNonProduction() {
  return process.env.NODE_ENV !== 'production';
}

function trimOptionalString(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function readPlainObject(v) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  return v;
}

function warnMessageTruncated(intentType) {
  if (!isNonProduction()) return;
  console.warn('[MI Intents] intent payload message truncated to INTENT_MESSAGE_MAX_LENGTH', {
    route: 'POST /api/mi/missions/:missionId/intents',
    intentType,
    maxLen: INTENT_MESSAGE_MAX_LENGTH,
  });
}

/**
 * @typedef {Object} NormalizedMissionIntent
 * @property {string} missionId
 * @property {string} userId
 * @property {string} type
 * @property {string | null} agent
 * @property {string} source
 * @property {string} [message]
 * @property {{ storeId?: string, draftId?: string, generationRunId?: string, campaignId?: string }} contextRefs
 * @property {{ entityType?: string, entityId?: string, productId?: string, productName?: string, categoryId?: string, categoryLabel?: string }} entityRefs
 * @property {Record<string, unknown>} metadata
 * @property {'legacy_flat' | 'structured'} payloadShape
 * @property {boolean} [messageTruncated]
 * @property {boolean} hadPayloadObject
 * @property {boolean} explicitSourceProvided
 */

/**
 * @param {object} opts
 * @param {string} opts.missionId
 * @param {string} opts.userId
 * @param {unknown} opts.body
 * @returns {{ ok: true, normalized: NormalizedMissionIntent } | { ok: false, status: number, error: string, message: string }}
 */
export function normalizeCreateMissionIntentRequest({ missionId, userId, body }) {
  const b = body != null && typeof body === 'object' && !Array.isArray(body) ? body : {};

  const typeRaw = b.type;
  const type = typeof typeRaw === 'string' && typeRaw.trim() ? typeRaw.trim() : null;
  if (!type) {
    return {
      ok: false,
      status: 400,
      error: 'type_required',
      message: 'Intent type is required',
    };
  }

  const agentRaw = b.agent;
  const agent =
    typeof agentRaw === 'string' && agentRaw.trim() ? agentRaw.trim() : null;

  const rawPayload = b.payload;
  const payloadIsObject =
    rawPayload != null && typeof rawPayload === 'object' && !Array.isArray(rawPayload);
  const payload = payloadIsObject ? rawPayload : null;
  const hadPayloadObject = Boolean(payload);

  /** @type {'legacy_flat' | 'structured'} */
  let payloadShape = 'legacy_flat';
  const contextRefs = {};
  const entityRefs = {};
  /** @type {Record<string, unknown>} */
  const metadata = {};
  let message;
  let source = DEFAULT_INTENT_SOURCE;
  let messageTruncated = false;
  let explicitSourceProvided = false;

  if (payload && isStructuredMissionIntentPayload(payload)) {
    payloadShape = 'structured';

    const ctx = readPlainObject(payload.context);
    if (ctx) {
      const sId = trimOptionalString(ctx.storeId);
      const dId = trimOptionalString(ctx.draftId);
      const gId = trimOptionalString(ctx.generationRunId);
      const cId = trimOptionalString(ctx.campaignId);
      if (sId !== undefined) contextRefs.storeId = sId;
      if (dId !== undefined) contextRefs.draftId = dId;
      if (gId !== undefined) contextRefs.generationRunId = gId;
      if (cId !== undefined) contextRefs.campaignId = cId;
    }

    const ent = readPlainObject(payload.entity);
    if (ent) {
      const entityType = trimOptionalString(ent.entityType);
      const entityId = trimOptionalString(ent.entityId);
      const productId = trimOptionalString(ent.productId);
      const productName = trimOptionalString(ent.productName);
      const categoryId = trimOptionalString(ent.categoryId);
      const categoryLabel = trimOptionalString(ent.categoryLabel);
      if (entityType !== undefined) entityRefs.entityType = entityType;
      if (entityId !== undefined) entityRefs.entityId = entityId;
      if (productId !== undefined) entityRefs.productId = productId;
      if (productName !== undefined) entityRefs.productName = productName;
      if (categoryId !== undefined) entityRefs.categoryId = categoryId;
      if (categoryLabel !== undefined) entityRefs.categoryLabel = categoryLabel;
    }

    const meta = readPlainObject(payload.metadata);
    if (meta) {
      for (const [k, v] of Object.entries(meta)) {
        if (v !== undefined) metadata[k] = v;
      }
    }

    const src = trimOptionalString(payload.source);
    if (src !== undefined) {
      source = src;
      explicitSourceProvided = true;
    }

    const rawMsg = payload.message;
    if (rawMsg != null && String(rawMsg).trim() !== '') {
      const full = String(rawMsg).trim();
      if (full.length > INTENT_MESSAGE_MAX_LENGTH) {
        warnMessageTruncated(type);
        message = full.slice(0, INTENT_MESSAGE_MAX_LENGTH);
        messageTruncated = true;
      } else {
        message = full;
      }
    }

    const reserved = new Set(['version', 'context', 'entity', 'metadata', 'message', 'source']);
    for (const key of Object.keys(payload)) {
      if (reserved.has(key)) continue;
      if (payload[key] !== undefined) {
        metadata[key] = payload[key];
      }
    }
  } else if (payload) {
    payloadShape = 'legacy_flat';
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'missionId') continue;
      if (value === undefined) continue;

      const bucket = legacyPayloadKeyBucket(key);
      if (bucket === 'context') {
        const t = trimOptionalString(value);
        if (t !== undefined) contextRefs[key] = t;
      } else if (bucket === 'entity') {
        if (key === 'entityType') {
          const t = value;
          if (t != null && String(t).trim() !== '') {
            entityRefs.entityType = String(t).trim();
          }
        } else {
          const t = trimOptionalString(value);
          if (t !== undefined) entityRefs[key] = t;
        }
      } else if (bucket === 'core' && key === 'source') {
        const t = trimOptionalString(value);
        if (t !== undefined) {
          source = t;
          explicitSourceProvided = true;
        }
      } else if (bucket === 'core' && key === 'message') {
        const full = String(value).trim();
        if (full !== '') {
          if (full.length > INTENT_MESSAGE_MAX_LENGTH) {
            warnMessageTruncated(type);
            message = full.slice(0, INTENT_MESSAGE_MAX_LENGTH);
            messageTruncated = true;
          } else {
            message = full;
          }
        }
      } else {
        metadata[key] = value;
      }
    }
  }

  /** @type {NormalizedMissionIntent} */
  const normalized = {
    missionId: typeof missionId === 'string' ? missionId.trim() : String(missionId),
    userId: typeof userId === 'string' ? userId.trim() : String(userId),
    type,
    agent,
    source,
    contextRefs,
    entityRefs,
    metadata,
    payloadShape,
    hadPayloadObject,
    explicitSourceProvided,
  };
  if (message !== undefined) {
    normalized.message = message;
  }
  if (messageTruncated) {
    normalized.messageTruncated = true;
  }

  return { ok: true, normalized };
}

export { INTENT_MESSAGE_MAX_LENGTH, DEFAULT_INTENT_SOURCE } from './missionIntentPayloadKeys.js';
