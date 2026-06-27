/**
 * ============================================================
 * PHASE D — PERSONALIZATION
 * ============================================================
 *
 * Enriches user profiles and adapts reasoning defaults from learned behavior.
 */

import { getPrismaClient } from '../prisma.js';

export class Personalization {
  /**
   * @param {string} userId
   * @returns {Promise<import('./feedbackTypes.ts').UserProfile | null>}
   */
  async getProfile(userId) {
    try {
      const prisma = getPrismaClient();
      const profile = await prisma.userProfile.findUnique({ where: { userId } });
      if (!profile) return null;

      return this._normalizeProfile(profile);
    } catch (err) {
      if (String(err?.message ?? '').includes('does not exist')) return null;
      throw err;
    }
  }

  /**
   * @param {string} userId
   * @param {Partial<import('./feedbackTypes.ts').UserProfile>} patch
   */
  async upsertProfile(userId, patch = {}) {
    const prisma = getPrismaClient();
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: {
        ...patch,
        updatedAt: new Date(),
      },
      create: {
        userId,
        preferredWorkflows: patch.preferredWorkflows ?? [],
        skippedSteps: patch.skippedSteps ?? [],
        frequentlyUsedTools: patch.frequentlyUsedTools ?? [],
        defaultAction: patch.defaultAction ?? null,
        confidenceCalibration: patch.confidenceCalibration ?? null,
        learningEnabled: patch.learningEnabled ?? true,
      },
    });

    return this._normalizeProfile(profile);
  }

  /**
   * Merge learned preferences into session context for reasoning.
   *
   * @param {Record<string, unknown>} context
   * @param {import('./feedbackTypes.ts').UserProfile} profile
   */
  enrichContext(context, profile) {
    const preferences = {
      ...(context.preferences && typeof context.preferences === 'object' ? context.preferences : {}),
      preferredWorkflowOrder: profile.preferredWorkflows ?? [],
      skippedSteps: profile.skippedSteps ?? [],
      frequentlyUsedTools: profile.frequentlyUsedTools ?? [],
      defaultAction: profile.defaultAction ?? null,
    };

    return {
      preferences,
      preferredTools: profile.frequentlyUsedTools ?? [],
      skippedSteps: profile.skippedSteps ?? [],
      defaultAction: profile.defaultAction ?? null,
    };
  }

  /**
   * Rank tools with frequently used tools first.
   *
   * @param {string[]} tools
   * @param {string[]} preferredTools
   */
  rankTools(tools, preferredTools = []) {
    if (!preferredTools.length) return [...tools];

    const preferredRank = new Map(preferredTools.map((tool, index) => [tool, index]));
    return [...tools].sort((a, b) => {
      const aRank = preferredRank.get(a);
      const bRank = preferredRank.get(b);
      if (aRank != null && bRank != null) return aRank - bRank;
      if (aRank != null) return -1;
      if (bRank != null) return 1;
      return 0;
    });
  }

  /**
   * Pick default action when confidence is low.
   *
   * @param {import('./feedbackTypes.ts').UserProfile | null} profile
   * @param {string | null} fallback
   */
  selectDefaultAction(profile, fallback = 'ask_clarification') {
    return profile?.defaultAction || fallback;
  }

  /**
   * Remove steps the user habitually skips.
   *
   * @param {string[]} steps
   * @param {string[]} skippedSteps
   */
  optimizeWorkflow(steps, skippedSteps = []) {
    if (!skippedSteps.length) return [...steps];
    const skipSet = new Set(skippedSteps);
    return steps.filter((step) => !skipSet.has(step));
  }

  /**
   * Reorder suggested actions using preferred tools.
   *
   * @param {Array<{ tool?: string | null; priority?: number }>} actions
   * @param {string[]} preferredTools
   */
  rankSuggestedActions(actions, preferredTools = []) {
    if (!actions?.length || !preferredTools.length) return actions ?? [];

    const preferredRank = new Map(preferredTools.map((tool, index) => [tool, index]));

    return [...actions].sort((a, b) => {
      const aRank = a.tool ? preferredRank.get(a.tool) : undefined;
      const bRank = b.tool ? preferredRank.get(b.tool) : undefined;
      if (aRank != null && bRank != null) return aRank - bRank;
      if (aRank != null) return -1;
      if (bRank != null) return 1;
      return (b.priority ?? 0) - (a.priority ?? 0);
    });
  }

  /**
   * @param {Record<string, unknown>} profile
   * @returns {import('./feedbackTypes.ts').UserProfile}
   */
  _normalizeProfile(profile) {
    return {
      userId: String(profile.userId),
      preferredWorkflows: this._asStringArray(profile.preferredWorkflows),
      skippedSteps: this._asStringArray(profile.skippedSteps),
      frequentlyUsedTools: this._asStringArray(profile.frequentlyUsedTools),
      defaultAction: profile.defaultAction ? String(profile.defaultAction) : null,
      confidenceCalibration: this._normalizeCalibration(profile.confidenceCalibration),
      learningEnabled: profile.learningEnabled !== false,
      updatedAt: profile.updatedAt instanceof Date
        ? profile.updatedAt.toISOString()
        : String(profile.updatedAt ?? new Date().toISOString()),
    };
  }

  /**
   * @param {unknown} value
   */
  _asStringArray(value) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * @param {unknown} value
   */
  _normalizeCalibration(value) {
    if (!value || typeof value !== 'object') {
      return {
        intentWeights: {},
        toolWeights: {},
        overallBias: 0,
        lastCalibrated: new Date().toISOString(),
      };
    }

    const calibration = /** @type {Record<string, unknown>} */ (value);
    return {
      intentWeights:
        calibration.intentWeights && typeof calibration.intentWeights === 'object'
          ? /** @type {Record<string, number>} */ (calibration.intentWeights)
          : {},
      toolWeights:
        calibration.toolWeights && typeof calibration.toolWeights === 'object'
          ? /** @type {Record<string, number>} */ (calibration.toolWeights)
          : {},
      overallBias: typeof calibration.overallBias === 'number' ? calibration.overallBias : 0,
      lastCalibrated:
        typeof calibration.lastCalibrated === 'string'
          ? calibration.lastCalibrated
          : new Date().toISOString(),
    };
  }
}
