/**
 * ============================================================
 * PHASE D — FEEDBACK CAPTURE
 * ============================================================
 *
 * Captures explicit and implicit feedback from user interactions.
 */

import { getPrismaClient } from '../prisma.js';

export class FeedbackCapture {
  /**
   * Capture explicit feedback (thumbs up/down, rating).
   */
  async captureExplicit(userId, sessionId, feedback) {
    const { type, targetType, targetId, value, metadata } = feedback;
    const prisma = getPrismaClient();

    const record = await prisma.userFeedback.create({
      data: {
        userId,
        sessionId,
        type,
        targetType,
        targetId,
        value: typeof value === 'number' ? value : null,
        metadata: {
          ...metadata,
          capturedAt: new Date().toISOString(),
        },
      },
    });

    await this._processFeedback(record);
    return record;
  }

  /**
   * Capture implicit feedback from user actions.
   */
  async captureImplicit(userId, sessionId, action, result) {
    const feedback = this._inferImplicitFeedback(action, result);
    if (feedback) {
      return this.captureExplicit(userId, sessionId, feedback);
    }
    return null;
  }

  /**
   * Capture feedback from mission outcomes.
   */
  async captureMissionOutcome(userId, sessionId, mission) {
    const feedback = {
      type: mission.status === 'completed' ? 'success' : 'failure',
      targetType: 'mission',
      targetId: mission.id,
      value: mission.status === 'completed' ? 1 : 0,
      metadata: {
        intent: mission.intent,
        steps: mission.steps,
        duration: mission.duration,
        completedAt: new Date().toISOString(),
      },
    };

    return this.captureExplicit(userId, sessionId, feedback);
  }

  /**
   * Infer implicit feedback from user actions.
   */
  _inferImplicitFeedback(action, result) {
    if (action === 'reroll') {
      return {
        type: 'reroll',
        targetType: 'response',
        targetId: result?.responseId || 'unknown',
        value: 0,
        metadata: { reason: 'user_reroll', intent: result?.intent },
      };
    }

    if (action === 'skip_step') {
      return {
        type: 'skip',
        targetType: 'plan',
        targetId: result?.stepId || 'unknown',
        value: 0,
        metadata: { step: result?.stepName, intent: result?.intent },
      };
    }

    if (action === 'abandon') {
      return {
        type: 'abandon',
        targetType: 'mission',
        targetId: result?.missionId || 'unknown',
        value: 0,
        metadata: { progress: result?.progress, intent: result?.intent },
      };
    }

    return null;
  }

  /**
   * Process feedback to update behavior patterns.
   */
  async _processFeedback(feedback) {
    await this._updatePatterns(feedback);
    await this._updateProfile(feedback);
    await this._updateCalibration(feedback);
  }

  async _updatePatterns(feedback) {
    const prisma = getPrismaClient();
    const patternKey = this._patternKey(feedback);
    const existing = await prisma.behaviorPattern.findUnique({
      where: {
        userId_pattern: {
          userId: feedback.userId,
          pattern: patternKey,
        },
      },
    });

    if (existing) {
      await prisma.behaviorPattern.update({
        where: { id: existing.id },
        data: {
          frequency: existing.frequency + 1,
          confidence: Math.min(existing.confidence + 0.05, 1),
          lastObserved: new Date(),
        },
      });
      return;
    }

    await prisma.behaviorPattern.create({
      data: {
        userId: feedback.userId,
        pattern: patternKey,
        frequency: 1,
        confidence: 0.3,
        metadata: { feedbackType: feedback.type },
      },
    });
  }

  async _updateProfile(feedback) {
    const prisma = getPrismaClient();
    const profile = await prisma.userProfile.findUnique({
      where: { userId: feedback.userId },
    });

    const metadata =
      feedback.metadata && typeof feedback.metadata === 'object'
        ? /** @type {Record<string, unknown>} */ (feedback.metadata)
        : {};

    const frequentlyUsedTools = this._asStringArray(profile?.frequentlyUsedTools);
    if (feedback.targetType === 'tool' && feedback.targetId) {
      const tool = String(feedback.targetId);
      if (!frequentlyUsedTools.includes(tool)) {
        frequentlyUsedTools.unshift(tool);
      }
    }

    const skippedSteps = this._asStringArray(profile?.skippedSteps);
    if (feedback.type === 'skip' && metadata.step) {
      const step = String(metadata.step);
      if (!skippedSteps.includes(step)) {
        skippedSteps.push(step);
      }
    }

    await prisma.userProfile.upsert({
      where: { userId: feedback.userId },
      update: {
        frequentlyUsedTools: frequentlyUsedTools.slice(0, 10),
        skippedSteps,
        updatedAt: new Date(),
      },
      create: {
        userId: feedback.userId,
        frequentlyUsedTools: frequentlyUsedTools.slice(0, 10),
        skippedSteps,
        learningEnabled: true,
      },
    });
  }

  async _updateCalibration(feedback) {
    const prisma = getPrismaClient();
    const profile = await prisma.userProfile.findUnique({
      where: { userId: feedback.userId },
    });

    const calibration =
      profile?.confidenceCalibration && typeof profile.confidenceCalibration === 'object'
        ? /** @type {Record<string, unknown>} */ ({ ...profile.confidenceCalibration })
        : {
            intentWeights: {},
            toolWeights: {},
            overallBias: 0,
            lastCalibrated: new Date().toISOString(),
          };

    const intentWeights =
      calibration.intentWeights && typeof calibration.intentWeights === 'object'
        ? /** @type {Record<string, number>} */ ({ ...calibration.intentWeights })
        : {};

    const metadata =
      feedback.metadata && typeof feedback.metadata === 'object'
        ? /** @type {Record<string, unknown>} */ (feedback.metadata)
        : {};

    const intent =
      (typeof metadata.intent === 'string' && metadata.intent) ||
      (typeof metadata.original === 'string' && metadata.original) ||
      (feedback.targetType === 'intent' ? String(feedback.targetId) : null);

    if (!intent) return;

    const current = intentWeights[intent] ?? 0.5;
    const delta = this._feedbackDelta(feedback.type, feedback.value);
    intentWeights[intent] = Math.min(Math.max(current + delta, 0.1), 1);

    await prisma.userProfile.upsert({
      where: { userId: feedback.userId },
      update: {
        confidenceCalibration: {
          ...calibration,
          intentWeights,
          lastCalibrated: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
      create: {
        userId: feedback.userId,
        confidenceCalibration: {
          intentWeights,
          toolWeights: {},
          overallBias: 0,
          lastCalibrated: new Date().toISOString(),
        },
        learningEnabled: true,
      },
    });
  }

  _patternKey(feedback) {
    const targetId = String(feedback.targetId ?? 'unknown');
    return `feedback:${feedback.type}:${feedback.targetType}:${targetId.slice(0, 32)}`;
  }

  /**
   * @param {unknown} value
   */
  _asStringArray(value) {
    if (Array.isArray(value)) return value.map(String);
    return [];
  }

  /**
   * @param {string} type
   * @param {number | null | undefined} value
   */
  _feedbackDelta(type, value) {
    if (type === 'thumbs_up' || type === 'success' || (type === 'rating' && Number(value) >= 4)) {
      return 0.05;
    }
    if (
      type === 'thumbs_down' ||
      type === 'failure' ||
      type === 'correction' ||
      type === 'reroll' ||
      type === 'skip' ||
      type === 'abandon' ||
      (type === 'rating' && Number(value) <= 2)
    ) {
      return -0.08;
    }
    return 0;
  }
}
