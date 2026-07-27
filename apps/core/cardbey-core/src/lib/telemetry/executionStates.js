/**
 * Execution States — distinguish real execution from planning/stubbing.
 */

export const EXECUTION_STATES = {
  PLANNED: 'planned',
  BLOCKED: 'blocked',
  STUBBED: 'stubbed',
  EXECUTED: 'executed',
  FAILED: 'failed',
  PARTIAL: 'partial',
};

export const REAL_EXECUTION_STATES = [
  EXECUTION_STATES.EXECUTED,
  EXECUTION_STATES.FAILED,
  EXECUTION_STATES.PARTIAL,
];

export const SUCCESS_STATES = [EXECUTION_STATES.EXECUTED, EXECUTION_STATES.PARTIAL];

/** SLO success numerator — only genuine side-effect completions. */
export const SLO_SUCCESS_STATES = [EXECUTION_STATES.EXECUTED, EXECUTION_STATES.PARTIAL];

/**
 * @param {string | null | undefined} state
 */
export function isRealExecution(state) {
  return REAL_EXECUTION_STATES.includes(String(state ?? '').trim());
}

/**
 * @param {string | null | undefined} state
 */
export function isSuccess(state) {
  return SUCCESS_STATES.includes(String(state ?? '').trim());
}

/**
 * @param {string | null | undefined} state
 */
export function isSloSuccessState(state) {
  return SLO_SUCCESS_STATES.includes(String(state ?? '').trim());
}

/**
 * Resolve execution state from observation emit payload.
 *
 * @param {{ metadata?: Record<string, unknown>; result?: { success?: boolean; error?: string|null; stubbed?: boolean; blocked?: boolean; executionState?: string }; actionType?: string }} input
 * @returns {string}
 */
export function resolveExecutionState(input = {}) {
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const result = input.result && typeof input.result === 'object' ? input.result : {};

  const explicit =
    (typeof metadata.executionState === 'string' && metadata.executionState.trim()) ||
    (typeof result.executionState === 'string' && result.executionState.trim()) ||
    '';
  if (explicit && Object.values(EXECUTION_STATES).includes(explicit)) {
    return explicit;
  }

  if (metadata.planned === true || metadata.planOnly === true) {
    return EXECUTION_STATES.PLANNED;
  }
  if (metadata.stubbed === true || result.stubbed === true) {
    return EXECUTION_STATES.STUBBED;
  }
  if (metadata.blocked === true || result.blocked === true) {
    return EXECUTION_STATES.BLOCKED;
  }
  if (metadata.partial === true || result.partial === true) {
    return EXECUTION_STATES.PARTIAL;
  }
  if (result.success === false) {
    return EXECUTION_STATES.FAILED;
  }

  const actionType = String(input.actionType ?? '').trim();
  if (
    metadata.plannedOnly === true ||
    actionType === 'proactive_plan' ||
    actionType === 'approval_required'
  ) {
    return EXECUTION_STATES.PLANNED;
  }

  return EXECUTION_STATES.EXECUTED;
}

/**
 * Derive execution state from runtime kernel / tool dispatcher result.
 *
 * @param {{ status?: string; blocker?: { code?: string; message?: string }; error?: { code?: string; message?: string }; output?: Record<string, unknown> }} facadeResult
 * @param {{ actionType?: string }} [ctx]
 */
export function deriveExecutionStateFromRuntime(facadeResult, ctx = {}) {
  const status = String(facadeResult?.status ?? '').trim();
  const output =
    facadeResult?.output && typeof facadeResult.output === 'object' ? facadeResult.output : {};

  const outputState =
    typeof output.executionState === 'string' ? output.executionState.trim() : '';
  if (outputState && Object.values(EXECUTION_STATES).includes(outputState)) {
    return outputState;
  }

  if (output.stubbed === true || output.deployed === false) {
    return EXECUTION_STATES.STUBBED;
  }
  if (status === 'blocked' || facadeResult?.blocker) {
    return EXECUTION_STATES.BLOCKED;
  }
  if (output.uiActionEnvelope === true || output.hybridAssistEnvelope === true) {
    return EXECUTION_STATES.PLANNED;
  }
  if (output.awaitingPlanApproval === true || output.planArtifact) {
    return EXECUTION_STATES.PLANNED;
  }
  if (status === 'failed' || facadeResult?.error) {
    return EXECUTION_STATES.FAILED;
  }
  if (output.partial === true) {
    return EXECUTION_STATES.PARTIAL;
  }

  if (ctx.actionType === 'run_pipeline_step' || ctx.actionType === 'orchestra_start') {
    return EXECUTION_STATES.EXECUTED;
  }

  return EXECUTION_STATES.EXECUTED;
}
