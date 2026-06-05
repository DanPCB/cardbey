/**
 * Executes multi-step skills by composing toolDispatcher calls.
 */

import { randomUUID } from 'node:crypto';

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
    execution.status = 'running';
    execution.canResume = false;
    execution.ctx = { ...execution.ctx, ...ctx };
    executionStore.set(id, execution);
    return this._runFromStep(skillDef, execution, execution.currentStep);
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
        } catch (condErr) {
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
            ctx: {},
            startedAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
            canResume: payload.canResume === true,
            failedReason: payload.failedReason ?? undefined,
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
