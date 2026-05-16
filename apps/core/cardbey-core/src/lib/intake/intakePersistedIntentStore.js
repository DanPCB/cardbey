/**
 * In-memory TTL store for last resolved Performer Intake V2 intent (mission- or context-scoped).
 * No cross-tenant / cross-actor leakage; keys are composite.
 */

import { resolveIntakeV2ActorKey, resolveIntakeV2TenantKey } from './intakeV2ActorContext.js';

export const PERSISTED_INTENT_TTL_MS = 45 * 60 * 1000;

/** Ontology score threshold: ~3 pattern hits — explicit new task vs referential follow-up. */
export const STRONG_ONTOLOGY_SCORE = 6;

/** @type {Map<string, object>} */
const store = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [k, row] of store.entries()) {
    if (row.expiresAt <= now) store.delete(k);
  }
}

/**
 * @param {string | null | undefined} actorKey
 * @param {string | null | undefined} tenantKey
 * @param {string | null | undefined} missionId
 * @param {string | null | undefined} storeId
 * @param {string | null | undefined} draftId
 */
export function makePersistedIntentStorageKey(actorKey, tenantKey, missionId, storeId, draftId) {
  const a = String(actorKey ?? '').trim() || '_';
  const t = String(tenantKey ?? '').trim() || '_';
  const m = String(missionId ?? '').trim();
  if (m) return `${a}\x1f${t}\x1fm:${m}`;
  const s = String(storeId ?? '').trim() || '_';
  const d = String(draftId ?? '').trim() || '_';
  return `${a}\x1f${t}\x1fc:${s}\x1f${d}`;
}

/**
 * @param {object | null | undefined} row
 * @param {{ storeId?: string | null, draftId?: string | null }} ctx
 */
export function persistedIntentRowValidForRequest(row, ctx) {
  if (!row || typeof row !== 'object') return false;
  if (typeof row.updatedAt !== 'string') return false;
  const ts = Date.parse(row.updatedAt);
  if (Number.isNaN(ts) || Date.now() - ts > PERSISTED_INTENT_TTL_MS) return false;
  const storeId = ctx?.storeId ?? null;
  const draftId = ctx?.draftId ?? null;
  if (row.storeId != null && storeId != null && String(row.storeId) !== String(storeId)) return false;
  if (row.draftStoreId != null && draftId != null && String(row.draftStoreId) !== String(draftId)) return false;
  return true;
}

/**
 * @typedef {object} PersistedIntentResolution
 * @property {string | null} family
 * @property {string | null} subtype
 * @property {string | null} chosenTool
 * @property {string | null} [executionPath]
 * @property {string} updatedAt
 * @property {string | null} [missionId]
 * @property {string | null} [storeId]
 * @property {string | null} [draftStoreId]
 * @property {string} [source]
 */

/**
 * @param {{ actorKey: string | null, tenantKey: string, missionId?: string | null, storeId?: string | null, draftId?: string | null }} args
 * @returns {PersistedIntentResolution | null}
 */
export function getPersistedIntentResolution(args) {
  pruneExpired();
  const actorKey = String(args?.actorKey ?? '').trim();
  const tenantKey = String(args?.tenantKey ?? '').trim() || 'unknown';
  if (!actorKey) return null;
  const missionId = args?.missionId ?? null;
  const storeId = args?.storeId ?? null;
  const draftId = args?.draftId ?? null;

  const tryKey = (key) => {
    const row = store.get(key);
    if (!row || typeof row !== 'object') return null;
    if (Date.now() > row.expiresAt) {
      store.delete(key);
      return null;
    }
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : null;
    if (!payload || !persistedIntentRowValidForRequest(payload, { storeId, draftId })) return null;
    return payload;
  };

  if (String(missionId ?? '').trim()) {
    const k = makePersistedIntentStorageKey(actorKey, tenantKey, missionId, storeId, draftId);
    const hit = tryKey(k);
    if (hit) return hit;
  }
  const kCtx = makePersistedIntentStorageKey(actorKey, tenantKey, null, storeId, draftId);
  return tryKey(kCtx);
}

/**
 * @param {{
 *   actorKey: string | null,
 *   tenantKey: string,
 *   missionId?: string | null,
 *   storeId?: string | null,
 *   draftId?: string | null,
 *   family: string | null,
 *   subtype: string | null,
 *   chosenTool: string | null,
 *   executionPath?: string | null,
 *   source?: string,
 * }} args
 */
