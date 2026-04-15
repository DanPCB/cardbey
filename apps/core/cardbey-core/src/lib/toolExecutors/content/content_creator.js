/**
 * content_creator.js — Pipeline tool executor for the content_creator step.
 * Reads all prior stepOutputs and returns a validated ContentPlan.
 * stepOutputs.content_creator.contentPlan contains the full ContentPlan after this step.
 */

import { runContentCreator } from '../../contentCreatorEngine.js';

/**
 * Set to false (or delete the block) before shipping — forces an invalid/minimal payload for UI/pipeline tests.
 * @type {boolean}
 */
const TEMP_RETURN_INCOMPLETE_CONTENT_PLAN = false;

/**
 * @param {object} input
 * @param {string} [input.goal]
 * @param {string} [input.tenantKey]
 * @param {object} context
 * @param {object} context.stepOutputs
 * @param {string} [context.tenantId]
 * @param {string} [context.goal]
 */
export async function execute(input = {}, context = {}) {
  const start = Date.now();
  const goal = input?.goal ?? context?.goal ?? 'Launch campaign';
  const tenantKey = input?.tenantKey ?? context?.tenantId ?? context?.storeId ?? 'default';

  const consensusDecision = context?.stepOutputs?.consensus?.consensusDecision;
  if (consensusDecision?.recommendedAction === 'hold') {
    return {
      status: 'ok',
      output: {
        skipped: true,
        reason: `Content creation skipped — consensus voted hold (confidence ${consensusDecision.confidence}).`,
        durationMs: Date.now() - start,
      },
    };
  }

  if (TEMP_RETURN_INCOMPLETE_CONTENT_PLAN) {
    return {
      status: 'ok',
      output: {
        // Intentionally not a valid ContentPlan (missing generatedAt, storeName, social, emailAndPromo, …)
        contentPlan: { posts: [], email: null },
        durationMs: Date.now() - start,
      },
    };
  }

  try {
    const contentPlan = await runContentCreator({
      goal,
      stepOutputs: context?.stepOutputs ?? {},
      tenantKey,
    });

    return {
      status: 'ok',
      output: {
        contentPlan,
        durationMs: Date.now() - start,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[content_creator] executor error:', message);
    return {
      status: 'failed',
      error: { code: 'CONTENT_CREATOR_ERROR', message },
      output: { durationMs: Date.now() - start },
    };
  }
}
