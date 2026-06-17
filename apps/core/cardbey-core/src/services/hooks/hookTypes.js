/**
 * Lifecycle Hook Types — pre, post, error, retry, timeout, rollback, complete.
 */

import { randomUUID } from 'node:crypto';

export const HOOK_TYPES = {
  PRE_EXECUTION: 'pre_execution',
  POST_EXECUTION: 'post_execution',
  ON_ERROR: 'on_error',
  ON_RETRY: 'on_retry',
  ON_TIMEOUT: 'on_timeout',
  ON_ROLLBACK: 'on_rollback',
  ON_COMPLETE: 'on_complete',
};

export const HOOK_PRIORITIES = {
  CRITICAL: 100,
  HIGH: 80,
  NORMAL: 50,
  LOW: 20,
  OPTIONAL: 0,
};

export class Hook {
  /**
   * @param {object} config
   */
  constructor(config) {
    this.id = config.id || randomUUID();
    this.type = config.type;
    this.name = config.name || this.id;
    this.priority = config.priority ?? HOOK_PRIORITIES.NORMAL;
    this.handler = config.handler;
    this.condition = config.condition || null;
    this.timeout = config.timeout ?? 5000;
    this.retry = config.retry ?? { maxAttempts: 1, backoff: 0 };
    this.enabled = config.enabled !== false;
    this.skillId = config.skillId ? String(config.skillId).trim() : null;
  }

  /**
   * @param {object} context
   */
  async execute(context) {
    if (!this.enabled) return { skipped: true };

    if (this.condition) {
      const ok = await this.condition(context);
      if (!ok) return { skipped: true, reason: 'condition_not_met' };
    }

    let lastError = null;
    const maxAttempts = Math.max(1, Number(this.retry.maxAttempts) || 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await this.executeWithTimeout(context);
        return { success: true, result };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts - 1) {
          await this.wait(this.retry.backoff * 2 ** attempt);
        }
      }
    }

    throw lastError || new Error('Hook execution failed');
  }

  /**
   * @param {object} context
   */
  async executeWithTimeout(context) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Hook ${this.id} timed out after ${this.timeout}ms`));
      }, this.timeout);

      Promise.resolve(this.handler(context))
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * @param {number} ms
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      priority: this.priority,
      skillId: this.skillId,
      timeout: this.timeout,
      enabled: this.enabled,
    };
  }
}
