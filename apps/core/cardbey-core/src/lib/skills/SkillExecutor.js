/**
 * Executes multi-step skills by composing toolDispatcher calls.
 */

import { randomUUID } from 'node:crypto';
import {
  SKILL_STATUS_AWAITING_PLAN_APPROVAL,
} from './planApprovalConstants.js';
import {
  shouldPlanFirst,
  buildPlanArtifactFromExecution,
  isPlanPhaseComplete,
  hasExecuteStepRemaining,
  persistPlanApprovalPending,
} from './planApprovalService.js';

/** @typedef {import('./types.js').SkillDefinition} SkillDefinition */
/** @typedef {import('./types.js').SkillExecution} SkillExecution */

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 1000;
const DEFAULT_STEP_TIMEOUT_MS = 30000;

/** @type {Map<string, SkillExecution>} */
const executionStore = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} error
 * @returns {boolean}
 */
function defaultShouldRetry(error) {
  const code = String(error?.code ?? '').toUpperCase();
  if (code === 'VALIDATION_ERROR' || code === 'PERMISSION_DENIED') return false;
  if (error?.retryable === false) return false;
  const msg = String(error?.message ?? '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('econn')) return true;
  return code === '' || code === 'TOOL_EXECUTION_FAILED' || code === 'SKILL_STEP_FAILED';
}

/**
 * @param {import('./types.js').RetryPolicy | undefined} policy
 * @returns {{ maxAttempts: number, backoffMs: number, shouldRetry: (error: object) => boolean }}
 */
function resolveRetryPolicy(policy) {
  return {
    maxAttempts: Math.max(1, Number(policy?.maxAttempts) || DEFAULT_MAX_ATTEMPTS),
    backoffMs: Math.max(0, Number(policy?.backoffMs) || DEFAULT_BACKOFF_MS),
    shouldRetry: typeof policy?.shouldRetry === 'function' ? policy.shouldRetry : defaultShouldRetry,
  };
}

export class SkillExecutor {
  /**
   * @param {{
   *   toolDispatcher: (tool: string, input: object, context: object) => Promise<object>,
   *   blackboard: { appendEvent?: (missionId: string, eventType: string, payload: object) => Promise<unknown> },
   *   prisma?: object,
   * }} deps
   */
  constructor({ toolDispatcher, blackboard, prisma }) {
    this.toolDispatcher = toolDispatcher;
    this.blackboard = blackboard;
    this.prisma = prisma;
  }

  /**
   * @param {SkillDefinition} skillDef
   * @param {object} ctx
   * @returns {Promise<SkillExecution>}
   */
  async execute(skillDef, ctx) {
    const execution = this._createExecution(skillDef, ctx);
    executionStore.set(execution.id, execution);
    return this._runFromStep(skillDef, execution, execution.currentStep);
  }

  /**
   * @param {string} executionId
   * @param {object} ctx
   * @returns {Promise<SkillExecution>}
   */
  async resume(executionId, ctx) {
    const id = String(executionId ?? '').trim();
    let execution = executionStore.get(id);
    if (!execution) {
      execution = await this._loadExecutionFromBlackboard(id, ctx?.missionId);
    }
    if (!execution) {
      throw new Error(`Skill execution not found: ${id}`);
    }
    const skillDef = /** @type {SkillDefinition | null} */ (
      execution.ctx?.skillDef ?? null
    );
    if (!skillDef) {
      throw new Error(`Skill definition missing for execution: ${id}`);
    }

    if (ctx?.regeneratePlan) {
      const planStepIndex = this._resolvePlanStepIndex(skillDef);
      execution.stepResults = { ...execution.stepResults };
      const planStepId = skillDef.planning?.planStepId ?? skillDef.steps?.[planStepIndex]?.id;
      if (planStepId) delete execution.stepResults[planStepId];
      execution.currentStep = planStepIndex;
      execution.planArtifact = undefined;
      execution.status = 'running';
      execution.canResume = false;
    } else {
      execution.status = 'running';
      execution.canResume = false;
    }

    execution.ctx = { ...execution.ctx, ...ctx, skillDef };
    executionStore.set(id, execution);
    return this._runFromStep(skillDef, execution, execution.currentStep);
  }

  /**
   * @param {SkillDefinition} skillDef
   * @returns {number}
   */
  _resolvePlanStepIndex(skillDef) {
    const planStepId = skillDef?.planning?.planStepId;
    const steps = skillDef.steps ?? [];
    if (planStepId) {
      const idx = steps.findIndex((s) => s.id === planStepId);
      if (idx >= 0) return idx;
    }
    const planExecutor = skillDef?.planning?.planExecutor;
    if (planExecutor) {
      const idx = steps.findIndex((s) => s.tool === planExecutor);
      if (idx >= 0) return idx;
    }
    return 0;
  }

  /**
   * @param {SkillDefinition} skillDef
   * @param {SkillExecution} execution
   * @param {number} completedStepIndex
   * @returns {Promise<SkillExecution | null>}
   */
  async _maybePauseForPlanApproval(skillDef, execution, completedStepIndex) {
    if (!shouldPlanFirst(skillDef, execution.ctx)) return null;
    if (!isPlanPhaseComplete(skillDef, completedStepIndex)) return null;
    if (!hasExecuteStepRemaining(skillDef, completedStepIndex)) return null;

    const planArtifact = buildPlanArtifactFromExecution(skillDef, execution);
    if (!planArtifact) return null;

    execution.status = SKILL_STATUS_AWAITING_PLAN_APPROVAL;
    execution.canResume = true;
    execution.currentStep = completedStepIndex + 1;
    execution.planArtifact = planArtifact;
    execution.completedAt = undefined;
    executionStore.set(execution.id, execution);

    await persistPlanApprovalPending({
      missionId: execution.missionId,
      execution,
      skillDef,
      planArtifact,
    });

    this._emitStepEvent(
      execution,
      { id: skillDef.planning?.planStepId ?? 'plan', name: 'Plan ready' },
      'completed',
      { plan: planArtifact },
      'skill:plan_ready',
    );
    this._persistExecutionSnapshot(execution);
    return execution;
  }

  /**
   * @param {SkillDefinition} skillDef
   * @param {object} ctx
   * @returns {SkillExecution}
   */
  _createExecution(skillDef, ctx) {
    const missionId = String(ctx?.missionId ?? '').trim() || 'unknown';
    return {
      id: randomUUID(),
      skillName: skillDef.name,
      missionId,
      status: 'running',
      currentStep: 0,
      stepResults: {},
      ctx: { ...ctx, skillDef },
      startedAt: new Date().toISOString(),
      canResume: false,
    };
  }

  /**
   * @param {SkillDefinition} skillDef
   * @param {SkillExecution} execution
   * @param {number} startIndex
   * @returns {Promise<SkillExecution>}
   */
  async _runFromStep(skillDef, execution, startIndex) {
    const steps = Array.isArray(skillDef.steps) ? skillDef.steps : [];
    const retryPolicy = resolveRetryPolicy(skillDef.retryPolicy);
    const ctx = execution.ctx;

    for (let i = startIndex; i < steps.length; i += 1) {
      const step = steps[i];
      execution.currentStep = i;

      if (typeof step.condition === 'function') {
        let shouldRun = true;
        try {
          shouldRun = Boolean(step.condition(ctx, execution.stepResults));
        } catch {
          shouldRun = false;
        }
        if (!shouldRun) {
          execution.stepResults[step.id] = { skipped: true };
          if (skillDef.observable !== false) {
            this._emitStepEvent(execution, step, 'skipped', { skipped: true });
          }
          continue;
        }
      }

      // Execute step requires approved plan when skill uses plan-first flow.
      const executeStepId = skillDef?.planning?.executeStepId;
      if (
        executeStepId &&
        step.id === executeStepId &&
        shouldPlanFirst(skillDef, ctx) &&
        !ctx?.approvedPlan
      ) {
        const paused = await this._maybePauseForPlanApproval(skillDef, execution, i - 1);
        if (paused) return paused;
        execution.status = SKILL_STATUS_AWAITING_PLAN_APPROVAL;
        execution.canResume = true;
        execution.currentStep = i;
        executionStore.set(execution.id, execution);
        this._persistExecutionSnapshot(execution);
        return execution;
      }

      if (!step.tool) {
        execution.stepResults[step.id] = { skipped: true, reason: 'delegated_to_skill' };
        if (skillDef.observable !== false) {
          this._emitStepEvent(execution, step, 'skipped', {
            skipped: true,
            reason: 'delegated_to_skill',
          });
        }
        continue;
      }

      const builtInput =
        typeof step.buildInput === 'function'
          ? step.buildInput(ctx, execution.stepResults)
          : i === 0 && ctx.toolInput && typeof ctx.toolInput === 'object'
            ? { ...ctx.toolInput }
            : {};

      const toolContext = {
        missionId: ctx.missionId,
        userId: ctx.userId,
        storeId: ctx.storeId,
        ...ctx,
      };

      let attempt = 0;
      let stepResult = null;
      let lastError = null;

      while (attempt < retryPolicy.maxAttempts) {
        attempt += 1;
        try {
          const dispatchResult = await this.toolDispatcher(step.tool, builtInput, toolContext);
          const ok = dispatchResult?.status === 'ok';
          stepResult = {
            ok,
            output: dispatchResult?.output ?? null,
            error: dispatchResult?.error ?? null,
            blocker: dispatchResult?.blocker ?? null,
            attempts: attempt,
          };
          if (ok) break;
          lastError = dispatchResult?.error ?? dispatchResult?.blocker ?? { message: 'step failed' };
          if (!retryPolicy.shouldRetry(lastError) || attempt >= retryPolicy.maxAttempts) break;
          await sleep(retryPolicy.backoffMs * attempt);
        } catch (err) {
          lastError = { message: err?.message || String(err), code: err?.code ?? 'SKILL_STEP_FAILED' };
          stepResult = { ok: false, error: lastError, attempts: attempt };
          if (!retryPolicy.shouldRetry(lastError) || attempt >= retryPolicy.maxAttempts) break;
          await sleep(retryPolicy.backoffMs * attempt);
        }
      }

      execution.stepResults[step.id] = stepResult ?? { ok: false, error: lastError };

      if (stepResult?.ok) {
        if (skillDef.observable !== false) {
          this._emitStepEvent(execution, step, 'completed', stepResult);
        }

        const paused = await this._maybePauseForPlanApproval(skillDef, execution, i);
        if (paused) return paused;

        continue;
      }

      if (skillDef.observable !== false) {
        this._emitStepEvent(execution, step, 'failed', stepResult);
      }

      const required = step.required !== false;
      if (!required) {
        continue;
      }

      execution.status = 'failed';
      execution.failedReason = lastError?.message ?? 'Required step failed';
      execution.canResume = true;
      execution.completedAt = new Date().toISOString();
      executionStore.set(execution.id, execution);
      this._emitStepEvent(execution, step, 'failed', stepResult, 'skill:failed');
      this._persistExecutionSnapshot(execution);
      return execution;
    }

    execution.status = 'completed';
    execution.currentStep = steps.length;
    execution.completedAt = new Date().toISOString();
    execution.canResume = false;
    executionStore.set(execution.id, execution);
    this._emitStepEvent(execution, { id: 'final', name: 'complete' }, 'completed', execution.stepResults, 'skill:completed');
    this._persistExecutionSnapshot(execution);
    return execution;
  }

  /**
   * @param {SkillExecution} execution
   * @param {object} step
   * @param {string} status
   * @param {object} result
   * @param {string} [eventType]
   */
  _emitStepEvent(execution, step, status, result, eventType) {
    const missionId = String(execution.missionId ?? '').trim();
    if (!missionId || missionId === 'unknown') return;

    const type =
      eventType ??
      (status === 'completed'
        ? 'skill:step_completed'
        : status === 'failed'
          ? 'skill:step_failed'
          : 'skill:step_skipped');

    const payload = {
      skillName: execution.skillName,
      executionId: execution.id,
      stepId: step.id,
      stepName: step.name,
      status,
      result,
    };

    try {
      const append = this.blackboard?.appendEvent;
      if (typeof append === 'function') {
        void append(missionId, type, payload).catch((err) => {
          console.warn('[SkillExecutor] blackboard emit failed:', err?.message ?? err);
        });
      }
    } catch (err) {
      console.warn('[SkillExecutor] _emitStepEvent error:', err?.message ?? err);
    }
  }

  /**
   * @param {SkillExecution} execution
   */
  _persistExecutionSnapshot(execution) {
    const missionId = String(execution.missionId ?? '').trim();
    if (!missionId || missionId === 'unknown') return;
    try {
      const append = this.blackboard?.appendEvent;
      if (typeof append === 'function') {
        void append(missionId, 'skill:execution_snapshot', {
          executionId: execution.id,
          skillName: execution.skillName,
          status: execution.status,
          currentStep: execution.currentStep,
          stepResults: execution.stepResults,
          failedReason: execution.failedReason ?? null,
          canResume: execution.canResume,
          planArtifact: execution.planArtifact ?? null,
          skillDef: execution.ctx?.skillDef ?? null,
        }).catch(() => {});
      }
    } catch {
      /* non-fatal */
    }
  }

  /**
   * @param {string} executionId
   * @param {string} [missionId]
   * @returns {Promise<SkillExecution | null>}
   */
  async _loadExecutionFromBlackboard(executionId, missionId) {
    const mid = String(missionId ?? '').trim();
    if (!mid || !this.prisma?.missionBlackboard?.findMany) return null;
    try {
      const rows = await this.prisma.missionBlackboard.findMany({
        where: { missionId: mid, eventType: 'skill:execution_snapshot' },
        orderBy: { seq: 'desc' },
        take: 20,
      });
      for (const row of rows) {
        let payload = {};
        if (row.payload && typeof row.payload === 'object') {
          payload = row.payload;
        } else if (typeof row.payload === 'string') {
          try {
            payload = JSON.parse(row.payload);
          } catch {
            payload = {};
          }
        }
        if (payload.executionId === executionId) {
          return {
            id: executionId,
            skillName: payload.skillName,
            missionId: mid,
            status: payload.status ?? 'paused',
            currentStep: Number(payload.currentStep) || 0,
            stepResults: payload.stepResults ?? {},
            ctx: { skillDef: payload.skillDef ?? null },
            startedAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
            canResume: payload.canResume === true,
            failedReason: payload.failedReason ?? undefined,
            planArtifact: payload.planArtifact ?? undefined,
          };
        }
      }
    } catch (err) {
      console.warn('[SkillExecutor] load snapshot failed:', err?.message ?? err);
    }
    return null;
  }
}

/** Test helper — clear in-memory execution cache. */
export function clearSkillExecutionStoreForTests() {
  executionStore.clear();
}
