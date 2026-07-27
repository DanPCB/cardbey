/**
 * High-level API for accessing and updating context.
 */

import { deepMergeContext, detectInteractionType, generateContextId } from './contextUtils.js';
import { CONTEXT_VERSION } from './contextUtils.js';

/**
 * @typedef {import('./contextTypes.ts').UserContext} UserContext
 * @typedef {import('./contextTypes.ts').ContextUpdate} ContextUpdate
 */

export class ContextProvider {
  /**
   * @param {{ store: import('./contextStore.js').ContextStore }} opts
   */
  constructor({ store }) {
    this.store = store;
    /** @type {Map<string, { context: UserContext; timestamp: number }>} */
    this._contextCache = new Map();
    this._memoryTtlMs = 5000;
  }

  /**
   * @param {string | null | undefined} userId
   * @param {string | null | undefined} sessionId
   * @returns {Promise<UserContext | null>}
   */
  async getContext(userId, sessionId) {
    if (!userId || !sessionId) {
      return this._createAnonymousContext();
    }

    const cacheKey = `${userId}:${sessionId}`;
    const entry = this._contextCache.get(cacheKey);
    if (entry && Date.now() - entry.timestamp < this._memoryTtlMs) {
      return entry.context;
    }

    const context = await this.store.getContext(userId, sessionId);
    if (context) {
      this._contextCache.set(cacheKey, { context, timestamp: Date.now() });
    }
    return context;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @returns {Promise<UserContext>}
   */
  async getOrCreateContext(userId, sessionId) {
    let context = await this.getContext(userId, sessionId);
    if (!context || !context.userId) {
      context = this.store._createEmptyContext(userId, sessionId);
      await this.store.updateContext(userId, sessionId, context);
      this._invalidateCache(userId, sessionId);
    }
    return context;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {ContextUpdate} update
   * @returns {Promise<UserContext>}
   */
  async updateContext(userId, sessionId, update) {
    const merged = await this.store.updateContext(userId, sessionId, update);
    this._invalidateCache(userId, sessionId);
    return merged;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {unknown} input
   * @param {unknown} output
   * @param {string | null} intent
   * @param {number | null} confidence
   * @param {number} [durationMs]
   */
  async recordInteraction(userId, sessionId, input, output, intent, confidence, durationMs = 0) {
    const interaction = {
      id: generateContextId(),
      timestamp: new Date().toISOString(),
      type: detectInteractionType(input),
      input,
      output,
      intent,
      confidence,
      durationMs,
    };

    await this.store.addInteraction(userId, sessionId, interaction);
    this._invalidateCache(userId, sessionId);
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} type
   * @param {string} tool
   * @param {unknown} result
   * @param {boolean} success
   */
  async recordAction(userId, sessionId, type, tool, result, success) {
    const action = {
      id: generateContextId(),
      timestamp: new Date().toISOString(),
      type,
      tool,
      result,
      success,
    };

    await this.store.addCompletedAction(userId, sessionId, action);
    this._invalidateCache(userId, sessionId);
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   */
  async clearSession(userId, sessionId) {
    await this.store.clearSession(userId, sessionId);
    this._invalidateCache(userId, sessionId);
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   */
  _invalidateCache(userId, sessionId) {
    this._contextCache.delete(`${userId}:${sessionId}`);
  }

  /**
   * @returns {UserContext}
   */
  _createAnonymousContext() {
    const now = new Date().toISOString();
    return {
      sessionId: 'anonymous',
      userId: 'anonymous',
      currentWorkflow: null,
      activeMissionId: null,
      currentStepId: null,
      activeStoreId: null,
      activeCampaignId: null,
      activeDraftId: null,
      interactions: [],
      completedActions: [],
      pendingCheckpoints: [],
      preferences: {
        preferredWorkflowOrder: [],
        skippedSteps: [],
        language: 'en',
        notificationPreferences: {},
        defaultAction: null,
        frequentlyUsedTools: [],
      },
      behaviorPatterns: [],
      systemCapabilities: [],
      currentInputContext: null,
      metadata: {
        createdAt: now,
        updatedAt: now,
        version: CONTEXT_VERSION,
        lastActivityAt: now,
        totalInteractions: 0,
      },
    };
  }
}
