/**
 * Bounded child-agent contract — validation only; no spawn or mission submission.
 */

import type { ChildAgentTask } from './types.ts';

const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_MAX_TOOL_CALLS = 8;
const DEFAULT_MAX_RUNTIME_MS = 120000;

function makeId(): string {
  return `child_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createChildAgentTask(partial: Omit<ChildAgentTask, 'id'> & { id?: string }): ChildAgentTask {
  const id = partial.id?.trim() || makeId();
  return {
    ...partial,
    id,
    maxIterations: partial.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    maxToolCalls: partial.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
    maxRuntimeMs: partial.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS,
    allowNestedDelegation: false,
  };
}

export interface ChildAgentValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateChildAgentTask(task: ChildAgentTask | null | undefined): ChildAgentValidationResult {
  const errors: string[] = [];
  if (!task || typeof task !== 'object') {
    return { ok: false, errors: ['task_required'] };
  }
  if (!String(task.missionId ?? '').trim()) errors.push('missionId_required');
  if (!String(task.parentRequirementId ?? '').trim()) errors.push('parentRequirementId_required');
  if (!String(task.objective ?? '').trim()) errors.push('objective_required');
  if (!Array.isArray(task.expectedOutputs) || task.expectedOutputs.length === 0) {
    errors.push('expectedOutputs_non_empty');
  }
  if (task.allowNestedDelegation === true) errors.push('nested_delegation_disallowed_v1');
  return { ok: errors.length === 0, errors };
}
