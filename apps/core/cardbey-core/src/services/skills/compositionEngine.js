/**
 * Skill Composition Engine — sequence, parallel, and conditional composition.
 */

import { ensureRuntimeAuthorizedContext } from '../../lib/runtime/performerRuntime/runtimeOwnership.js';
import composableSkillRegistry from './skillRegistry.js';
import bulkhead from '../reliability/bulkhead.js';
import observationBus from '../../lib/runtime/observationBus.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeSkillOutput(context, result) {
  if (!result?.output || typeof result.output !== 'object') return context;
  const patch =
    result.output.data && typeof result.output.data === 'object'
      ? result.output.data
      : result.output;
  return { ...context, ...patch };
}

function backoffDelay(attempt, policy = {}) {
  const base = Math.max(0, Number(policy.backoffMs) || 500);
  if (policy.backoff === 'exponential') {
    return base * 2 ** Math.max(0, attempt - 1);
  }
  return base;
}

export class CompositionEngine {
  /**
   * @param {{ toolDispatcher?: (tool: string, input: object, context: object) => Promise<object> }} [deps]
   */
  constructor(deps = {}) {
    this.toolDispatcher = deps.toolDispatcher ?? null;
    this.registry = deps.registry ?? composableSkillRegistry;
  }

  /**
   * @param {Array<object>} skills
   * @param {object} context
   */
  async sequence(skills, context) {
    const results = [];
    let merged = { ...context };
    for (const skill of skills) {
      const result = await this.executeSkill(skill, merged);
      results.push(result);
      merged = mergeSkillOutput(merged, result);
    }
    return { results, context: merged };
  }

  /**
   * @param {Array<object>} skills
   * @param {object} context
   */
  async parallel(skills, context) {
    const results = await Promise.all(skills.map((skill) => this.executeSkill(skill, context)));
    return { results };
  }

  /**
   * @param {boolean | ((ctx: object) => boolean | Promise<boolean>)} condition
   * @param {object} onTrue
   * @param {object|null} onFalse
   * @param {object} context
   */
  async condition(condition, onTrue, onFalse, context) {
    const result =
      typeof condition === 'function' ? await condition(context) : Boolean(condition);

    if (result) {
      return this.executeSkill(onTrue, context);
    }
    if (onFalse) {
      return this.executeSkill(onFalse, context);
    }
    return { skipped: true };
  }

  /**
   * @param {{ id: string; version?: string; fallback?: string; timeout?: number }} skillDef
   * @param {object} context
   */
  async executeSkill(skillDef, context) {
    return bulkhead.execute('skill_execution', () => this._executeSkillInner(skillDef, context));
  }