export function setPersistedIntentResolution(args) {
  pruneExpired();
  const actorKey = String(args?.actorKey ?? '').trim();
  if (!actorKey) return;
  const tenantKey = String(args?.tenantKey ?? '').trim() || 'unknown';
  const missionId = args?.missionId ?? null;
  const storeId = args?.storeId ?? null;
  const draftId = args?.draftId ?? null;
  const key = makePersistedIntentStorageKey(actorKey, tenantKey, missionId, storeId, draftId);
  const updatedAt = new Date().toISOString();
  const payload = {
    family: args.family ?? null,
    subtype: args.subtype ?? null,
    chosenTool: args.chosenTool ?? null,
    executionPath: args.executionPath ?? null,
    updatedAt,
    missionId: String(missionId ?? '').trim() || null,
    storeId: storeId != null ? String(storeId) : null,
    draftStoreId: draftId != null ? String(draftId) : null,
    source: typeof args.source === 'string' ? args.source : 'resolver',
  };
  store.set(key, {
    payload,
    expiresAt: Date.now() + PERSISTED_INTENT_TTL_MS,
  });
}

/**
 * @param {{ actorKey: string | null, tenantKey: string, missionId?: string | null, storeId?: string | null, draftId?: string | null }} args
 */
export function clearPersistedIntentResolution(args) {
  const actorKey = String(args?.actorKey ?? '').trim();
  if (!actorKey) return;
  const tenantKey = String(args?.tenantKey ?? '').trim() || 'unknown';
  const missionId = args?.missionId ?? null;
  const storeId = args?.storeId ?? null;
  const draftId = args?.draftId ?? null;
  store.delete(makePersistedIntentStorageKey(actorKey, tenantKey, missionId, storeId, draftId));
  if (String(missionId ?? '').trim()) {
    store.delete(makePersistedIntentStorageKey(actorKey, tenantKey, null, storeId, draftId));
  }
}

/** @returns {boolean} */
export function strongOntologyOverridesPersisted(topRanked, persistedRow) {
  if (!topRanked || topRanked.score < STRONG_ONTOLOGY_SCORE) return false;
  if (!persistedRow || typeof persistedRow.subtype !== 'string') return true;
  return topRanked.st.subtype !== persistedRow.subtype;
}

export function clearPersistedIntentStoreForTests() {
  store.clear();
}

export function persistedIntentStoreSizeForTests() {
  pruneExpired();
  return store.size;
}

/**
 * @param {import('./intakeIntentResolver.js').IntentResolutionResult | null | undefined} ir
 * @param {string | null | undefined} result
 */
export function shouldPersistIntentResolution(ir, result) {
  if (!ir || result === 'error') return false;
  if (ir.resolverReason === 'empty_message') return false;
  if (ir.resolverReason === 'unresolved' && !ir.subtype && !ir.chosenTool) return false;
  if (!ir.subtype && !ir.chosenTool) return false;
  if (ir.chosenTool === 'general_chat' && !ir.recovered && !ir.subtype) return false;
  if (ir.subtype) return true;
  if (ir.recovered && ir.chosenTool) return true;
  if (ir.chosenTool && String(ir.resolverReason ?? '').startsWith('classifier_strong')) return true;
  return false;
}

/** @param {string | null | undefined} resolverReason */
export function inferPersistedIntentSource(resolverReason) {
  const r = String(resolverReason ?? '');
  if (r.startsWith('classifier_strong')) return 'classifier';
  if (r.includes('continuity') || r.includes('persisted')) return 'resolver';
  if (r.startsWith('ontology:')) return 'resolver';
  if (r.startsWith('legacy')) return 'recovery';
  return 'resolver';
}

/**
 * @param {import('express').Request} req
 * @param {{
 *   missionId: string | null,
 *   storeId: string | null,
 *   draftId: string | null,
 *   ir: import('./intakeIntentResolver.js').IntentResolutionResult,
 *   result?: string | null,
 *   executionPath?: string | null,
 * }} args
 */
export function maybePersistIntakeIntentResolution(req, args) {
  const actorKey = resolveIntakeV2ActorKey(req);
  if (!actorKey || !shouldPersistIntentResolution(args.ir, args.result)) return;
  setPersistedIntentResolution({
    actorKey,
    tenantKey: resolveIntakeV2TenantKey(req),
    missionId: args.missionId,
    storeId: args.storeId,
    draftId: args.draftId,
    family: args.ir.family ?? null,
    subtype: args.ir.subtype ?? null,
    chosenTool: args.ir.chosenTool ?? null,
    executionPath: args.executionPath ?? null,
    source: inferPersistedIntentSource(args.ir.resolverReason),
  });
}
