/**
 * Bidding / matching layer config: weights and feature flag.
 * Static weights for first version; can be moved to DB or env later.
 */

const BIDDING_LAYER_ENABLED = process.env.BIDDING_LAYER_ENABLED === 'true';

/** Weight for quality in bid score (higher = prefer quality). */
const W_QUALITY = Number(process.env.BIDDING_W_QUALITY) || 0.5;
/** Weight for cost penalty (higher = penalize cost more). */
const W_COST = Number(process.env.BIDDING_W_COST) || 0.2;
/** Weight for latency penalty (higher = penalize latency more). */
const W_LATENCY = Number(process.env.BIDDING_W_LATENCY) || 0.2;
/** Weight for exploration bonus (UCB/epsilon-greedy style). */
const W_EXPLORATION = Number(process.env.BIDDING_W_EXPLORATION) || 0.1;

/** Epsilon for exploration: probability of choosing a random agent (0 = greedy). */
const EXPLORATION_EPSILON = Number(process.env.BIDDING_EXPLORATION_EPSILON) || 0.05;

/** Moving average alpha for reliabilityScore update (0–1). */
const RELIABILITY_ALPHA = Number(process.env.BIDDING_RELIABILITY_ALPHA) || 0.2;

/** Reward formula weights: userSatisfaction, systemQuality, latency penalty, cost penalty. */
const REWARD_W_USER = Number(process.env.BIDDING_REWARD_W_USER) || 0.5;
const REWARD_W_SYSTEM = Number(process.env.BIDDING_REWARD_W_SYSTEM) || 0.3;
const REWARD_W_LATENCY = Number(process.env.BIDDING_REWARD_W_LATENCY) || 0.1;
const REWARD_W_COST = Number(process.env.BIDDING_REWARD_W_COST) || 0.1;

function getWeights() {
  return {
    wQuality: W_QUALITY,
    wCost: W_COST,
    wLatency: W_LATENCY,
    wExploration: W_EXPLORATION,
    explorationEpsilon: EXPLORATION_EPSILON,
    reliabilityAlpha: RELIABILITY_ALPHA,
    rewardWUser: REWARD_W_USER,
    rewardWSystem: REWARD_W_SYSTEM,
    rewardWLatency: REWARD_W_LATENCY,
    rewardWCost: REWARD_W_COST,
  };
}

export { BIDDING_LAYER_ENABLED, getWeights };
