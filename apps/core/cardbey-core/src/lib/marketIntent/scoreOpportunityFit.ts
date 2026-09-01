import type {
  FitBand,
  FitFactorScore,
  MissionContext,
} from './opportunityTypes.js';
import type { MarketIntentAnalysis } from './types.js';
import type { ResolvedMarketEntity, MarketEntityResearch } from './entityTypes.js';
import type { CardbeyCapabilityMatch } from './opportunityTypes.js';
import { isConsumerTransactionSignal, isNonBusinessOpportunity } from './extractNeeds.js';
import {
  isGenericLocalAcquisition,
  isBuyerSideDistributionSignal,
} from './marketIntentDirection.js';
import type { CoreNeedAssessment } from './coreNeedServiceability.js';

export const G3_SCORER_VERSION = 'g3.1.0-calibrated';

/** Selected after 26-case sensitivity — see calibration report */
export const HIGH_FIT_THRESHOLD = 65;

/** Documented heuristic weights — commercial signal ≠ Cardbey opportunity fit */
const WEIGHTS = {
  capabilityFit: 26,
  intentStrength: 10,
  evidenceConfidence: 14,
  entityConfidence: 10,
  businessRelevance: 12,
  strategicFit: 10,
  valueScope: 6,
  serviceabilityFit: 12,
  timing: 0,
} as const;

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreIntentStrength(analysis: MarketIntentAnalysis): { score: number; reason: string } {
  if (analysis.classification !== 'COMMERCIAL') {
    return { score: 0, reason: 'Not commercial' };
  }
  // Measures evidence that the commercial need is real — NOT Cardbey's ability to solve it.
  const base = analysis.classificationConfidence * 70;
  const intentBoost = analysis.intents.primary ? 10 : 0;
  const wantsBoost = Math.min(10, analysis.wants.filter((w) => w.basis === 'EXPLICIT').length * 4);
  return {
    score: clamp100(base + intentBoost + wantsBoost),
    reason: `Commercial signal clarity ${(analysis.classificationConfidence * 100).toFixed(0)}% — evidence the need is real, not Cardbey serviceability`,
  };
}

function scoreEvidenceConfidence(
  analysis: MarketIntentAnalysis,
  research: MarketEntityResearch | null,
): { score: number; reason: string } {
  let score = analysis.classificationConfidence * 60;
  if (research?.researchStatus === 'READY') score += research.confidence * 30;
  else if (research?.researchStatus === 'INSUFFICIENT_EVIDENCE') score += 10;
  const explicitCount =
    analysis.has.filter((h) => h.basis === 'EXPLICIT').length +
    analysis.wants.filter((w) => w.basis === 'EXPLICIT').length;
  score += Math.min(10, explicitCount * 3);
  return {
    score: clamp100(score),
    reason: research
      ? `G1 confidence + research status ${research.researchStatus}`
      : 'G1 evidence only — no business research',
  };
}

function scoreEntityConfidence(resolved: ResolvedMarketEntity): { score: number; reason: string } {
  if (resolved.resolutionStatus === 'NOT_APPLICABLE') {
    return { score: 20, reason: 'Entity resolution not applicable for this signal type' };
  }
  if (resolved.resolutionStatus === 'AMBIGUOUS') {
    return { score: 25, reason: 'Ambiguous entity — multiple candidates' };
  }
  if (resolved.resolutionStatus === 'UNRESOLVED') {
    return { score: 15, reason: 'Entity unresolved' };
  }
  const base = resolved.confidence * 100;
  const statusBoost =
    resolved.resolutionStatus === 'RESOLVED' ? 15 : resolved.resolutionStatus === 'PARTIALLY_RESOLVED' ? 8 : 0;
  return {
    score: clamp100(base + statusBoost),
    reason: `Resolution ${resolved.resolutionStatus} at ${(resolved.confidence * 100).toFixed(0)}%`,
  };
}

function scoreBusinessRelevance(
  resolved: ResolvedMarketEntity,
  research: MarketEntityResearch | null,
): { score: number; reason: string } {
  if (resolved.entityKind !== 'BUSINESS') {
    if (resolved.entityKind === 'PERSON') return { score: 15, reason: 'Individual/personal signal — limited B2B relevance' };
    if (resolved.entityKind === 'PROJECT') return { score: 35, reason: 'Project/startup — partial business relevance' };
    return { score: 20, reason: `Entity kind ${resolved.entityKind}` };
  }
  let score = 50;
  if (resolved.resolutionStatus === 'RESOLVED') score += 25;
  if (research?.researchStatus === 'READY') score += 20;
  if (research?.offerings?.length) score += 5;
  return {
    score: clamp100(score),
    reason: `Business entity with ${research?.offerings?.length ?? 0} researched offerings`,
  };
}

