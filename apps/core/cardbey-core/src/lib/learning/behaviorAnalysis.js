/**
 * ============================================================
 * PHASE D — BEHAVIOR ANALYSIS
 * ============================================================
 *
 * Analyzes user behavior patterns and updates confidence calibration.
 */

import { getPrismaClient } from '../prisma.js';

export class BehaviorAnalysis {
  /**
   * Analyze user behavior and update patterns.
   */
  async analyzeUser(userId, sessionId) {
    try {
      const prisma = getPrismaClient();
      const record = await prisma.performerSessionContext.findUnique({
        where: { userId_sessionId: { userId, sessionId } },
        select: { contextJson: true },
      });

      if (!record) return;

      const context = this._parseContext(record.contextJson);
      const history = this._buildHistory(context);

      const patterns = this._detectPatterns(history);
      for (const pattern of patterns) {
        await this._savePattern(userId, pattern);
      }

      await this._calibrateConfidence(userId, history);
      await this._updateProfile(userId, history);
    } catch (err) {
      if (String(err?.message ?? '').includes('does not exist')) return;
      throw err;
    }
  }

  /**
   * @param {unknown} contextJson
   */
  _parseContext(contextJson) {
    try {
      const raw = typeof contextJson === 'string' ? JSON.parse(contextJson) : contextJson;
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  /**
   * @param {Record<string, unknown>} context
   */
  _buildHistory(context) {
    const interactions = Array.isArray(context.interactions) ? context.interactions : [];
    const completedActions = Array.isArray(context.completedActions) ? context.completedActions : [];

    const history = [...interactions];
    for (const action of completedActions) {
      if (!action || typeof action !== 'object') continue;
      history.push({
        type: 'tool_used',
        tool: action.tool,
        intent: action.type,
        metadata: {
          success: action.success,
          feedback: action.success ? 'success' : 'negative',
        },
      });
    }

    return history;
  }

  /**
   * Detect patterns from interaction history.
   */
  _detectPatterns(history) {
    const patterns = [];
    if (!history.length) return patterns;

    const toolFrequency = {};
    for (const interaction of history) {
      if (interaction.tool) {
        toolFrequency[interaction.tool] = (toolFrequency[interaction.tool] || 0) + 1;
      }
    }

    const topTools = Object.entries(toolFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [tool, count] of topTools) {
      patterns.push({
        pattern: `frequent_tool:${tool}`,
        frequency: count,
        confidence: Math.min((count / history.length) * 2, 1),
        metadata: { tool, count, total: history.length },
      });
    }

    const skips = history.filter((item) => item.type === 'skip_step' || item.type === 'skip');
    if (skips.length > 0) {
      const skipSteps = {};
      for (const skip of skips) {
        const step = skip.metadata?.step || 'unknown';
        skipSteps[step] = (skipSteps[step] || 0) + 1;
      }

      for (const [step, count] of Object.entries(skipSteps)) {
        patterns.push({
          pattern: `skipped_step:${step}`,
          frequency: count,
          confidence: Math.min(count / skips.length, 1),
          metadata: { step, count },
        });
      }
    }

    const missions = history.filter((item) => item.type === 'mission_completed');
    const failures = history.filter((item) => item.type === 'mission_failed');
    if (missions.length + failures.length > 0) {
      patterns.push({
        pattern: 'workflow_completion_rate',
        frequency: missions.length + failures.length,
        confidence: missions.length / (missions.length + failures.length),
        metadata: { completed: missions.length, failed: failures.length },
      });
    }

    return patterns;
  }

  /**
   * Calibrate confidence based on historical accuracy.
   */
  async _calibrateConfidence(userId, history) {
    const intentAccuracy = {};
    const intentCounts = {};

    for (const interaction of history) {
      if (interaction.intent && interaction.metadata?.feedback) {
        const intent = interaction.intent;
        const feedback = interaction.metadata.feedback;

        if (!intentAccuracy[intent]) {
          intentAccuracy[intent] = 0;
          intentCounts[intent] = 0;
        }

        intentCounts[intent] += 1;
        if (feedback === 'positive' || feedback === 'success') {
          intentAccuracy[intent] += 1;
        }
      }
    }

    const weights = {};
    for (const intent of Object.keys(intentAccuracy)) {
      weights[intent] = intentAccuracy[intent] / intentCounts[intent];
    }

    if (!Object.keys(weights).length) return;

    const prisma = getPrismaClient();
    await prisma.userProfile.upsert({
      where: { userId },
      update: {
        confidenceCalibration: {
          intentWeights: weights,
          toolWeights: {},
          overallBias: 0,
          lastCalibrated: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
      create: {
        userId,
        confidenceCalibration: {
          intentWeights: weights,
          toolWeights: {},
          overallBias: 0,
          lastCalibrated: new Date().toISOString(),
        },
        learningEnabled: true,
      },
    });
  }

  async _updateProfile(userId, history) {
    const toolFrequency = {};
    for (const interaction of history) {
      if (interaction.tool) {
        toolFrequency[interaction.tool] = (toolFrequency[interaction.tool] || 0) + 1;
      }
    }

    const topTools = Object.entries(toolFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool]) => tool);

    const skippedSteps = history
      .filter((item) => item.type === 'skip_step' || item.type === 'skip')
      .map((item) => item.metadata?.step)
      .filter(Boolean);

    const workflowFrequency = {};
    for (const interaction of history) {
      if (interaction.intent) {
        workflowFrequency[interaction.intent] = (workflowFrequency[interaction.intent] || 0) + 1;
      }
    }

    const topWorkflows = Object.entries(workflowFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([workflow]) => workflow);

    const prisma = getPrismaClient();
    await prisma.userProfile.upsert({
      where: { userId },
      update: {
        frequentlyUsedTools: topTools,
        skippedSteps: [...new Set(skippedSteps)],
        preferredWorkflows: topWorkflows,
        updatedAt: new Date(),
      },
      create: {
        userId,
        frequentlyUsedTools: topTools,
        skippedSteps: [],
        preferredWorkflows: topWorkflows,
        learningEnabled: true,
      },
    });
  }

  /**
   * @param {string} userId
   * @param {{ pattern: string; frequency: number; confidence: number; metadata?: Record<string, unknown> }} pattern
   */
  async _savePattern(userId, pattern) {
    const prisma = getPrismaClient();
    await prisma.behaviorPattern.upsert({
      where: {
        userId_pattern: {
          userId,
          pattern: pattern.pattern,
        },
      },
      update: {
        frequency: pattern.frequency,
        confidence: pattern.confidence,
        lastObserved: new Date(),
        metadata: pattern.metadata ?? {},
      },
      create: {
        userId,
        pattern: pattern.pattern,
        frequency: pattern.frequency,
        confidence: pattern.confidence,
        metadata: pattern.metadata ?? {},
      },
    });
  }
}
