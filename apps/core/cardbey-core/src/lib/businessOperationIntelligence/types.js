/**
 * Neutral BusinessContext contract — Business Operation Intelligence Phase A.
 * DTO only (no Prisma). Does not assume a real operating business exists.
 *
 * Downstream phases must consume confirmed BusinessContext as the sole input
 * contract and must not re-interpret the original prompt unless required.
 */

import { KNOWLEDGE_STATES, isKnowledgeState, knowledgeAuthority } from './knowledgeStates.js';

export const BUSINESS_CONTEXT_MODES = Object.freeze({
  EXISTING: 'EXISTING',
  INTENDED: 'INTENDED',
});

export const BUSINESS_CONTEXT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  AWAITING_MODE: 'AWAITING_MODE',
  AWAITING_TYPE: 'AWAITING_TYPE',
  AWAITING_RESOLUTION: 'AWAITING_RESOLUTION',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  CONFIRMED: 'CONFIRMED',
});

export const BUSINESS_CONTEXT_SCHEMA_VERSION = 1;

/**
 * @typedef {'EXISTING' | 'INTENDED'} BusinessContextMode
 * @typedef {'DRAFT' | 'AWAITING_MODE' | 'AWAITING_TYPE' | 'AWAITING_RESOLUTION' | 'AWAITING_CONFIRMATION' | 'CONFIRMED'} BusinessContextStatus
 * @typedef {'USER_DEFINED' | 'DISCOVERED_FACT' | 'AI_INFERENCE' | 'ASSUMPTION'} KnowledgeState
 *
 * @typedef {object} KnowledgeItem
 * @property {string} id
 * @property {string} field - e.g. name | businessType | category | location | website | operatingModel | mode
 * @property {unknown} value
 * @property {KnowledgeState} knowledgeState
 * @property {string} [source] - e.g. user_prompt | places | classifyBusiness | user_adjust
 * @property {number} [confidence]
 * @property {string} [note]
 * @property {string} [createdAt]
 *
 * @typedef {object} ResolutionCandidate
 * @property {string} entityId
 * @property {string} name
 * @property {string | null} [website]
 * @property {string | null} [location]
 * @property {string | null} [phone]
 * @property {string | null} [placeId]
 * @property {number} confidence
 * @property {string[]} [matchReasons]
 * @property {string} [source]
 *
 * @typedef {object} ResolutionState
 * @property {'idle' | 'pending' | 'ambiguous' | 'matched' | 'unresolved' | 'skipped'} status
 * @property {ResolutionCandidate[]} candidates
 * @property {string | null} [selectedEntityId]
 * @property {string[]} [notes]
 * @property {number} [confidence]
 * @property {boolean} [requiresSelection]
 *
 * @typedef {object} ConfirmationState
 * @property {boolean} confirmed
 * @property {string | null} [confirmedAt]
 * @property {'user' | null} [confirmedBy]
 * @property {string | null} [summary]
 *
 * @typedef {object} BusinessIdentity
 * @property {string | null} [name]
 * @property {string | null} [businessType]
 * @property {string | null} [category]
 * @property {string | null} [location]
 * @property {string | null} [website]
 * @property {string | null} [operatingModel]
 * @property {string | null} [verticalSlug]
 * @property {string | null} [verticalGroup]
 *
 * @typedef {object} BusinessContext
 * @property {number} schemaVersion
 * @property {string} contextId
 * @property {BusinessContextMode | null} mode
 * @property {BusinessContextStatus} status
 * @property {string} sourceText
 * @property {BusinessIdentity} identity
 * @property {KnowledgeItem[]} knowledge
 * @property {ResolutionState} resolution
 * @property {ConfirmationState} confirmation
 * @property {string[]} missingCritical
 * @property {number} confidence
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {string} [phase] - always 'A' for this contract generation
 */

/**
 * @returns {string}
 */