function scoreStrategicFit(
  mission: MissionContext,
  resolved: ResolvedMarketEntity,
  analysis: MarketIntentAnalysis,
): { score: number; reason: string } {
  if (mission !== 'CARDBEY_ACQUISITION') {
    return { score: 50, reason: 'Neutral strategic fit — non-acquisition mission' };
  }

  if (isConsumerTransactionSignal(analysis)) {
    return { score: 5, reason: 'Consumer C2C transaction — outside Cardbey acquisition focus' };
  }

  if (resolved.entityKind === 'PERSON' && analysis.intents.primary === 'SELL') {
    return { score: 8, reason: 'Personal seller — weak Cardbey acquisition target' };
  }

  if (isBuyerSideDistributionSignal(analysis)) {
    return { score: 35, reason: 'Buyer-side sourcing signal — Cardbey distribution tools target sellers, not buyer procurement' };
  }

  if (isGenericLocalAcquisition(analysis)) {
    return { score: 48, reason: 'Generic local customer acquisition — legitimate user, modest strategic Cardbey scope' };
  }

  const growthIntents = ['DISTRIBUTE', 'EXPAND', 'PARTNER', 'LAUNCH', 'SOLVE_BUSINESS_PROBLEM'];
  if (analysis.intents.primary === 'DISTRIBUTE' || analysis.wants.some((w) => w.type === 'DISTRIBUTOR' || w.type === 'RESELLER')) {
    const expansionScope = /\bnationwide\b|\btoàn quốc\b|\bexport\b|\binternational\b|\baustralia\b|\bglobal\b/i.test(
      JSON.stringify(analysis.wants) + JSON.stringify(analysis.has),
    );
    return {
      score: expansionScope ? 68 : 58,
      reason: expansionScope
        ? 'Distribution/expansion scope — strong enabling research opportunity'
        : 'Distribution intent — enabling research opportunity',
    };
  }

  if (analysis.intents.primary && growthIntents.includes(analysis.intents.primary)) {
    if (analysis.intents.primary === 'PROMOTE') {
      return { score: 48, reason: 'Promotion intent without expansion scope — modest strategic fit' };
    }
    return { score: 72, reason: `Growth intent ${analysis.intents.primary} — strategic Cardbey scope` };
  }

  if (analysis.intents.primary === 'COLLABORATE') {
    return { score: 30, reason: 'Co-founder search — limited Cardbey product fit' };
  }

  if (analysis.intents.primary === 'INVEST') {
    return { score: 20, reason: 'Investment seeker — Cardbey does not offer investment matching' };
  }

  if (resolved.entityKind === 'BUSINESS') {
    return { score: 70, reason: 'Business entity — potential Cardbey customer' };
  }

  return { score: 40, reason: 'Moderate strategic alignment' };
}

function scoreCapabilityFit(matches: CardbeyCapabilityMatch[]): { score: number; reason: string } {
  if (!matches.length) return { score: 0, reason: 'No capability matches' };
  const direct = matches.filter((m) => m.fitLevel === 'DIRECT_MATCH');
  const supporting = matches.filter((m) => m.fitLevel === 'SUPPORTING_MATCH');
  const topScore = matches[0]?.score ?? 0;
  let score = topScore * 0.7;
  score += direct.length * 5;
  score += supporting.length * 2;
  return {
    score: clamp100(score),
    reason: `${direct.length} direct + ${supporting.length} supporting matches (top ${topScore}) — relevance-weighted, not raw count`,
  };
}

function scoreValueScope(
  analysis: MarketIntentAnalysis,
  research: MarketEntityResearch | null,
): { score: number; reason: string } {
  let score = 40;
  if (research?.offerings && research.offerings.length > 2) score += 20;
  if (analysis.has.some((h) => h.type === 'CAPABILITY' || h.type === 'BUSINESS')) score += 15;
  if (['DISTRIBUTE', 'EXPAND', 'PARTNER'].includes(analysis.intents.primary ?? '')) score += 15;
  return {
    score: clamp100(score),
    reason: 'Scope based on offerings depth and expansion intent',
  };
}

function scoreServiceabilityFit(coreNeed: CoreNeedAssessment | null): { score: number; reason: string } {
  if (!coreNeed) return { score: 40, reason: 'Core need serviceability not assessed' };
  const scores: Record<CoreNeedAssessment['serviceability'], number> = {
    AVAILABLE: 95,
    PARTIAL: 62,
    ENABLING_ONLY: 36,
    UNAVAILABLE: 18,
    UNKNOWN: 40,
  };
  return {
    score: scores[coreNeed.serviceability],
    reason: `Core need "${coreNeed.coreNeedLabel}" — ${coreNeed.serviceability}: ${coreNeed.explanation}`,
  };
}

