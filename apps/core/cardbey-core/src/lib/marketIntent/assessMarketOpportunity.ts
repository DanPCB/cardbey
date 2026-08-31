import type { ExternalMarketSignal, MarketIntentAnalysis, EvidenceStatement } from './types.js';
import type { ResolvedMarketEntity, MarketEntityResearch } from './entityTypes.js';
import type {
  MarketOpportunityAssessment,
  MissionContext,
  G3Outcome,
  AssessmentEvidence,
} from './opportunityTypes.js';
import { extractNeedsFromContext } from './extractNeeds.js';
import { matchCapabilitiesToNeeds, splitMatches } from './matchCapabilities.js';
import {
  buildDisqualifiers,
  computeOpportunityScores,
  G3_SCORER_VERSION,
} from './scoreOpportunityFit.js';

export type AssessMarketOpportunityInput = {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  resolved: ResolvedMarketEntity;
  research: MarketEntityResearch | null;
  g1Evidence?: EvidenceStatement[];
  missionContext?: MissionContext;
};

function buildAssessmentEvidence(
  input: AssessMarketOpportunityInput,
  factors: MarketOpportunityAssessment['factors'],
): AssessmentEvidence[] {
  const chain: AssessmentEvidence[] = [];

  for (const e of input.g1Evidence ?? []) {
    chain.push({
      statement: e.statement,
      source: 'g1',
      basis: e.basis,
      confidence: e.confidence,
    });
  }

  for (const e of input.resolved.evidence.slice(0, 5)) {
    chain.push({
      statement: e.statement,
      source: 'g2_entity',
      basis: e.basis,
      confidence: e.confidence,
    });
  }

  for (const e of (input.research?.evidence ?? []).slice(0, 5)) {
    chain.push({
      statement: e.statement,
      source: 'g2_research',
      basis: e.basis,
      confidence: e.confidence,
    });
  }

  for (const f of factors) {
    chain.push({
      statement: `${f.factor}: ${f.reason} (score ${f.score})`,
      source: 'assessment',
      confidence: f.score / 100,
    });
  }

  return chain;
}

function deriveG3Outcome(
  band: MarketOpportunityAssessment['overallFitBand'],
  primaryCount: number,
): G3Outcome {
  if (band === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (band === 'INSUFFICIENT_EVIDENCE') return 'INSUFFICIENT_EVIDENCE';
  if (band === 'NOT_A_CARDBEY_OPPORTUNITY') return 'NOT_A_CARDBEY_OPPORTUNITY';
  if (primaryCount === 0) return 'NO_RELEVANT_CAPABILITY';
  return 'READY';
}

/**
 * G3 core: assess Cardbey fit and match capabilities — no solution assembly or outreach.
 */
export function assessMarketOpportunity(input: AssessMarketOpportunityInput): MarketOpportunityAssessment {
  const mission = input.missionContext ?? 'CARDBEY_ACQUISITION';
  const disqualifiers = buildDisqualifiers(input.analysis, input.resolved);
  const needs = extractNeedsFromContext(input.analysis, input.research);
  const { matches, unavailableDesired } = matchCapabilitiesToNeeds(needs, input.resolved);
  const { primary, supporting } = splitMatches(matches);

  const scores = computeOpportunityScores({
    analysis: input.analysis,
    resolved: input.resolved,
    research: input.research,
    matches,
    mission,
    disqualifiers,
  });

  const reasons = [
    ...scores.factors.map((f) => `${f.factor}: ${f.reason}`),
    ...disqualifiers,
  ];

  const limitations = [
    ...(input.research?.limitations ?? []),
    'Scores are heuristic fit bands, not predictive conversion probabilities',
    ...unavailableDesired.map((u) => `${u.need}: ${u.reason}`),
  ];

  const opportunity: MarketOpportunityAssessment = {
    signalId: input.signal.signalId,
    resolvedEntityRef: input.resolved.resolvedEntityRef,
    missionContext: mission,
    relevanceStatus: scores.overallFitBand,
    intentStrength: scores.intentStrength,
    evidenceConfidence: scores.evidenceConfidence,
    entityConfidence: scores.entityConfidence,
    businessRelevance: scores.businessRelevance,
    strategicFit: scores.strategicFit,
    capabilityFit: scores.capabilityFit,
    overallFitBand: scores.overallFitBand,
    overallScore: scores.overallScore,
    factors: scores.factors,
    reasons,
    disqualifiers,
    limitations,
    primaryMatches: primary,
    supportingMatches: supporting,
    unavailableDesiredCapabilities: unavailableDesired,
    assessmentEvidence: buildAssessmentEvidence(input, scores.factors),
    assessedAt: new Date().toISOString(),
    scorerVersion: G3_SCORER_VERSION,
  };

  return opportunity;
}

export function assessMarketOpportunityWithOutcome(
  input: AssessMarketOpportunityInput,
): {
  opportunity: MarketOpportunityAssessment;
  capabilityMatches: typeof input extends never ? never : import('./opportunityTypes.js').CardbeyCapabilityMatch[];
  outcome: G3Outcome;
} {
  const opportunity = assessMarketOpportunity(input);
  const allMatches = [...opportunity.primaryMatches, ...opportunity.supportingMatches];
  const outcome = deriveG3Outcome(opportunity.overallFitBand, opportunity.primaryMatches.length);
  return { opportunity, capabilityMatches: allMatches, outcome };
}

export { deriveG3Outcome };
