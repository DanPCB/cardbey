/**
 * Tool: consensus.
 * Reads marketReport from context.stepOutputs.market_research.marketReport, runs consensus engine, returns decision.
 * Pipeline step 2 for launch_campaign (after market_research, before create_promotion).
 *
 * REGISTRATION: Add consensus to toolRegistry.js TOOLS array.
 * PIPELINE: Insert 'consensus' as step 2 in intentPipelineRegistry.js launch_campaign.stepToolNames.
 * Downstream steps can read: context.stepOutputs?.consensus?.consensusDecision, .ballots, .durationMs.
 */

import { runConsensusEngine } from '../../agents/consensusEngine.js';

/**
 * @param {object} input - From pipeline (storeId etc. if needed)
 * @param {object} context - missionId, stepId, tenantId, stepOutputs
 * @returns {Promise<{ status: 'ok'|'failed', output?: { consensusDecision: string, ballots: object[], durationMs: number }, error?: { code: string, message: string } }>}
 */
export async function execute(input = {}, context = {}) {
  const marketReport = context?.stepOutputs?.market_research?.marketReport;
  if (!marketReport || typeof marketReport !== 'object') {
    return {
      status: 'failed',
      error: {
        code: 'MISSING_MARKET_REPORT',
        message: 'consensus requires market_research step output (context.stepOutputs.market_research.marketReport)',
      },
    };
  }

  const tenantKey = context?.tenantId ?? context?.tenantKey ?? 'default';

  try {
    const result = await runConsensusEngine(marketReport, { tenantKey });
    return {
      status: 'ok',
      output: {
        consensusDecision: result.consensusDecision,
        ballots: result.ballots ?? [],
        durationMs: result.durationMs ?? 0,
        note: result.note,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: {
        code: 'CONSENSUS_ERROR',
        message: err?.message ?? String(err),
      },
    };
  }
}