  /**
   * @param {{ id: string; version?: string; fallback?: string; timeout?: number }} skillDef
   * @param {object} context
   */
  async _executeSkillInner(skillDef, context) {
    const id = String(skillDef?.id ?? '').trim();
    const version = skillDef?.version ? String(skillDef.version).trim() : null;
    const timeout = Number(skillDef?.timeout) || undefined;

    const skill = version
      ? this.registry.getVersion(id, version)
      : this.registry.get(id);

    if (!skill) {
      throw new Error(`Skill ${id}@${version || 'latest'} not found`);
    }

    const authorizedContext = ensureRuntimeAuthorizedContext(context, null, 'composable_skill');

    const fallback =
      (skillDef?.fallback ? String(skillDef.fallback).trim() : null) ||
      (skill?.fallback ? String(skill.fallback).trim() : null);
    const effectiveTimeout = timeout ?? skill.timeout ?? 30_000;

    const { executeWithLifecycleHooks } = await import('../hooks/lifecycleRunner.js');
    const skillStart = Date.now();

    try {
      const result = await executeWithLifecycleHooks(
        id,
        { ...authorizedContext, skillId: id },
        async () => {
          try {
            return await this.executeWithTimeout(skill, authorizedContext, effectiveTimeout);
          } catch (error) {
            console.error(`[CompositionEngine] Skill ${id} failed:`, error?.message || error);

            if (fallback) {
              console.log(`[CompositionEngine] Attempting fallback: ${fallback}`);
              const fallbackSkill = this.registry.get(fallback);
              if (fallbackSkill) {
                return this.executeWithTimeout(fallbackSkill, authorizedContext, effectiveTimeout);
              }
            }

            throw error;
          }
        },
        { maxRetries: skill.retry?.maxAttempts ? Math.max(0, Number(skill.retry.maxAttempts) - 1) : 0 },
      );

      void observationBus
        .emit({
          missionId: authorizedContext.missionId ?? null,
          intent: { type: 'run_skill' },
          action: `skill:${id}`,
          result: { success: true },
          metadata: {
            latency:
              typeof result?.duration === 'number' ? result.duration : Date.now() - skillStart,
            latencyMs:
              typeof result?.duration === 'number' ? result.duration : Date.now() - skillStart,
            storeId: authorizedContext.storeId ?? null,
            userId: authorizedContext.userId ?? null,
            source: authorizedContext.source ?? 'composable_skill',
          },
        })
        .catch(() => {});

      return result;
    } catch (error) {
      void observationBus
        .emit({
          missionId: authorizedContext.missionId ?? null,
          intent: { type: 'run_skill' },
          action: `skill:${id}`,
          result: { success: false, error: error?.message || String(error) },
          metadata: {
            latency: Date.now() - skillStart,
            latencyMs: Date.now() - skillStart,
            storeId: authorizedContext.storeId ?? null,
            userId: authorizedContext.userId ?? null,
            source: authorizedContext.source ?? 'composable_skill',
          },
        })
        .catch(() => {});
      throw error;
    }
  }

  /**
   * @param {object} skill
   * @param {object} context
   * @param {number} timeout
   */
  async executeWithTimeout(skill, context, timeout = 30_000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      return await this.callSkillExecutor(skill, context, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error(`Skill ${skill.id} timed out`);
        timeoutError.name = 'AbortError';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * @param {object} skill
   * @param {object} context
   * @param {AbortSignal} signal
   */
  async callSkillExecutor(skill, context, signal) {
    const steps = Array.isArray(skill.steps) ? skill.steps : [];
    const retryPolicy = skill.retry ?? { maxAttempts: 1, backoff: 'fixed', backoffMs: 500 };
    const stepResults = {};
    let mergedContext = { ...context };

    for (const step of steps) {
      if (signal?.aborted) {
        throw new Error(`Skill ${skill.id} timed out`);
      }

      const action = String(step?.action ?? '').trim();
      if (!action) continue;

      const maxAttempts = Math.max(1, Number(retryPolicy.maxAttempts) || 1);
      let lastError = null;
      let stepOutput = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          stepOutput = await this.dispatchStep(action, mergedContext, step?.params ?? {});
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) {
            await sleep(backoffDelay(attempt, retryPolicy));
          }
        }
      }

      if (lastError) {
        throw lastError;
      }

      stepResults[action] = stepOutput;
      if (stepOutput && typeof stepOutput === 'object') {
        const patch =
          stepOutput.output && typeof stepOutput.output === 'object'
            ? stepOutput.output
            : stepOutput;
        mergedContext = { ...mergedContext, ...patch };
      }
    }

    return {
      skill: skill.id,
      version: skill.version,
      output: {
        success: true,
        stepResults,
        data: mergedContext,
      },
    };
  }

  /**
   * @param {string} action
   * @param {object} context
   * @param {object} params
   */
  async dispatchStep(action, context, params) {
    const authorizedContext = ensureRuntimeAuthorizedContext(context, null, 'composable_skill_step');
    const input = { ...authorizedContext, ...params };

    if (this.toolDispatcher) {
      return this.toolDispatcher(action, input, authorizedContext);
    }

    const { dispatchTool } = await import('../../lib/toolDispatcher.js');
    return dispatchTool(action, input, authorizedContext);
  }
}

const compositionEngine = new CompositionEngine();
export default compositionEngine;
