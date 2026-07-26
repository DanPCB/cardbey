/**
 * Intake decision loop — belief types and version constants.
 * Feature flags: import from config/features.js (single source of truth).
 */

import { Features } from '../../config/features.js';

/** Shadow belief load on every intake turn (read-only; no behavior change). */
export function isIntakeBeliefShadowEnabled() {
  return Features.belief.shadow;
}

/** Phase 3+: decision loop owns classification. */
export function isIntakeDecisionLoopAuthorityEnabled() {
  return Features.decisionLoop.enabled;
}

export const BELIEF_LOADER_VERSION = '1.0.0';
export const ADVISOR_REGISTRY_VERSION = '1.0.0';

/** Shadow advisor rank vs legacy classification (read-only). */
export function isIntakeAdvisorShadowEnabled() {
  return Features.advisor.shadow;
}

/** @typedef {'upload_goal' | 'missing_entity' | 'disambiguate_goal' | 'workflow_continuation' | 'auth_gate'} PendingClarifyType */

/**
 * @typedef {object} BeliefIdentity
 * @property {boolean} guest
 * @property {string | null} actorId
 * @property {string | null} userId
 */

/**
 * @typedef {object} BeliefAnchors
 * @property {string | null} storeId
 * @property {string | null} draftId
 * @property {string | null} missionId
 */

/**
 * @typedef {object} BeliefWorkflow
 * @property {string} type
 * @property {string} status
 * @property {string} [source]
 */

/**
 * @typedef {object} BeliefLastUpload
 * @property {string | null} imageRef
 * @property {string | null} ocrText
 * @property {string | null} documentType
 * @property {string | null} businessName
 * @property {string | null} sessionKey
 * @property {string | null} [evidenceId]
 * @property {string | null} [attachmentId]
 * @property {string | null} [contentHash]
 * @property {string | null} [sourceMessageId]
 * @property {string} [at]
 */

/**
 * @typedef {object} BeliefPendingClarify
 * @property {PendingClarifyType} type
 * @property {string} [question]
 * @property {Array<{ id: string; label?: string }>} [options]
 * @property {number} [sinceTurn]
 */

/**
 * @typedef {object} BeliefActiveGoal
 * @property {string} intent
 * @property {number} [confidence]
 * @property {string} [sinceTurn]
 */

/**
 * @typedef {object} BeliefDivergence
 * @property {string} field
 * @property {unknown} sourceA
 * @property {string} sourceAName
 * @property {unknown} sourceB
 * @property {string} sourceBName
 */

/**
 * @typedef {object} BeliefSnapshot
 * @property {string} sessionId
 * @property {string | null} sessionKey
 * @property {BeliefIdentity} identity
 * @property {BeliefAnchors} anchors
 * @property {BeliefWorkflow | null} workflow
 * @property {BeliefLastUpload | null} lastUpload
 * @property {BeliefActiveGoal | null} activeGoal
 * @property {BeliefPendingClarify | null} pendingClarify
 * @property {string[]} blockers
 * @property {string[]} sourcesLoaded
 * @property {BeliefDivergence[]} divergences
 * @property {string} loadedAt
 * @property {string} loaderVersion
 */
