/**
 * State Store
 * Manages execution state for orchestrator
 */

/**
 * Execution state for a plan
 */
export interface ExecutionState {
  /** Plan ID */
  planId: string;
  /** Current step ID */
  currentStepId?: string;
  /** Completed step IDs */
  completedSteps: string[];
  /** Failed step IDs */
  failedSteps: string[];
  /** Step results */
  stepResults: Record<string, unknown>;
  /** Overall status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Timestamp when execution started */
  startedAt?: Date;
  /** Timestamp when execution completed */
  completedAt?: Date;
}

/**
 * In-memory state store (use Redis/database in production)
 */
const stateStore = new Map<string, ExecutionState>();

/**
 * Get execution state for a plan
 * @param planId - Plan ID
 * @returns Execution state or undefined
 */
export function getState(planId: string): ExecutionState | undefined {
  return stateStore.get(planId);
}

/**
 * Set execution state for a plan
 * @param planId - Plan ID
 * @param state - Execution state
 */
export function setState(planId: string, state: ExecutionState): void {
  stateStore.set(planId, state);
}

/**
 * Update execution state
 * @param planId - Plan ID
 * @param updates - Partial state updates
 */
export function updateState(
  planId: string,
  updates: Partial<ExecutionState>
): void {
  const current = stateStore.get(planId);
  if (current) {
    stateStore.set(planId, { ...current, ...updates });
  }
}

/**
 * Delete execution state
 * @param planId - Plan ID
 */
export function deleteState(planId: string): void {
  stateStore.delete(planId);
}

/**
 * Clear all execution states
 */
export function clearAllStates(): void {
  stateStore.clear();
}


