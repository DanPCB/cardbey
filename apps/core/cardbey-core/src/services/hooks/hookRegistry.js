/**
 * Hook Registry — register, discover, and manage lifecycle hooks.
 */

import { HOOK_TYPES, HOOK_PRIORITIES, Hook } from './hookTypes.js';

export class HookRegistry {
  constructor() {
    /** @type {Map<string, Hook>} */
    this.hooks = new Map();
    /** @type {Map<string, Hook[]>} */
    this.byType = new Map();
    /** @type {Map<string, Hook[]>} */
    this.bySkill = new Map();
  }

  /**
   * @param {object} hookConfig
   */
  register(hookConfig) {
    const hook = new Hook(hookConfig);

    this.hooks.set(hook.id, hook);

    if (!this.byType.has(hook.type)) {
      this.byType.set(hook.type, []);
    }
    this.byType.get(hook.type).push(hook);

    if (hook.skillId) {
      if (!this.bySkill.has(hook.skillId)) {
        this.bySkill.set(hook.skillId, []);
      }
      this.bySkill.get(hook.skillId).push(hook);
    }

    console.log(`[HookRegistry] Registered ${hook.id} (${hook.type})`);
    return hook;
  }

  /**
   * @param {string} type
   * @param {string|null} [skillId]
   */
  getByType(type, skillId = null) {
    let hooks = [...(this.byType.get(type) || [])];

    if (skillId) {
      const sid = String(skillId).trim();
      hooks = hooks.filter((h) => !h.skillId || h.skillId === sid);
    }

    return hooks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * @param {string|null} [skillId]
   */
  getPreHooks(skillId = null) {
    return this.getByType(HOOK_TYPES.PRE_EXECUTION, skillId);
  }

  /**
   * @param {string|null} [skillId]
   */
  getPostHooks(skillId = null) {
    return this.getByType(HOOK_TYPES.POST_EXECUTION, skillId);
  }

  /**
   * @param {string|null} [skillId]
   */
  getErrorHooks(skillId = null) {
    return this.getByType(HOOK_TYPES.ON_ERROR, skillId);
  }

  /**
   * @param {string|null} [skillId]
   */
  getRetryHooks(skillId = null) {
    return this.getByType(HOOK_TYPES.ON_RETRY, skillId);
  }

  /**
   * @param {string|null} [skillId]
   */
  getTimeoutHooks(skillId = null) {
    return this.getByType(HOOK_TYPES.ON_TIMEOUT, skillId);
  }

  /**
   * @param {string|null} [skillId]
   */
  getRollbackHooks(skillId = null) {
    return this.getByType(HOOK_TYPES.ON_ROLLBACK, skillId);
  }

  /**
   * @param {string|null} [skillId]
   */
  getCompleteHooks(skillId = null) {
    return this.getByType(HOOK_TYPES.ON_COMPLETE, skillId);
  }

  /**
   * @param {string} hookId
   */
  unregister(hookId) {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;

    this.hooks.delete(hookId);

    const typeHooks = this.byType.get(hook.type) || [];
    this.byType.set(
      hook.type,
      typeHooks.filter((h) => h.id !== hookId),
    );

    if (hook.skillId) {
      const skillHooks = this.bySkill.get(hook.skillId) || [];
      this.bySkill.set(
        hook.skillId,
        skillHooks.filter((h) => h.id !== hookId),
      );
    }

    console.log(`[HookRegistry] Unregistered ${hookId}`);
    return true;
  }

  list() {
    return Array.from(this.hooks.values()).map((h) => h.toJSON());
  }

  clear() {
    this.hooks.clear();
    this.byType.clear();
    this.bySkill.clear();
  }
}

const hookRegistry = new HookRegistry();
export default hookRegistry;
export { HOOK_TYPES, HOOK_PRIORITIES };
