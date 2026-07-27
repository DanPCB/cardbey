/**
 * Canonical execution pipeline types and constants.
 * MissionPipeline is the persistence layer; these types unify read/dispatch contracts.
 */

/** @typedef {'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'} ExecutionStatus */

/** @typedef {'action' | 'checkpoint' | 'conditional' | 'parallel'} BlueprintStepKind */

/**
 * @typedef {'structured' | 'proactive' | 'registry'} BlueprintStepSource
 */

/**
 * @typedef {object} BlueprintStep
 * @property {string} id
 * @property {string} name
 * @property {BlueprintStepKind} kind
 * @property {string} [toolName]
 * @property {string} [label]
 * @property {number} [orderIndex]
 * @property {BlueprintStepSource} source
 * @property {object} [config]
 * @property {object} [inputSchema]
 * @property {object} [outputSchema]
 * @property {boolean} [requiresConfirmation]
 */

/**
 * @typedef {object} WorkflowBlueprintView
 * @property {string} id
 * @property {string} name
 * @property {string} version
 * @property {BlueprintStep[]} steps
 * @property {object[]} checkpoints
 * @property {object[]} dependencies
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef {'checkpoint_pipeline' | 'run_pipeline' | 'proactive_step' | 'dispatch_tool' | 'orchestration' | 'run_factory'} ExecutionMode
 */

export const EXECUTION_MODES = Object.freeze({
  CHECKPOINT_PIPELINE: 'checkpoint_pipeline',
  CAMPAIGN_CHECKPOINT_PIPELINE: 'campaign_checkpoint_pipeline',
  KERNEL_DISPATCH: 'kernel_dispatch',
  RUN_PIPELINE: 'run_pipeline',
  PROACTIVE_STEP: 'proactive_step',
  DISPATCH_TOOL: 'dispatch_tool',
  ORCHESTRATION: 'orchestration',
  RUN_FACTORY: 'run_factory',
});

export const EXECUTION_STATUSES = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const UNIFIED_ACTION_TYPES = Object.freeze({
  CREATE_STORE_CHECKPOINT: 'create_store_checkpoint',
  RUN_PIPELINE: 'run_pipeline',
  RUN_PROACTIVE_STEP: 'run_proactive_step',
  RESPOND_CHECKPOINT: 'respond_checkpoint',
  DISPATCH_TOOL: 'dispatch_tool',
  RUN_FACTORY: 'run_factory',
  MULTI_AGENT: 'multi_agent',
  CAMPAIGN_ORCHESTRATION: 'campaign_orchestration',
  CREATE_CAMPAIGN_CHECKPOINT: 'create_campaign_checkpoint',
});
