/**
 * ============================================================
 * PHASE D — MODEL UPDATE
 * ============================================================
 *
 * Updates intent confidence weights, pattern libraries, and user-specific tuning.
 */

import { getPrismaClient } from '../prisma.js';

const POSITIVE_FEEDBACK = new Set(['thumbs_up', 'success', 'rating']);
const NEGATIVE_FEEDBACK = new Set(['thumbs_down', 'failure', 'reroll', 'skip', 'abandon', 'correction']);

export class ModelUpdate {
  /**
   * @param {string} userId
   * @param {import('./feedbackTypes.ts').UserProfile | null} profile
   */
  async getUserTuning(userId, profile = null) {
    const resolvedProfile = profile ?? (await this._loadProfile(userId));
    const patterns = await this._loadPatternLibrary(userId);

    return {
      intentWeights: resolvedProfile?.confidenceCalibration?.intentWeights ?? {},
      toolWeights: resolvedProfile?.confidenceCalibration?.toolWeights ?? {},
      overallBias: resolvedProfile?.confidenceCalibration?.overallBias ?? 0,
      patternLibrary: patterns,
      lastCalibrated: resolvedProfile?.confidenceCalibration?.lastCalibrated ?? null,
    };
  }

  /**
   * @param {string} userId
   * @param {Record<string, unknown>} feedback
   */
  async updateFromFeedback(userId, feedback) {
    const intent = this._resolveIntent(feedback);
    if (!intent) return null;

    const profile = await this._loadProfile(userId);
    const calibration = profile?.confidenceCalibration ?? {
      intentWeights: {},
      toolWeights: {},
      overallBias: 0,
      lastCalibrated: new Date().toISOString(),
    };

    const delta = this._feedbackDelta(feedback.type);
    if (delta === 0) return calibration;

    const currentWeight = calibration.intentWeights[intent] ?? 0.5;
    const nextWeight = Math.min(Math.max(currentWeight + delta, 0.1), 1);

    const nextCalibration = {
      ...calibration,
      intentWeights: {
        ...calibration.intentWeights,
        [intent]: nextWeight,
      },
      lastCalibrated: new Date().toISOString(),
    };

    const prisma = getPrismaClient();
    await prisma.userProfile.upsert({
      where: { userId },
      update: {
        confidenceCalibration: nextCalibration,
        updatedAt: new Date(),
      },
      create: {
        userId,
        confidenceCalibration: nextCalibration,
        learningEnabled: true,
      },
    });

    await this._upsertPatternLibrary(userId, intent, delta > 0);
    return nextCalibration;
  }

  /**
   * Apply calibrated weights to a base confidence score.
   *
   * @param {number} baseConfidence
   * @param {string} intent
   * @param {Record<string, unknown> | null | undefined} tuning
   */
  applyConfidenceTuning(baseConfidence, intent, tuning) {
    const weight = tuning?.intentWeights?.[intent];
    if (typeof weight !== 'number') {
      const bias = typeof tuning?.overallBias === 'number' ? tuning.overallBias : 0;
      return Math.min(Math.max(baseConfidence + bias, 0), 1);
    }

    return Math.min(Math.max(baseConfidence * 0.7 + weight * 0.3, 0), 1);
  }

  /**
   * @param {string} userId
   * @param {Array<Record<string, unknown>>} patterns
   */
  async syncPatternLibrary(userId, patterns) {
    const prisma = getPrismaClient();

    for (const pattern of patterns) {
      if (!pattern?.pattern) continue;
      await prisma.behaviorPattern.upsert({
        where: {
          userId_pattern: {
            userId,
            pattern: String(pattern.pattern),
          },
        },
        update: {
          frequency: Number(pattern.frequency ?? 1),
          confidence: Number(pattern.confidence ?? 0.3),
          lastObserved: new Date(),
          metadata: pattern.metadata ?? {},
        },
        create: {
          userId,
          pattern: String(pattern.pattern),
          frequency: Number(pattern.frequency ?? 1),
          confidence: Number(pattern.confidence ?? 0.3),
          metadata: pattern.metadata ?? {},
        },
      });
    }
  }

  /**
   * @param {string} userId
   */
  async _loadProfile(userId) {
    const prisma = getPrismaClient();
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) return null;

    const calibration = profile.confidenceCalibration;
    return {
      confidenceCalibration:
        calibration && typeof calibration === 'object'
          ? /** @type {import('./feedbackTypes.ts').ConfidenceCalibration} */ (calibration)
          : {
              intentWeights: {},
              toolWeights: {},
              overallBias: 0,
              lastCalibrated: new Date().toISOString(),
            },
    };
  }

  /**
   * @param {string} userId
   */
  async _loadPatternLibrary(userId) {
    const prisma = getPrismaClient();
    const patterns = await prisma.behaviorPattern.findMany({
      where: { userId },
      orderBy: { frequency: 'desc' },
      take: 20,
    });

    return patterns.map((pattern) => ({
      pattern: pattern.pattern,
      frequency: pattern.frequency,
      confidence: pattern.confidence,
      metadata: pattern.metadata ?? {},
    }));
  }

  /**
   * @param {string} userId
   * @param {string} intent
   * @param {boolean} positive
   */
  async _upsertPatternLibrary(userId, intent, positive) {
    const pattern = `intent_accuracy:${intent}`;
    const prisma = getPrismaClient();
    const existing = await prisma.behaviorPattern.findUnique({
      where: { userId_pattern: { userId, pattern } },
    });

    if (existing) {
      await prisma.behaviorPattern.update({
        where: { id: existing.id },
        data: {
          frequency: existing.frequency + 1,
          confidence: Math.min(
            Math.max(existing.confidence + (positive ? 0.05 : -0.05), 0.1),
            1,
          ),
          lastObserved: new Date(),
        },
      });
      return;
    }

    await prisma.behaviorPattern.create({
      data: {
        userId,
        pattern,
        frequency: 1,
        confidence: positive ? 0.55 : 0.35,
        metadata: { intent },
      },
    });
  }

  /**
   * @param {Record<string, unknown>} feedback
   */
  _resolveIntent(feedback) {
    if (feedback.metadata && typeof feedback.metadata === 'object') {
      const metadata = /** @type {Record<string, unknown>} */ (feedback.metadata);
      if (typeof metadata.intent === 'string') return metadata.intent;
      if (typeof metadata.original === 'string') return metadata.original;
    }
    if (typeof feedback.targetId === 'string') return feedback.targetId;
    return null;
  }

  /**
   * @param {string} type
   */
  _feedbackDelta(type) {
    if (POSITIVE_FEEDBACK.has(type)) return 0.05;
    if (NEGATIVE_FEEDBACK.has(type)) return -0.08;
    return 0;
  }
}
