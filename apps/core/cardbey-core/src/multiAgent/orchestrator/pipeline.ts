/**
 * Agent execution pipeline — parallel step execution with dependency resolution.
 */

import type {
  ExecutionResult,
  MissionPlan,
  PlanStep,
} from '../types/agent.types.js';
import type { PlanExecutionContext } from '../types/mission.types.js';
import logger from '../telemetry/logger.js';

export type StepExecutor = (
  step: PlanStep,
  context: PlanExecutionContext,
) => Promise<{ result: unknown }>;

const defaultStepExecutor: StepExecutor = async (step) => ({
  result: `Executed ${step.action} with ${JSON.stringify(step.parameters)}`,
});

async function executeStepWithRetry(
  step: PlanStep,
  context: PlanExecutionContext,
  executor: StepExecutor,
): Promise<ExecutionResult> {
  const start = Date.now();
  let lastError: string | undefined;
  const maxAttempts = context.retryOnFailure ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { result } = await executor(step, context);
      return {
        success: true,
        stepId: step.id,
        result,
        duration: Date.now() - start,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn({
        message: 'step_execution_retry',
        missionId: context.missionId,
        stepId: step.id,
        attempt,
        error: lastError,
      });
    }
  }

  return {
    success: false,
    stepId: step.id,
    result: null,
    error: lastError,
    duration: Date.now() - start,
  };
}

function dependenciesMet(
  step: PlanStep,
  plan: MissionPlan,
  completed: Map<string, ExecutionResult>,
): boolean {
  const depIds = plan.dependencies[step.action] ?? step.dependencies ?? [];
  if (depIds.length === 0) return true;

  return depIds.every((depKey) => {
    for (const [stepId, result] of completed) {
      const matchingStep = plan.steps.find((s) => s.id === stepId);
      if (matchingStep && (matchingStep.action === depKey || stepId === depKey)) {
        return result.success;
      }
    }
    return false;
  });
}

export async function executePlanPipeline(
  context: PlanExecutionContext,
  executor: StepExecutor = defaultStepExecutor,
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const completed = new Map<string, ExecutionResult>();
  const pending = [...context.plan.steps];
  let iterations = 0;
  const maxIterations = pending.length * 3;

  while (pending.length > 0 && iterations < maxIterations) {
    iterations += 1;
    const ready: PlanStep[] = [];

    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const step = pending[i];
      if (dependenciesMet(step, context.plan, completed)) {
        ready.push(step);
        pending.splice(i, 1);
      }
    }

    if (ready.length === 0) {
      break;
    }

    const batchSize = Math.min(context.parallelLimit, ready.length);
    const batch = ready.slice(0, batchSize);

    const batchResults = await Promise.all(
      batch.map((step) => executeStepWithRetry(step, context, executor)),
    );

    for (const result of batchResults) {
      results.push(result);
      completed.set(result.stepId, result);
      if (!result.success && !context.retryOnFailure) {
        return results;
      }
    }
  }

  for (const step of pending) {
    results.push({
      success: false,
      stepId: step.id,
      result: null,
      error: 'Dependencies not met or circular dependency',
      duration: 0,
    });
  }

  return results;
}
