/**
 * Skill orchestration layer — shared JSDoc types.
 * @module skills/types
 */

/**
 * @typedef {Object} SkillStep
 * @property {string} id
 * @property {string} name
 * @property {string} tool
 * @property {(ctx: object, stepResults: object) => object} [buildInput]
 * @property {(ctx: object, stepResults: object) => boolean} [condition]
 * @property {number} [timeout]
 * @property {boolean} [required]
 */

/**
 * @typedef {Object} RetryPolicy
 * @property {number} [maxAttempts]
 * @property {number} [backoffMs]
 * @property {(error: object) => boolean} [shouldRetry]
 */

/**
 * @typedef {Object} SkillDefinition
 * @property {string} name
 * @property {string} version
 * @property {string} description
 * @property {string[]} triggers
 * @property {string[]} [requiredContext]
 * @property {SkillStep[]} steps
 * @property {RetryPolicy} [retryPolicy]
 * @property {boolean} [observable]
 * @property {string[]} [composes]
 * @property {string} [displayResultType]
 * @property {SkillPlanning} [planning]
 */

/**
 * @typedef {Object} SkillPlanning
 * @property {boolean} [planFirst] — pause for owner approval before execute step
 * @property {string} [planExecutor] — tool name for plan phase (e.g. video_plan)
 * @property {string} [planStepId] — step id that completes planning
 * @property {string} [executeStepId] — step id for expensive generation
 * @property {string} [planSchema] — validation schema id
 * @property {boolean} [expensive] — when true, preview cannot be skipped via prompt
 */

/**
 * @typedef {Object} SkillExecution
 * @property {string} id
 * @property {string} skillName
 * @property {string} missionId
 * @property {'pending'|'running'|'paused'|'awaiting_plan_approval'|'completed'|'failed'|'skipped'} status
 * @property {number} currentStep
 * @property {Object.<string, *>} stepResults
 * @property {Object} ctx
 * @property {string} startedAt
 * @property {string} [completedAt]
 * @property {boolean} canResume
 * @property {string} [failedReason]
 * @property {object} [planArtifact]
 */

/**
 * @typedef {Object} SkillRouterResult
 * @property {boolean} matched
 * @property {string} [skillName]
 * @property {string} [executionId]
 * @property {SkillExecution|{ ok: boolean, reason?: string, missing?: string[] }} [result]
 * @property {'skill'|'tool'} dispatchedVia
 */

export {};
