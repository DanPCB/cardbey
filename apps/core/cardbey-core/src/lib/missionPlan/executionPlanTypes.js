/**
 * Execution plan types for mission plans (JSDoc).
 * Used by planIntent and unifiedPlan.
 */

/** Step status for execution plan steps. */
export const DEFAULT_STEP_STATUS = 'pending';

/** Canonical step statuses used across execution plans. */
export const STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

/** Agent type labels used in steps/events (catalog, media, orchestrator, etc.). */
export const AGENT_TYPE = Object.freeze({
  CATALOG: 'catalog',
  MEDIA: 'media',
  ORCHESTRATOR: 'orchestrator',
  ANALYZE_STORE: 'analyze_store',
  GENERATE_COPY: 'generate_copy',
  GENERATE_HERO: 'generate_hero',
  GENERATE_TAGS: 'generate_tags',
  REWRITE_DESCRIPTIONS: 'rewrite_descriptions',
  VALIDATE_OFFER: 'validate_offer',
  GENERATE_QR: 'generate_qr',
  ASSIGN_PROMOTION_SLOT: 'assign_promotion_slot',
});

/**
 * @typedef {'pending' | 'running' | 'completed' | 'failed'} StepStatus
 */

/**
 * @typedef {Object} ExecutionPlanStep
 * @property {string} stepId
 * @property {number} order
 * @property {string} agentType
 * @property {string} label
 * @property {string[]} dependsOn - stepIds
 * @property {boolean} checkpoint
 * @property {StepStatus} status
 */

/**
 * @typedef {'llm' | 'rule'} PlanSource
 */

/**
 * @typedef {Object} ExecutionMissionPlan
 * @property {string} planId
 * @property {string} intentType
 * @property {string} intentId
 * @property {string} createdAt - ISO string
 * @property {PlanSource} source
 * @property {ExecutionPlanStep[]} steps
 */

// JSDoc types above (ExecutionPlanStep, ExecutionMissionPlan) for planIntent.js, unifiedPlan.js.
