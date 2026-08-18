/**
 * TurnBelief — single authority object for a Performer turn (P0 schema lock).
 * P1 wires writers/readers; P0 only defines the contract shape + helpers.
 *
 * Aligns with performerGrounding evidence concepts but is the **operator belief**
 * (status + goal reconciliation), not the catalog compiler alone.
 *
 * @module performerTurnBelief/turnBelief
 */

import {
  PERFORMER_STATUS,
  isPerformerStatus,
  normalizePerformerStatus,
  canDispatchTools,
} from './performerStatus.js';

/** @typedef {import('./performerStatus.js').PerformerStatus} PerformerStatus */

/**
 * @typedef {'IDENTITY'|'OFFERING'|'OPENING_HOURS'|'CONTACT'|'LOCATION'|'CATEGORY'|'MEDIA'|'OTHER'} TurnBeliefFactKind
 */

/**
 * @typedef {Object} TurnBeliefEvidenceRef
 * @property {string} id
 * @property {string} [sourceType] e.g. BUSINESS_CARD|MENU|IMAGE|OWNER_INPUT
 * @property {string} [assetRef]
 * @property {string} [uri]
 * @property {number} [confidence]
 */

/**
 * @typedef {Object} TurnBeliefIdentity
 * @property {string|null} name
 * @property {string|null} category
 * @property {string|null} location
 * @property {number} confidence
 * @property {string[]} evidenceRefIds
 */

/**
 * @typedef {Object} TurnBeliefOffering
 * @property {string} name
 * @property {string|null} [description]
 * @property {string|null} [price]
 * @property {string[]} evidenceRefIds
 * @property {number} confidence
 */

/**
 * @typedef {Object} TurnBeliefNonOfferingFact
 * @property {TurnBeliefFactKind} kind
 * @property {string} text
 * @property {string[]} evidenceRefIds
 */

/**
 * @typedef {Object} TurnBeliefConflict
 * @property {string} code e.g. IDENTITY_GOAL_MISMATCH
 * @property {string} message
 * @property {string[]} [fieldPaths]
 * @property {string[]} [evidenceRefIds]
 * @property {'hard'|'soft'} severity
 */

/**
 * @typedef {Object} TurnBelief
 * @property {string} turnBeliefId
 * @property {string|null} missionId
 * @property {string} schemaVersion
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} goal
 * @property {PerformerStatus} status
 * @property {TurnBeliefIdentity} identity
 * @property {TurnBeliefOffering[]} offerings
 * @property {TurnBeliefNonOfferingFact[]} nonOfferingFacts
 * @property {TurnBeliefEvidenceRef[]} evidenceRefs
 * @property {TurnBeliefConflict[]} conflicts
 * @property {string[]} gaps
 * @property {string[]} missingQuestions
 * @property {number} confidence
 * @property {string|null} proposedAction
 * @property {'pending'|'confirmed'|'rejected'|'not_required'} confirmationState
 * @property {string} userVisibleSummary
 * @property {Record<string, unknown>} [extensions]
 */

export const TURN_BELIEF_SCHEMA_VERSION = 'performer.turnBelief.v1';

export const TURN_BELIEF_FACT_KIND = Object.freeze({
  IDENTITY: 'IDENTITY',
  OFFERING: 'OFFERING',
  OPENING_HOURS: 'OPENING_HOURS',
  CONTACT: 'CONTACT',
  LOCATION: 'LOCATION',
  CATEGORY: 'CATEGORY',
  MEDIA: 'MEDIA',
  OTHER: 'OTHER',
});

export const CONFIRMATION_STATE = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  NOT_REQUIRED: 'not_required',
});

/**
 * @param {Partial<TurnBelief> & { goal?: string, missionId?: string|null }} [partial]
 * @returns {TurnBelief}
 */
