/**
 * Persistent storage for user context.
 * Uses Prisma (JSON blob) + in-memory cache for performance.
 */

import {
  CONTEXT_VERSION,
  deepMergeContext,
  extractInputContextFromInteraction,
} from './contextUtils.js';
import {
  deleteCachedContext,
  getCachedContext,
  setCachedContext,
} from './contextCache.js';

/**
 * @typedef {import('./contextTypes.ts').UserContext} UserContext
 * @typedef {import('./contextTypes.ts').ContextUpdate} ContextUpdate
 * @typedef {import('./contextTypes.ts').Interaction} Interaction
 * @typedef {import('./contextTypes.ts').CompletedAction} CompletedAction
 */

export class ContextStore {
  /**
   * @param {{ db: import('../prisma.js').PrismaClient; ttl?: number }} opts
   */
  constructor({ db, ttl = 3600 }) {
    this.db = db;
    this.ttl = ttl;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @returns {Promise<UserContext | null>}
   */
  async getContext(userId, sessionId) {
    const uid = String(userId ?? '').trim();
    const sid = String(sessionId ?? '').trim();
    if (!uid || !sid) return null;

    const cached = await getCachedContext(uid, sid, this.ttl);
    if (cached) return /** @type {UserContext} */ (cached);

    try {
      const record = await this.db.performerSessionContext.findFirst({
        where: { userId: uid, sessionId: sid, active: true },
      });
      if (!record) return null;

      const context = this._hydrateContext(record);
      await setCachedContext(uid, sid, context, this.ttl);
      return context;
    } catch (err) {
      if (
        String(err?.message ?? '').includes('performer_session_contexts') &&
        String(err?.message ?? '').includes('does not exist')
      ) {
        console.warn('[ContextStore] performer_session_contexts table missing');
        return null;
      }
      throw err;
    }
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {ContextUpdate | UserContext} update
   * @returns {Promise<UserContext>}
   */
  async updateContext(userId, sessionId, update) {
    const uid = String(userId ?? '').trim();
    const sid = String(sessionId ?? '').trim();
    if (!uid || !sid) {
      throw new Error('ContextStore.updateContext requires userId and sessionId');
    }

    const existing = (await this.getContext(uid, sid)) || this._createEmptyContext(uid, sid);
    const merged = /** @type {UserContext} */ (
      deepMergeContext(/** @type {Record<string, unknown>} */ (existing), /** @type {Record<string, unknown>} */ (update))
    );
    merged.metadata = {
      ...merged.metadata,
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    await this._persistContext(uid, sid, merged);
    await deleteCachedContext(uid, sid);
    return merged;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {Interaction} interaction
   * @returns {Promise<UserContext>}
   */
  async addInteraction(userId, sessionId, interaction) {
    const uid = String(userId ?? '').trim();
    const sid = String(sessionId ?? '').trim();
    const context = (await this.getContext(uid, sid)) || this._createEmptyContext(uid, sid);

    context.interactions.unshift(interaction);
    context.metadata.totalInteractions = (context.metadata.totalInteractions ?? 0) + 1;
    context.metadata.updatedAt = new Date().toISOString();
    context.metadata.lastActivityAt = new Date().toISOString();
    context.currentInputContext = extractInputContextFromInteraction(interaction);

    if (context.interactions.length > 100) {
      context.interactions = context.interactions.slice(0, 100);
    }

    await this._persistContext(uid, sid, context);
    await deleteCachedContext(uid, sid);
    return context;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {CompletedAction} action
   * @returns {Promise<UserContext | null>}
   */
  async addCompletedAction(userId, sessionId, action) {
    const context = await this.getContext(userId, sessionId);
    if (!context) return null;

    context.completedActions.unshift(action);
    if (context.completedActions.length > 50) {
      context.completedActions = context.completedActions.slice(0, 50);
    }
    context.metadata.updatedAt = new Date().toISOString();

    await this._persistContext(userId, sessionId, context);
    await deleteCachedContext(userId, sessionId);
    return context;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {import('./contextTypes.ts').PendingCheckpoint[]} checkpoints
   * @returns {Promise<UserContext | null>}
   */
  async setPendingCheckpoints(userId, sessionId, checkpoints) {
    const context = await this.getContext(userId, sessionId);
    if (!context) return null;

    context.pendingCheckpoints = checkpoints;
    context.metadata.updatedAt = new Date().toISOString();

    await this._persistContext(userId, sessionId, context);
    await deleteCachedContext(userId, sessionId);
    return context;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   */
  async clearSession(userId, sessionId) {
    const uid = String(userId ?? '').trim();
    const sid = String(sessionId ?? '').trim();
    if (!uid || !sid) return;

    await deleteCachedContext(uid, sid);
    await this.db.performerSessionContext.updateMany({
      where: { userId: uid, sessionId: sid },
      data: { active: false, endedAt: new Date() },
    });
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @returns {UserContext}
   */
  _createEmptyContext(userId, sessionId) {
    const now = new Date().toISOString();
    return {
      sessionId,
      userId,
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

  /**
   * @param {{ contextJson: string | unknown }} record
   * @returns {UserContext}
   */
  _hydrateContext(record) {
    try {
      const raw = typeof record.contextJson === 'string' ? JSON.parse(record.contextJson) : record.contextJson;
      if (raw && typeof raw === 'object') {
        return /** @type {UserContext} */ (raw);
      }
    } catch {
      // fall through
    }
    return this._createEmptyContext('', '');
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {UserContext} context
   */
  async _persistContext(userId, sessionId, context) {
    const payload = JSON.stringify(context);
    try {
      await this.db.performerSessionContext.upsert({
        where: { userId_sessionId: { userId, sessionId } },
        update: {
          contextJson: payload,
          active: true,
          endedAt: null,
        },
        create: {
          userId,
          sessionId,
          contextJson: payload,
          active: true,
        },
      });
    } catch (err) {
      if (
        String(err?.message ?? '').includes('performer_session_contexts') &&
        String(err?.message ?? '').includes('does not exist')
      ) {
        console.warn('[ContextStore] performer_session_contexts table missing — cannot persist context');
        return;
      }
      throw err;
    }
  }
}