export function createContextId() {
  return `boc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {Partial<KnowledgeItem> & { field: string, value: unknown, knowledgeState: KnowledgeState }} input
 * @returns {KnowledgeItem}
 */
export function createKnowledgeItem(input) {
  const state = isKnowledgeState(input.knowledgeState)
    ? input.knowledgeState
    : KNOWLEDGE_STATES.AI_INFERENCE;
  return {
    id: input.id || `k_${input.field}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    field: String(input.field),
    value: input.value,
    knowledgeState: state,
    source: input.source ?? undefined,
    confidence: typeof input.confidence === 'number' ? input.confidence : undefined,
    note: input.note ?? undefined,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

/**
 * @param {Partial<BusinessContext> & { sourceText: string }} input
 * @returns {BusinessContext}
 */
export function createEmptyBusinessContext(input) {
  const now = new Date().toISOString();
  return {
    schemaVersion: BUSINESS_CONTEXT_SCHEMA_VERSION,
    contextId: input.contextId || createContextId(),
    mode: input.mode ?? null,
    status: input.status || BUSINESS_CONTEXT_STATUS.DRAFT,
    sourceText: String(input.sourceText || '').trim(),
    identity: {
      name: null,
      businessType: null,
      category: null,
      location: null,
      website: null,
      operatingModel: null,
      verticalSlug: null,
      verticalGroup: null,
      ...(input.identity || {}),
    },
    knowledge: Array.isArray(input.knowledge) ? [...input.knowledge] : [],
    resolution: {
      status: 'idle',
      candidates: [],
      selectedEntityId: null,
      notes: [],
      confidence: 0,
      requiresSelection: false,
      ...(input.resolution || {}),
    },
    confirmation: {
      confirmed: false,
      confirmedAt: null,
      confirmedBy: null,
      summary: null,
      ...(input.confirmation || {}),
    },
    missingCritical: Array.isArray(input.missingCritical) ? [...input.missingCritical] : [],
    confidence: typeof input.confidence === 'number' ? input.confidence : 0,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    phase: 'A',
  };
}

/**
 * Apply identity fields from knowledge items (highest-authority wins per field).
 * @param {BusinessContext} ctx
 * @returns {BusinessContext}
 */
export function projectIdentityFromKnowledge(ctx) {
  const byField = new Map();
  for (const item of ctx.knowledge || []) {
    if (!item?.field) continue;
    const prev = byField.get(item.field);
    if (!prev) {
      byField.set(item.field, item);
      continue;
    }
    if (knowledgeAuthority(item.knowledgeState) >= knowledgeAuthority(prev.knowledgeState)) {
      byField.set(item.field, item);
    }
  }

  const identity = { ...ctx.identity };
  for (const [field, item] of byField) {
    if (
      field === 'name' ||
      field === 'businessType' ||
      field === 'category' ||
      field === 'location' ||
      field === 'website' ||
      field === 'operatingModel' ||
      field === 'verticalSlug' ||
      field === 'verticalGroup'
    ) {
      identity[field] = item.value == null || item.value === '' ? null : String(item.value);
    }
  }

  let mode = ctx.mode;
  const modeItem = byField.get('mode');
  if (modeItem && (modeItem.value === 'EXISTING' || modeItem.value === 'INTENDED')) {
    mode = modeItem.value;
  }

  return { ...ctx, identity, mode };
}

/**
 * Lightweight structural validation (no throw).
 * @param {unknown} value
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateBusinessContextShape(value) {
  const errors = [];
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: ['BusinessContext must be an object'] };
  }
  const ctx = /** @type {Record<string, unknown>} */ (value);
  if (ctx.schemaVersion !== BUSINESS_CONTEXT_SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion (expected ${BUSINESS_CONTEXT_SCHEMA_VERSION})`);
  }
  if (!ctx.contextId || typeof ctx.contextId !== 'string') errors.push('contextId required');
  if (typeof ctx.sourceText !== 'string') errors.push('sourceText required');
  if (!ctx.identity || typeof ctx.identity !== 'object') errors.push('identity required');
  if (!Array.isArray(ctx.knowledge)) errors.push('knowledge must be an array');
  if (!ctx.resolution || typeof ctx.resolution !== 'object') errors.push('resolution required');
  if (!ctx.confirmation || typeof ctx.confirmation !== 'object') errors.push('confirmation required');
  if (ctx.mode != null && ctx.mode !== 'EXISTING' && ctx.mode !== 'INTENDED') {
    errors.push('mode must be EXISTING, INTENDED, or null');
  }
  return { ok: errors.length === 0, errors };
}
