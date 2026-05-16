/**
 * Insights orchestrator: executeTask switch for insight/opportunity tasks.
 * Foundation 3: opportunity_inference uses LLM to infer IntentOpportunity rows (source: llm_inference).
 * Rule-based flow and accept → IntentRequest path are unchanged.
 */

import { runOpportunityInference } from '../handlers/opportunityInference.js';

/**
 * Execute a single insights/orchestrator task.
 * @param {object} task - { entryPoint, tenantId?, userId?, request?, ... }
 * @param {object} context - { prisma }
 * @returns {Promise<object>} Task result (or { skipped: true, reason } for opportunity_inference when skipped).
 */
export async function executeTask(task, context = {}) {
  const entryPoint = task?.entryPoint ?? task?.type;
  const prisma = context.prisma ?? (await import('../../lib/prisma.js')).getPrismaClient();

  switch (entryPoint) {
    case 'opportunity_inference':
      return await runOpportunityInference(task, { ...context, prisma });
    default:
      throw new Error(`Unknown insights orchestrator task: ${entryPoint}`);
  }
}