export function scoreToFitBand(
  overallScore: number,
  disqualifiers: string[],
  classification: string,
  threshold: number = HIGH_FIT_THRESHOLD,
): FitBand {
  if (classification === 'NON_COMMERCIAL') return 'NOT_APPLICABLE';
  if (disqualifiers.some((d) => d.includes('NOT_A_CARDBEY') || d.includes('consumer'))) {
    return 'NOT_A_CARDBEY_OPPORTUNITY';
  }
  if (disqualifiers.some((d) => d.includes('insufficient evidence'))) {
    return 'INSUFFICIENT_EVIDENCE';
  }
  if (overallScore >= threshold) return 'HIGH_FIT';
  if (overallScore >= 42) return 'MEDIUM_FIT';
  if (overallScore >= 20) return 'LOW_FIT';
  return 'NOT_A_CARDBEY_OPPORTUNITY';
}

export function computeOpportunityScores(params: {
  analysis: MarketIntentAnalysis;
  resolved: ResolvedMarketEntity;
  research: MarketEntityResearch | null;
  matches: CardbeyCapabilityMatch[];
  mission: MissionContext;
  disqualifiers: string[];
  coreNeed?: CoreNeedAssessment | null;
}): {
  factors: FitFactorScore[];
  overallScore: number;
  overallFitBand: FitBand;
  intentStrength: number;
  evidenceConfidence: number;
  entityConfidence: number;
  businessRelevance: number;
  strategicFit: number;
  capabilityFit: number;
} {
  const intent = scoreIntentStrength(params.analysis);
  const evidence = scoreEvidenceConfidence(params.analysis, params.research);
  const entity = scoreEntityConfidence(params.resolved);
  const business = scoreBusinessRelevance(params.resolved, params.research);
  const strategic = scoreStrategicFit(params.mission, params.resolved, params.analysis);
  const capability = scoreCapabilityFit(params.matches);
  const value = scoreValueScope(params.analysis, params.research);
  const serviceability = scoreServiceabilityFit(params.coreNeed ?? null);

  const factors: FitFactorScore[] = [
    { factor: 'intentStrength', ...intent, weight: WEIGHTS.intentStrength, weightedContribution: 0 },
    { factor: 'evidenceConfidence', ...evidence, weight: WEIGHTS.evidenceConfidence, weightedContribution: 0 },
    { factor: 'entityConfidence', ...entity, weight: WEIGHTS.entityConfidence, weightedContribution: 0 },
    { factor: 'businessRelevance', ...business, weight: WEIGHTS.businessRelevance, weightedContribution: 0 },
    { factor: 'strategicFit', ...strategic, weight: WEIGHTS.strategicFit, weightedContribution: 0 },
    { factor: 'capabilityFit', ...capability, weight: WEIGHTS.capabilityFit, weightedContribution: 0 },
    { factor: 'valueScope', ...value, weight: WEIGHTS.valueScope, weightedContribution: 0 },
    { factor: 'serviceabilityFit', ...serviceability, weight: WEIGHTS.serviceabilityFit, weightedContribution: 0 },
  ];

  let overallScore = 0;
  for (const f of factors) {
    f.weightedContribution = (f.score * f.weight) / 100;
    overallScore += f.weightedContribution;
  }
  overallScore = clamp100(overallScore);

  const overallFitBand = scoreToFitBand(
    overallScore,
    params.disqualifiers,
    params.analysis.classification,
  );

  return {
    factors,
    overallScore,
    overallFitBand,
    intentStrength: intent.score,
    evidenceConfidence: evidence.score,
    entityConfidence: entity.score,
    businessRelevance: business.score,
    strategicFit: strategic.score,
    capabilityFit: capability.score,
  };
}

export function buildDisqualifiers(
  analysis: MarketIntentAnalysis,
  resolved: ResolvedMarketEntity,
): string[] {
  const d: string[] = [];

  if (analysis.classification === 'NON_COMMERCIAL') {
    d.push('NON_COMMERCIAL: no opportunity assessment applicable');
  }

  if (analysis.classification === 'AMBIGUOUS') {
    d.push('insufficient evidence: G1 classification ambiguous');
  }

  if (resolved.resolutionStatus === 'AMBIGUOUS') {
    d.push('insufficient evidence: entity resolution ambiguous');
  }

  if (isConsumerTransactionSignal(analysis)) {
    d.push('NOT_A_CARDBEY: consumer one-off transaction (e.g. used vehicle) — outside Cardbey strategic scope');
  }

  if (isNonBusinessOpportunity(resolved.entityKind, analysis) && isConsumerTransactionSignal(analysis)) {
    d.push('consumer C2C sale — Cardbey has no capability advantage');
  }

  return d;
}
