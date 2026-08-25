/**
 * BusinessSnapshot contract — Business Operation Intelligence Phase B.
 * Transient DTO (no Prisma). Represents EXISTING and INTENDED modes.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { BUSINESS_CONTEXT_SCHEMA_VERSION } from './types.js';

export const BUSINESS_SNAPSHOT_SCHEMA_VERSION = 1;

export const SNAPSHOT_BUDGETS = Object.freeze({
  INSTANT: 'INSTANT',
  FAST: 'FAST',
  DEFERRED: 'DEFERRED',
  PAID_DEEP: 'PAID_DEEP',
});

export const SNAPSHOT_STAGE_STATUS = Object.freeze({
  pending: 'pending',
  done: 'done',
  skipped: 'skipped',
  failed: 'failed',
  partial: 'partial',
});

/**
 * @typedef {object} SnapshotField
 * @property {unknown} value
 * @property {string} knowledgeState
 * @property {string} [source]
 * @property {number} [confidence]
 * @property {string} [note]
 */

/**
 * @typedef {object} SnapshotOffering
 * @property {string} name
 * @property {string | null} [type]
 * @property {number | null} [price]
 * @property {string} knowledgeState
 * @property {string} source
 * @property {number} [confidence]
 */

/**
 * @typedef {object} SnapshotObservation
 * @property {'FACT' | 'INTERPRETATION'} kind
 * @property {string} text
 * @property {string} knowledgeState
 * @property {string} [source]
 */

/**
 * @typedef {object} SnapshotStage
 * @property {string} id
 * @property {string} label
 * @property {string} budget
 * @property {string} status
 * @property {number} [ms]
 * @property {string} [detail]
 */

/**
 * @param {Partial<import('./types.js').BusinessContext>} context
 * @returns {object}
 */
export function createEmptyBusinessSnapshot(context = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: BUSINESS_SNAPSHOT_SCHEMA_VERSION,
    contextSchemaVersion: BUSINESS_CONTEXT_SCHEMA_VERSION,
    snapshotId: `bos_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    contextId: context.contextId || null,
    mode: context.mode || null,
    identity: {
      name: field(null, KNOWLEDGE_STATES.ASSUMPTION),
      businessType: field(null, KNOWLEDGE_STATES.ASSUMPTION),
      category: field(null, KNOWLEDGE_STATES.ASSUMPTION),
      location: field(null, KNOWLEDGE_STATES.ASSUMPTION),
      website: field(null, KNOWLEDGE_STATES.ASSUMPTION),
      operatingModel: field(null, KNOWLEDGE_STATES.ASSUMPTION),
      description: field(null, KNOWLEDGE_STATES.ASSUMPTION),
    },
    offerings: {
      status: 'not_applicable',
      count: 0,
      items: [],
      message: null,
    },
    digitalPresence: {
      status: 'not_applicable',
      website: null,
      listing: null,
      social: [],
      cardbeyPresence: null,
      message: null,
    },
    readiness: {
      status: 'not_applicable',
      findings: [],
      message: null,
    },
    observations: [],
    informationGaps: [],
    assumptions: [],
    evidence: [],
    failures: [],
    stages: [],
    timing: {
      totalMs: 0,
      generatedAt: now,
    },
    generatedAt: now,
    phase: 'B',
  };
}

/**
 * @param {unknown} value
 * @param {string} knowledgeState
 * @param {{ source?: string, confidence?: number, note?: string }} [meta]
 * @returns {SnapshotField}
 */
export function field(value, knowledgeState, meta = {}) {
  return {
    value: value == null || value === '' ? null : value,
    knowledgeState,
    source: meta.source,
    confidence: meta.confidence,
    note: meta.note,
  };
}

/**
 * @param {import('./types.js').BusinessContext} ctx
 * @param {string} fieldName
 */
export function knowledgeForField(ctx, fieldName) {
  const items = (ctx.knowledge || []).filter((k) => k.field === fieldName);
  if (!items.length) return null;
  const order = {
    [KNOWLEDGE_STATES.USER_DEFINED]: 40,
    [KNOWLEDGE_STATES.DISCOVERED_FACT]: 30,
    [KNOWLEDGE_STATES.AI_INFERENCE]: 20,
    [KNOWLEDGE_STATES.ASSUMPTION]: 10,
  };
  return [...items].sort(
    (a, b) => (order[b.knowledgeState] || 0) - (order[a.knowledgeState] || 0),
  )[0];
}

/**
 * Project identity SnapshotFields from confirmed BusinessContext.
 * @param {import('./types.js').BusinessContext} ctx
 */
export function identityFromContext(ctx) {
  const pick = (name, fallbackValue = null) => {
    const k = knowledgeForField(ctx, name);
    const value = k?.value ?? ctx.identity?.[name] ?? fallbackValue;
    if (value == null || value === '') {
      return field(null, KNOWLEDGE_STATES.ASSUMPTION, { note: 'not provided' });
    }
    return field(value, k?.knowledgeState || KNOWLEDGE_STATES.AI_INFERENCE, {
      source: k?.source,
      confidence: k?.confidence,
    });
  };

  return {
    name: pick('name'),
    businessType: pick('businessType'),
    category: pick('category'),
    location: pick('location'),
    website: pick('website'),
    operatingModel: pick('operatingModel'),
    description: field(
      null,
      KNOWLEDGE_STATES.ASSUMPTION,
      { note: 'Description deferred unless sourced' },
    ),
  };
}
