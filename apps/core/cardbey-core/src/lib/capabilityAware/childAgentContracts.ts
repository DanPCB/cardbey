/**
 * Child-agent contracts only.
 * No execution, spawning, or bridge calls live here.
 */

import type { ChildAgentTask } from './types.ts';

const VALID_CHILD_ROLES: ChildAgentTask['role'][] = [
  'research_child',
  'asset_child',
  'tooling_child',
  'validation_child',
  'reporting_child',
];

function makeId(): string {
  return `child_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createChildAgentTask(params: {
  missionId: string;
  role: ChildAgentTask['role'];
  parentRequirementId: string;
  objective: string;
  inputs: Record<string, unknown>;
  expectedOutputs: string[];
  maxIterations?: number;
}): ChildAgentTask {
  const task: ChildAgentTask = {
    id: makeId(),
    missionId: String(params.missionId ?? '').trim(),
    role: params.role,
    parentRequirementId: String(params.parentRequirementId ?? '').trim(),
    objective: String(params.objective ?? '').trim(),
    inputs: params.inputs && typeof params.inputs === 'object' ? params.inputs : {},
    expectedOutputs: Array.isArray(params.expectedOutputs) ? params.expectedOutputs : [],
    ...(params.maxIterations != null ? { maxIterations: params.maxIterations } : {}),
  };

  const validation = validateChildAgentTask(task);
  if (!validation.valid) {
    throw new Error(`Invalid child agent task: ${validation.errors.join(', ')}`);
  }

  return task;
}

export function validateChildAgentTask(
  task: ChildAgentTask,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!task || typeof task !== 'object') {
    return { valid: false, errors: ['task required'] };
  }
  if (!String(task.missionId ?? '').trim()) {
    errors.push('missionId required');
  }
  if (!String(task.objective ?? '').trim()) {
    errors.push('objective required');
  }
  if (!Array.isArray(task.expectedOutputs) || task.expectedOutputs.length === 0) {
    errors.push('expectedOutputs required');
  }
  if (!VALID_CHILD_ROLES.includes(task.role)) {
    errors.push('role invalid');
  }
  if (
    task.maxIterations != null &&
    (!Number.isInteger(task.maxIterations) || task.maxIterations < 1 || task.maxIterations > 10)
  ) {
    errors.push('maxIterations must be between 1 and 10');
  }

  return { valid: errors.length === 0, errors };
}