export function createEmptyTurnBelief(partial = {}) {
  const now = new Date().toISOString();
  const status = normalizePerformerStatus(partial.status, PERFORMER_STATUS.NEEDS_EVIDENCE);
  return {
    turnBeliefId:
      (typeof partial.turnBeliefId === 'string' && partial.turnBeliefId.trim()) ||
      `tb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    missionId: partial.missionId ?? null,
    schemaVersion: TURN_BELIEF_SCHEMA_VERSION,
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    goal: typeof partial.goal === 'string' ? partial.goal : '',
    status,
    identity: {
      name: partial.identity?.name ?? null,
      category: partial.identity?.category ?? null,
      location: partial.identity?.location ?? null,
      confidence: typeof partial.identity?.confidence === 'number' ? partial.identity.confidence : 0,
      evidenceRefIds: Array.isArray(partial.identity?.evidenceRefIds)
        ? [...partial.identity.evidenceRefIds]
        : [],
    },
    offerings: Array.isArray(partial.offerings) ? [...partial.offerings] : [],
    nonOfferingFacts: Array.isArray(partial.nonOfferingFacts) ? [...partial.nonOfferingFacts] : [],
    evidenceRefs: Array.isArray(partial.evidenceRefs) ? [...partial.evidenceRefs] : [],
    conflicts: Array.isArray(partial.conflicts) ? [...partial.conflicts] : [],
    gaps: Array.isArray(partial.gaps) ? [...partial.gaps] : [],
    missingQuestions: Array.isArray(partial.missingQuestions) ? [...partial.missingQuestions] : [],
    confidence: typeof partial.confidence === 'number' ? partial.confidence : 0,
    proposedAction: partial.proposedAction ?? null,
    confirmationState: partial.confirmationState || CONFIRMATION_STATE.NOT_REQUIRED,
    userVisibleSummary:
      typeof partial.userVisibleSummary === 'string' ? partial.userVisibleSummary : '',
    extensions:
      partial.extensions && typeof partial.extensions === 'object' ? { ...partial.extensions } : {},
  };
}

/**
 * @param {unknown} raw
 * @returns {raw is TurnBelief}
 */
export function isTurnBelief(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const b = /** @type {Record<string, unknown>} */ (raw);
  return (
    typeof b.turnBeliefId === 'string' &&
    typeof b.schemaVersion === 'string' &&
    isPerformerStatus(b.status) &&
    typeof b.goal === 'string' &&
    b.identity != null &&
    typeof b.identity === 'object' &&
    Array.isArray(b.offerings) &&
    Array.isArray(b.evidenceRefs) &&
    Array.isArray(b.conflicts)
  );
}

/**
 * Hard identity conflicts block invent/dispatch until resolved.
 * @param {TurnBelief} belief
 */
export function hasHardConflict(belief) {
  if (!belief || !Array.isArray(belief.conflicts)) return false;
  return belief.conflicts.some((c) => c && c.severity === 'hard');
}

/**
 * Contract gate: may tools run from this belief?
 * @param {TurnBelief} belief
 */
export function turnBeliefAllowsDispatch(belief) {
  if (!isTurnBelief(belief)) return false;
  if (hasHardConflict(belief)) return false;
  return canDispatchTools(belief.status);
}

/**
 * Build a hard conflict for goal vs evidence identity mismatch (P1 will populate).
 * @param {{ goalName?: string, evidenceName?: string, evidenceRefIds?: string[] }} opts
 * @returns {TurnBeliefConflict}
 */
export function buildIdentityGoalMismatchConflict(opts = {}) {
  const goal = String(opts.goalName || '').trim() || 'goal';
  const evidence = String(opts.evidenceName || '').trim() || 'attachment';
  return {
    code: 'IDENTITY_GOAL_MISMATCH',
    message: `Goal identity "${goal}" conflicts with evidence identity "${evidence}".`,
    fieldPaths: ['identity.name', 'goal'],
    evidenceRefIds: Array.isArray(opts.evidenceRefIds) ? opts.evidenceRefIds : [],
    severity: 'hard',
  };
}

/**
 * Patch belief (immutable-style): returns new object with updatedAt.
 * @param {TurnBelief} belief
 * @param {Partial<TurnBelief>} patch
 * @returns {TurnBelief}
 */
export function patchTurnBelief(belief, patch = {}) {
  const base = isTurnBelief(belief) ? belief : createEmptyTurnBelief(belief || {});
  const next = createEmptyTurnBelief({
    ...base,
    ...patch,
    turnBeliefId: base.turnBeliefId,
    createdAt: base.createdAt,
    identity: { ...base.identity, ...(patch.identity || {}) },
    offerings: patch.offerings !== undefined ? patch.offerings : base.offerings,
    nonOfferingFacts:
      patch.nonOfferingFacts !== undefined ? patch.nonOfferingFacts : base.nonOfferingFacts,
    evidenceRefs: patch.evidenceRefs !== undefined ? patch.evidenceRefs : base.evidenceRefs,
    conflicts: patch.conflicts !== undefined ? patch.conflicts : base.conflicts,
    gaps: patch.gaps !== undefined ? patch.gaps : base.gaps,
    missingQuestions:
      patch.missingQuestions !== undefined ? patch.missingQuestions : base.missingQuestions,
    extensions: { ...(base.extensions || {}), ...(patch.extensions || {}) },
    updatedAt: new Date().toISOString(),
  });
  if (hasHardConflict(next) && next.status !== PERFORMER_STATUS.BLOCKED) {
    next.status = PERFORMER_STATUS.BLOCKED;
  }
  return next;
}

export default {
  TURN_BELIEF_SCHEMA_VERSION,
  TURN_BELIEF_FACT_KIND,
  CONFIRMATION_STATE,
  createEmptyTurnBelief,
  isTurnBelief,
  hasHardConflict,
  turnBeliefAllowsDispatch,
  buildIdentityGoalMismatchConflict,
  patchTurnBelief,
};
