// DANH: skill-runtime-phase5
// DANH: skill-runtime-phase6
/**
 * Step adapter — wraps an existing JS tool executor into the `Step` interface
 * the SkillRuntime expects (Phase 5).
 *
 * Adaptation notes (vs. the Phase 5 task sketch):
 *  - The real `Step` (types.ts) has NO `description` field — it has `name`.
 *    `wrapExecutor`'s `description` argument is mapped onto `Step.name`.
 *  - There is no `StepResult` type in types.ts. `Step.execute` returns
 *    `Promise<any>` and the runtime stores whatever it returns in its
 *    step-results map. We define a small `StepResult` shape here purely as the
 *    return value (not a new field on any existing type).
 *  - `SkillContext` stores `userId` at the top level and `storeId`/`missionId`
 *    inside `metadata` (see skillContextBuilder.ts). The executor input is built
 *    from both locations so executors that read `input.storeId` / `input.userId`
 *    keep working.
 *  - Executors never throw on validation (they return `{ status: 'failed', ... }`).
 *    `wrapExecutor` only catches *thrown* errors and reports them as a failed
 *    StepResult WITHOUT rethrowing — so a single tool error does not crash the
 *    whole runtime; the structured result carries the outcome instead.
 */

import type { SkillContext, Step } from './types.js';

/** Outcome of a wrapped executor step. Stored as the step result. */
export interface StepResult {
  stepId: string;
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string;
}

/** A tool executor: takes a plain input bag, resolves to a plain result bag. */
export type ToolExecutor = (
  input: Record<string, unknown>
) => Promise<unknown> | unknown;

/**
 * Build the executor input bag from a SkillContext. `storeId` lives in
 * `metadata`, `userId` at the top level; all other metadata is passed through
 * so executors can read mission/session/category signals when present.
 */
export function buildExecutorInput(ctx: SkillContext): Record<string, unknown> {
  const meta = (ctx?.metadata ?? {}) as Record<string, unknown>;
  return {
    ...meta,
    storeId: meta.storeId ?? null,
    userId: ctx?.userId ?? meta.userId ?? null,
    query: ctx?.query ?? null,
  };
}

/**
 * Wrap a JS tool executor function into a `Step`. The step never rethrows: a
 * thrown executor becomes a `{ status: 'failed' }` StepResult so the runtime
 * records a completed (non-crashing) step whose result describes the failure.
 */
export function wrapExecutor(
  stepId: string,
  description: string,
  executorFn: ToolExecutor
): Step {
  return {
    id: stepId,
    name: description,
    execute: async (ctx: SkillContext): Promise<StepResult> => {
      try {
        const input = buildExecutorInput(ctx);
        const output = await executorFn(input);
        return { stepId, status: 'completed', output };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { stepId, status: 'failed', error: message };
      }
    },
  };
}

/**
 * One step in a chained sequence. `toAccumulator` controls what prior-step
 * output is merged into downstream executor input (executors nest results under
 * `output.analytics` / `output.score` etc., not at the top level).
 */
export interface ChainedStepDef {
  id: string;
  name: string;
  fn: ToolExecutor;
  /** Merge into the closure accumulator after this step succeeds. */
  toAccumulator?: (output: unknown) => Record<string, unknown>;
}

/**
 * Build an ordered `Step[]` that threads prior-step output into later inputs.
 *
 * Chaining strategy (from skill.ts audit): `SkillRuntime.runLoop()` passes the
 * same `this.context` reference to every step, but it does NOT merge step
 * results back into context — results live only in `stepResults`. Mutating
 * `ctx.metadata._stepOutputs` would work, yet a per-factory closure accumulator
 * is preferred: it keeps metadata clean, isolates separate factory calls, and
 * does not depend on runtime internals.
 */
export function wrapChainedSteps(defs: ChainedStepDef[]): Step[] {
  const accumulated: Record<string, unknown> = {};

  return defs.map(({ id, name, fn, toAccumulator }) => ({
    id,
    name,
    execute: async (ctx: SkillContext): Promise<StepResult> => {
      try {
        const input: Record<string, unknown> = {
          ...buildExecutorInput(ctx),
          ...accumulated,
        };
        const output = await fn(input);
        if (toAccumulator) {
          Object.assign(accumulated, toAccumulator(output));
        } else if (output && typeof output === 'object') {
          Object.assign(accumulated, output as Record<string, unknown>);
        }
        return { stepId: id, status: 'completed', output };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Accumulator is left intact — step 1 output remains for inspection.
        return { stepId: id, status: 'failed', error: message };
      }
    },
  }));
}
