/**
 * Suggestion Engine — proactive copilot suggestions from observation patterns.
 */

import { getPrismaClient } from '../../lib/prisma.js';
import observationBus from '../../lib/runtime/observationBus.js';

export class SuggestionEngine {
  constructor() {
    this.interval = parseInt(process.env.COPILOT_INTERVAL_MS || '300000', 10);
    this.timer = null;
    this.lastRun = null;
  }

  start() {
    if (process.env.COPILOT_SUGGESTIONS_ENABLED === 'false') return;
    if (process.env.NODE_ENV === 'test') return;
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.scan().catch((error) => {
        console.error('[Copilot] Scan failed:', error?.message || error);
      });
    }, this.interval);

    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }

    console.log(`[Copilot] Suggestion engine started (interval ${this.interval}ms)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scan() {
    const recentObservations = await this.getRecentObservations();
    if (recentObservations.length < 3) return;

    const patterns = this.identifyPatterns(recentObservations);
    if (!patterns.length) return;

    const suggestions = this.generateSuggestions(patterns);
    await this.pushToQueue(suggestions);
    this.lastRun = new Date();
  }

  async getRecentObservations() {
    try {
      const prisma = getPrismaClient();
      if (prisma?.observation?.findMany) {
        return prisma.observation.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
      }
    } catch {
      /* fallback */
    }
    return observationBus.getLatest(100);
  }

  /**
   * @param {Array<{ outcome?: string; actionType?: string; intentType?: string; contextSnapshot?: object }>} observations
   */
  identifyPatterns(observations) {
    const patterns = [];

    const inventoryActions = observations.filter(
      (o) =>
        ['check_inventory', 'diagnose_store', 'analyze_store'].includes(String(o.actionType)) &&
        o.outcome === 'success',
    );
    if (inventoryActions.length >= 3) {
      patterns.push({
        type: 'low_inventory',
        confidence: 0.7,
        evidence: inventoryActions.length,
      });
    }

    const failures = observations.filter((o) => o.outcome === 'failure');
    if (failures.length >= 2) {
      patterns.push({
        type: 'repeated_failures',
        confidence: 0.6,
        evidence: failures.map((f) => f.actionType).filter(Boolean),
      });
    }

    const publishFailures = failures.filter((o) =>
      String(o.actionType ?? '').includes('publish'),
    );
    if (publishFailures.length >= 1) {
      patterns.push({
        type: 'publish_retry',
        confidence: 0.75,
        evidence: publishFailures.length,
      });
    }

    return patterns;
  }

  generateSuggestions(patterns) {
    const suggestions = [];
    const now = Date.now();

    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'low_inventory':
          suggestions.push({
            id: `suggestion_${now}_restock`,
            type: 'restock',
            title: 'Low inventory detected',
            message:
              'Multiple inventory checks ran recently. Should I help you create a restock plan?',
            action: 'diagnose_store',
            urgency: 'medium',
            priority: 2,
          });
          break;
        case 'repeated_failures':
          suggestions.push({
            id: `suggestion_${now}_diagnose`,
            type: 'diagnose',
            title: 'Repeated failures detected',
            message: 'Some actions failed repeatedly. Should I diagnose the issue?',
            action: 'diagnose_store',
            urgency: 'high',
            priority: 1,
          });
          break;
        case 'publish_retry':
          suggestions.push({
            id: `suggestion_${now}_publish`,
            type: 'publish',
            title: 'Publish may need attention',
            message: 'A recent publish attempt failed. Review and retry when ready.',
            action: 'publish_store',
            urgency: 'high',
            priority: 1,
          });
          break;
        default:
          break;
      }
    }

    return suggestions;
  }

  async pushToQueue(suggestions) {
    if (!suggestions.length) return;

    const prisma = getPrismaClient();
    if (!prisma?.copilotSuggestion?.create) {
      console.warn('[Copilot] copilotSuggestion model unavailable — skipping queue persist');
      return;
    }

    for (const suggestion of suggestions) {
      try {
        const existing = await prisma.copilotSuggestion.findFirst({
          where: {
            type: suggestion.type,
            status: 'pending',
            createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
          },
        });
        if (existing) continue;

        await prisma.copilotSuggestion.create({
          data: {
            id: suggestion.id,
            type: suggestion.type,
            title: suggestion.title,
            message: suggestion.message,
            action: suggestion.action,
            urgency: suggestion.urgency,
            priority: suggestion.priority,
            status: 'pending',
            metadata: { generatedAt: new Date().toISOString(), source: 'suggestion_engine' },
          },
        });
      } catch (error) {
        console.warn('[Copilot] Failed to queue suggestion:', error?.message || error);
      }
    }
  }

  async getPendingSuggestions(userId, limit = 5) {
    const prisma = getPrismaClient();
    if (!prisma?.copilotSuggestion?.findMany) return [];

    const where = { status: 'pending' };
    if (userId) {
      where.OR = [{ userId: String(userId) }, { userId: null }];
    }

    return prisma.copilotSuggestion.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }
}

const suggestionEngine = new SuggestionEngine();
export default suggestionEngine;
