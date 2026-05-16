/**
 * Consensus engine: runs three Haiku voter agents on a MarketReport and resolves to a single decision.
 * Requires at least 2 of 3 voters to succeed; majority vote wins; tie goes to 'hold'.
 *
 * Voter agents (must exist in agentRegistry):
 *   - consensus_voter_growth
 *   - consensus_voter_risk
 *   - consensus_voter_customer
 *
 * MarketReport shape (from researcher): goal, location { suburb, state, country, timezone },
 * competitors[], audienceProfile { peakDays, peakHours, demographics }, pricingBenchmark { low, mid, high },
 * recommendedDiscount, seasonalFactors[], confidence, generatedAt.
 */

import { z } from 'zod';
import { callAsAgent } from './agentRegistry.js';

const VOTER_IDS = ['consensus_voter_growth', 'consensus_voter_risk', 'consensus_voter_customer'];

const VoterBallotSchema = z.object({
  vote: z.enum(['approve', 'revise', 'hold']),
  reasoning: z.string().optional(),
});

const MIN_VOTERS = 2;

/**
 * Build a text prompt for voters from our MarketReport shape (no summary/opportunities/risks fields).
 * @param {object} marketReport - Validated MarketReport from market_research step
 * @returns {string}
 */
export function buildVoterPrompt(marketReport) {
  if (!marketReport || typeof marketReport !== 'object') {
    return 'Market report unavailable.';
  }
  // Store-grounded runway report (market_research v2): structured intelligence + topProductsToPromote
  if (marketReport.reportVersion === 2) {
    const mc = marketReport.marketContext || {};
    const ap = marketReport.audienceProfile || {};
    const tops = Array.isArray(marketReport.topProductsToPromote) ? marketReport.topProductsToPromote : [];
    const topLine = tops.length
      ? tops.map((t) => `${t.productName || t.productId || 'item'} (${t.reason || ''})`).join('; ')
      : 'None ranked';
    const lines = [
      `Goal: ${marketReport.goal ?? mc.recommendedCampaignAngle ?? 'N/A'}`,
      `Store: ${marketReport.storeName ?? marketReport.storeId ?? 'N/A'}; catalog size: ${marketReport.productCount ?? '?'}`,
      `Target audience summary: ${marketReport.targetAudience ?? 'N/A'}`,
      `Segment: ${ap.primarySegment ?? 'N/A'}; interests: ${(ap.interests || []).join(', ') || 'N/A'}; motivation: ${ap.buyingMotivation ?? 'N/A'}; price positioning: ${ap.pricePoint ?? 'N/A'}`,
      `Category trend: ${mc.categoryTrend ?? 'N/A'}`,
      `Seasonal: ${mc.seasonalOpportunity ?? 'N/A'}`,
      `Competitors: ${mc.competitorLandscape ?? 'N/A'}`,
      `Recommended angle: ${mc.recommendedCampaignAngle ?? 'N/A'}`,
      `Top products to promote: ${topLine}`,
      `Recommendations: ${(marketReport.recommendations || []).join(' | ') || 'None'}`,
      `Confidence signal: ${marketReport.confidence ?? 'medium (store-grounded report)'}`,
    ];
    return lines.join('\n');
  }
  const loc = marketReport.location || {};
  const locStr = [loc.suburb, loc.state, loc.country].filter(Boolean).join(', ') || 'Unknown';
  const comps = Array.isArray(marketReport.competitors) ? marketReport.competitors : [];
  const compSummary = comps.length
    ? comps.map((c) => `${c.name || 'Competitor'} (${c.priceRange?.low ?? '?'}-${c.priceRange?.high ?? '?'})`).join('; ')
    : 'None listed';
  const audience = marketReport.audienceProfile || {};
  const benchmark = marketReport.pricingBenchmark || {};
  const lines = [
    `Goal: ${marketReport.goal ?? 'N/A'}`,
    `Location: ${locStr}`,
    `Competitors: ${compSummary}`,
    `Audience: ${audience.demographics ?? 'N/A'}; peak days: ${(audience.peakDays || []).join(', ') || 'N/A'}; peak hours: ${(audience.peakHours || []).join(', ') || 'N/A'}`,
    `Pricing benchmark: low ${benchmark.low ?? '?'} mid ${benchmark.mid ?? '?'} high ${benchmark.high ?? '?'}`,
    `Recommended discount: ${marketReport.recommendedDiscount ?? 'N/A'}%`,
    `Seasonal factors: ${(marketReport.seasonalFactors || []).join(', ') || 'None'}`,
    `Confidence: ${marketReport.confidence ?? 'N/A'}`,
  ];
  return lines.join('\n');
}

/**
 * Run the consensus engine: fan out to three voters, validate ballots, majority wins.
 * @param {object} marketReport - MarketReport from context.stepOutputs.market_research.marketReport
 * @param {{ tenantKey?: string }} [options]
 * @returns {Promise<{ consensusDecision: 'approve'|'revise'|'hold', ballots: Array<{ voterId: string, vote: string, reasoning?: string }>, durationMs: number }>}
 */
export async function runConsensusEngine(marketReport, options = {}) {
  const tenantKey = options.tenantKey ?? options.tenantId ?? 'default';
  const start = Date.now();
  const prompt = buildVoterPrompt(marketReport);

  const results = await Promise.allSettled(
    VOTER_IDS.map((id) => callAsAgent(id, prompt, { tenantId: tenantKey }))
  );

  const ballots = [];
  for (let i = 0; i < VOTER_IDS.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const parsed = VoterBallotSchema.safeParse(r.value);
    if (!parsed.success) continue;
    ballots.push({
      voterId: VOTER_IDS[i],
      vote: parsed.data.vote,
      reasoning: parsed.data.reasoning,
    });
  }

  if (ballots.length < MIN_VOTERS) {
    const durationMs = Date.now() - start;
    return {
      consensusDecision: 'hold',
      ballots,
      durationMs,
      note: `Fewer than ${MIN_VOTERS} valid ballots (${ballots.length}).`,
    };
  }

  const counts = { approve: 0, revise: 0, hold: 0 };
  for (const b of ballots) {
    if (counts[b.vote] !== undefined) counts[b.vote]++;
  }
  let consensusDecision = 'hold';
  if (counts.approve > counts.revise && counts.approve > counts.hold) consensusDecision = 'approve';
  else if (counts.revise > counts.approve && counts.revise > counts.hold) consensusDecision = 'revise';

  const durationMs = Date.now() - start;
  return {
    consensusDecision,
    ballots,
    durationMs,
  };
}
