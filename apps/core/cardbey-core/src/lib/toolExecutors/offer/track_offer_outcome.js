/**
 * track_offer_outcome — Record optimization baseline for the learning loop (Phase 4: in-memory).
 */

import { randomUUID } from 'node:crypto';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

const REVIEW_DAYS = 7;

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeAnalysisTool({
    toolName: 'track_offer_outcome',
    input,
    context,
    analyzer: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const offerId =
        typeof inp?.offerId === 'string' && inp.offerId.trim() ? inp.offerId.trim() : null;

      const optimizationId =
        (typeof inp?.optimizationId === 'string' && inp.optimizationId.trim()) ||
        (inp?.suggestion?.id && String(inp.suggestion.id).trim()) ||
        randomUUID();

      const baseline =
        inp?.baselineMetrics && typeof inp.baselineMetrics === 'object'
          ? inp.baselineMetrics
          : {};

      const nextReviewAt = new Date(Date.now() + REVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString();

      return {
        tracked: false,
        trackingId: randomUUID(),
        storeId,
        offerId,
        optimizationId,
        baseline,
        suggestion: inp?.suggestion ?? null,
        nextReviewAt,
        persisted: false,
      };
    },
    isEmpty: (result) => Object.keys(result?.baseline ?? {}).length === 0 && !result?.optimizationId,
    validateOutput: (result) => {
      if (!result?.persisted) {
        return {
          blocked: true,
          reason: 'not_persisted',
          message: 'Offer outcome tracking recorded in memory only — persistence not wired yet',
        };
      }
      return null;
    },
  });
}

export default execute;
