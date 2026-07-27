/**
 * ============================================================
 * PHASE D — LEARNING INTEGRATION
 * ============================================================
 *
 * Integrates learning into the existing reasoning pipeline.
 */

import { FeedbackCapture } from './feedbackCapture.js';
import { BehaviorAnalysis } from './behaviorAnalysis.js';
import { Personalization } from './personalization.js';
import { ModelUpdate } from './modelUpdate.js';

export function isLearningLayerEnabled() {
  if (process.env.DISABLE_LEARNING_LAYER === 'true') return false;
  if (process.env.ENABLE_LEARNING_LAYER === 'false') return false;
  return process.env.ENABLE_LEARNING_LAYER === 'true' || process.env.DISABLE_LEARNING_LAYER !== 'true';
}

export function isMissingLearningTableError(err) {
  const msg = String(err?.message ?? '');
  return (
    msg.includes('does not exist') &&
    (msg.includes('learning_user_profiles') ||
      msg.includes('learning_user_feedback') ||
      msg.includes('learning_behavior_patterns') ||
      msg.includes('userProfile') ||
      msg.includes('userFeedback') ||
      msg.includes('behaviorPattern'))
  );
}

export class LearningIntegration {
  constructor({ contextProvider, reasoner }) {
    this.contextProvider = contextProvider;
    this.reasoner = reasoner;
    this.feedback = new FeedbackCapture();
    this.analysis = new BehaviorAnalysis();
    this.personalization = new Personalization();
    this.modelUpdate = new ModelUpdate();
  }

  /**
   * Process feedback on a reasoning result.
   */
  async processFeedback(userId, sessionId, result, feedbackType) {
    const feedback = {
      userId,
      sessionId,
      type: feedbackType,
      targetType: 'intent',
      targetId: result.intent,
      value: feedbackType === 'thumbs_up' ? 1 : feedbackType === 'thumbs_down' ? 0 : null,
      metadata: {
        intent: result.intent,
        confidence: result.confidence,
        context: result.userState,
        feedback: feedbackType === 'thumbs_up' ? 'positive' : 'negative',
        timestamp: new Date().toISOString(),
      },
    };

    const record = await this.feedback.captureExplicit(userId, sessionId, feedback);
    await this.modelUpdate.updateFromFeedback(userId, record);
    await this.analysis.analyzeUser(userId, sessionId);
    return record;
  }

  /**
   * Process a correction (user corrected the intent).
   */
  async processCorrection(userId, sessionId, originalIntent, correctedIntent, context) {
    const feedback = {
      userId,
      sessionId,
      type: 'correction',
      targetType: 'intent',
      targetId: originalIntent,
      value: 0,
      metadata: {
        original: originalIntent,
        corrected: correctedIntent,
        intent: originalIntent,
        context,
        feedback: 'negative',
        timestamp: new Date().toISOString(),
      },
    };

    const record = await this.feedback.captureExplicit(userId, sessionId, feedback);
    await this.modelUpdate.updateFromFeedback(userId, record);
    await this.analysis._calibrateConfidence(userId, [
      { intent: originalIntent, metadata: { feedback: 'negative' } },
    ]);
    return record;
  }

  /**
   * Process implicit feedback (reroll, skip, abandon).
   */
  async processImplicitFeedback(userId, sessionId, action, result) {
    const record = await this.feedback.captureImplicit(userId, sessionId, action, result);
    if (record) {
      await this.modelUpdate.updateFromFeedback(userId, record);
      await this.analysis.analyzeUser(userId, sessionId);
    }
    return record;
  }

  /**
   * Enhance reasoning with learned patterns.
   */
  async enhanceReasoning(userId, sessionId, input, context) {
    try {
      const profile = await this.personalization.getProfile(userId);
      if (!profile || !profile.learningEnabled) {
        return context;
      }

      const enrichment = this.personalization.enrichContext(context, profile);
      const tuning = await this.modelUpdate.getUserTuning(userId, profile);

      return {
        ...context,
        preferences: enrichment.preferences,
        preferredTools: enrichment.preferredTools,
        skippedSteps: enrichment.skippedSteps,
        defaultAction: enrichment.defaultAction,
        learning: tuning,
      };
    } catch (err) {
      if (isMissingLearningTableError(err)) return context;
      throw err;
    }
  }

  /**
   * Record mission outcome for learning.
   */
  async recordMissionOutcome(userId, sessionId, mission) {
    const record = await this.feedback.captureMissionOutcome(userId, sessionId, mission);
    await this.modelUpdate.updateFromFeedback(userId, record);
    await this.analysis.analyzeUser(userId, sessionId);
    return record;
  }

  /**
   * Observable learning profile for the user.
   */
  async getLearningProfile(userId) {
    const profile = await this.personalization.getProfile(userId);
    if (!profile) {
      return {
        userId,
        learningEnabled: true,
        preferredWorkflows: [],
        skippedSteps: [],
        frequentlyUsedTools: [],
        defaultAction: null,
        confidenceCalibration: {
          intentWeights: {},
          toolWeights: {},
          overallBias: 0,
          lastCalibrated: null,
        },
      };
    }

    const patterns = await this.modelUpdate.getUserTuning(userId, profile);
    return {
      ...profile,
      patternLibrary: patterns.patternLibrary,
    };
  }
}
