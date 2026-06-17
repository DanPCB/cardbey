/**
 * Hook Executor — run lifecycle hooks for skill/mission execution.
 */

import hookRegistry from './hookRegistry.js';
import { HOOK_PRIORITIES } from './hookTypes.js';

export class HookExecutor {
  /**
   * @param {import('./hookRegistry.js').HookRegistry} [registry]
   */
  constructor(registry = hookRegistry) {
    this.registry = registry;
  }

  /**
   * @param {string} skillId
   * @param {object} context
   */
  async executePreHooks(skillId, context) {
    const hooks = this.registry.getPreHooks(skillId);
    return this.executeHooks(hooks, context, 'pre');
  }

  /**
   * @param {string} skillId
   * @param {object} context
   * @param {object} result
   */
  async executePostHooks(skillId, context, result) {
    const hooks = this.registry.getPostHooks(skillId);
    return this.executeHooks(hooks, { ...context, result }, 'post');
  }

  /**
   * @param {string} skillId
   * @param {object} context
   * @param {Error} error
   */
  async executeErrorHooks(skillId, context, error) {
    const hooks = this.registry.getErrorHooks(skillId);
    return this.executeHooks(hooks, { ...context, error }, 'error');
  }

  /**
   * @param {string} skillId
   * @param {object} context
   * @param {number} attempt
   */
  async executeRetryHooks(skillId, context, attempt) {
    const hooks = this.registry.getRetryHooks(skillId);
    return this.executeHooks(hooks, { ...context, attempt }, 'retry');
  }

  /**
   * @param {string} skillId
   * @param {object} context
   */
  async executeTimeoutHooks(skillId, context) {
    const hooks = this.registry.getTimeoutHooks(skillId);
    return this.executeHooks(hooks, context, 'timeout');
  }

  /**
   * @param {string} skillId
   * @param {object} context
   * @param {Error} error
   */
  async executeRollbackHooks(skillId, context, error) {
    const hooks = this.registry.getRollbackHooks(skillId);
    return this.executeHooks(hooks, { ...context, error }, 'rollback');
  }

  /**
   * @param {string} skillId
   * @param {object} context
   * @param {object|null} result
   * @param {Error|null} [error]
   */
  async executeCompleteHooks(skillId, context, result, error = null) {
    const hooks = this.registry.getCompleteHooks(skillId);
    return this.executeHooks(hooks, { ...context, result, error }, 'complete');
  }

  /**
   * @param {import('./hookTypes.js').Hook[]} hooks
   * @param {object} context
   * @param {string} phase
   */
  async executeHooks(hooks, context, phase) {
    const results = [];
    const errors = [];

    for (const hook of hooks) {
      try {
        const result = await hook.execute(context);
        results.push({ hookId: hook.id, result, phase });
      } catch (error) {
        console.error(`[HookExecutor] ${hook.id} (${phase}) failed:`, error?.message || error);
        errors.push({ hookId: hook.id, error, phase });

        if (hook.priority >= HOOK_PRIORITIES.CRITICAL) {
          throw new Error(`Critical hook ${hook.id} failed: ${error?.message || error}`);
        }
      }
    }

    return { results, errors };
  }
}

const hookExecutor = new HookExecutor();
export default hookExecutor;
