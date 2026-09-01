/**
 * Derives explicit actor role and market side from canonical G1 HAS/WANTS + intents.
 * Single interpretation path — no separate demand engine.
 */
import type {
  MarketIntentAnalysis,
  MarketActorRole,
  ActorRoleAssessment,
  MarketSide,
  MarketSideAssessment,
  DemandContext,
  DemandConstraint,
  DemandPreference,
  BudgetEvidence,
  GraphProjectionHints,
  MarketRepresentation,
} from './types.js';
import type { MarketIntentLlmResponse } from './marketIntentSchema.js';
import {
  isBuyerSideDistributionSignal,
  isBuyerSideSourcingSignal,
} from './marketIntentDirection.js';

const SUPPLY_WANTS = new Set([
  'CUSTOMER',
  'BUYER',
  'DISTRIBUTOR',
  'RESELLER',
  'PROMOTION',
  'GROWTH',
  'MARKET_ACCESS',
]);

const DEMAND_WANTS = new Set([
  'SUPPLIER',
  'SOLUTION',
  'EMPLOYEE',
  'COLLABORATOR',
  'INVESTOR',
  'CAPITAL',
  'PARTNER',
]);

const SUPPLY_INTENTS = new Set([
  'SELL',
  'PROMOTE',
  'LAUNCH',
  'DISTRIBUTE',
  'EXPAND',
  'SUPPLY',
  'SOLVE_BUSINESS_PROBLEM',
]);

const DEMAND_INTENTS = new Set(['BUY', 'HIRE', 'COLLABORATE']);

function combinedText(analysis: Pick<MarketIntentAnalysis, 'classificationReason' | 'has' | 'wants'>): string {
  return [
    analysis.classificationReason ?? '',
    ...analysis.has.map((h) => h.label),
    ...analysis.wants.map((w) => w.label),
  ].join(' ');
}

function hasWantType(analysis: MarketIntentAnalysis, types: string[]): boolean {
  return analysis.wants.some((w) => types.includes(w.type));
}

function hasHasType(analysis: MarketIntentAnalysis, types: string[]): boolean {
  return analysis.has.some((h) => types.includes(h.type));
}

function isConsumerServiceDemand(text: string, analysis: MarketIntentAnalysis): boolean {
  if (hasHasType(analysis, ['BUSINESS', 'CAPABILITY', 'PRODUCT']) && hasWantType(analysis, ['SUPPLIER', 'DISTRIBUTOR'])) {
    return false;
  }
  return (
    /\brecommend\b|\banyone know\b|\blooking for a\b.*\b(groomer|plumber|contractor|installer)\b/i.test(text) ||
    (analysis.intents.primary === 'BUY' &&
      hasWantType(analysis, ['SOLUTION']) &&
      !hasHasType(analysis, ['BUSINESS']))
  );
}

function isInvestorSeekingOpportunity(analysis: MarketIntentAnalysis, text: string): boolean {
  return (
    /\blooking for\b.*\b(business|startup|operating business)\b.*\bto invest\b/i.test(text) ||
    /\bseeking\b.*\b(investment opportunities|startups to invest)\b/i.test(text) ||
    (analysis.intents.primary === 'INVEST' &&
      hasWantType(analysis, ['SOLUTION', 'OTHER']) &&
      !hasWantType(analysis, ['INVESTOR', 'CAPITAL']) &&
      /\binvest in\b/i.test(text))
  );
}

function isCapitalSeeker(analysis: MarketIntentAnalysis): boolean {
  return (
    hasWantType(analysis, ['INVESTOR', 'CAPITAL']) ||
    (analysis.intents.primary === 'INVEST' && hasWantType(analysis, ['INVESTOR', 'CAPITAL']))
  );
}

function derivePrimaryActorRole(analysis: MarketIntentAnalysis): {
  primary: MarketActorRole;
  secondary: MarketActorRole[];
  reason: string;
} {
  const text = combinedText(analysis);
  const primaryIntent = analysis.intents.primary;

  if (analysis.classification !== 'COMMERCIAL') {
    return { primary: 'UNKNOWN', secondary: [], reason: 'Non-commercial signal' };
  }

  if (isConsumerServiceDemand(text, analysis)) {
    return { primary: 'CONSUMER', secondary: [], reason: 'Personal service or recommendation request' };
  }

  if (isInvestorSeekingOpportunity(analysis, text)) {
    return { primary: 'INVESTOR', secondary: [], reason: 'Seeking businesses or opportunities to invest in' };
  }

  if (isCapitalSeeker(analysis)) {
    return {
      primary: 'BUSINESS',
      secondary: ['PARTNER'],
      reason: 'Business or venture seeking capital or investors',
    };
  }

  if (primaryIntent === 'HIRE' || hasWantType(analysis, ['EMPLOYEE'])) {
    return { primary: 'EMPLOYER', secondary: [], reason: 'Hiring or recruitment signal' };
  }

  if (primaryIntent === 'COLLABORATE' || hasWantType(analysis, ['COLLABORATOR'])) {
    return { primary: 'PARTNER', secondary: ['TALENT'], reason: 'Co-founder or collaborator search' };
  }

  if (/\bcreator\b|\binfluencer\b|\bcontent creator\b|\bfood creator\b/i.test(text)) {
    return { primary: 'CREATOR', secondary: [], reason: 'Creator seeking brand or collaboration opportunities' };
  }

  if (
    isBuyerSideSourcingSignal(analysis) ||
    isBuyerSideDistributionSignal(analysis) ||
    primaryIntent === 'BUY' ||
    hasWantType(analysis, ['SUPPLIER'])
  ) {
    if (/\bretailer\b|\bretail\b/i.test(text) && hasWantType(analysis, ['SUPPLIER'])) {
      return { primary: 'RETAILER', secondary: ['BUYER'], reason: 'Retailer sourcing products or brands' };
    }
    if (/\bdistributor\b/i.test(text) && hasWantType(analysis, ['SUPPLIER'])) {
      return { primary: 'DISTRIBUTOR', secondary: ['BUYER'], reason: 'Distributor sourcing upstream supply' };
    }
    if (/\bcontractor\b|\bconstruction\b/i.test(text)) {
      return { primary: 'BUYER', secondary: ['BUSINESS'], reason: 'Contractor or trade buyer sourcing supply' };
    }
    return { primary: 'BUYER', secondary: [], reason: 'Buyer-side sourcing or procurement' };
  }

  if (
    primaryIntent === 'DISTRIBUTE' ||
    hasWantType(analysis, ['DISTRIBUTOR', 'RESELLER']) ||
    (primaryIntent === 'EXPAND' && hasWantType(analysis, ['DISTRIBUTOR', 'RESELLER', 'MARKET_ACCESS']))
  ) {
    return { primary: 'SUPPLIER', secondary: ['BUSINESS'], reason: 'Supplier or manufacturer seeking channel partners' };
  }

  if (primaryIntent === 'PARTNER' && hasWantType(analysis, ['PARTNER', 'CAPITAL'])) {
    return { primary: 'BUSINESS', secondary: ['PARTNER'], reason: 'Business seeking operating or capital partners' };
  }

  if (
    primaryIntent === 'PROMOTE' ||
    primaryIntent === 'SELL' ||
    primaryIntent === 'LAUNCH' ||
    hasWantType(analysis, ['CUSTOMER', 'BUYER'])
  ) {
    return { primary: 'SUPPLIER', secondary: ['BUSINESS'], reason: 'Offering products or services; seeking customers' };
  }

  if (primaryIntent === 'INVEST') {
    return { primary: 'INVESTOR', secondary: [], reason: 'Investment-related commercial signal' };
  }

  return { primary: 'BUSINESS', secondary: [], reason: 'General business commercial actor' };
}

function deriveMarketSide(
  analysis: MarketIntentAnalysis,
  actorRole: ActorRoleAssessment,
): MarketSideAssessment {
  if (analysis.classification !== 'COMMERCIAL') {
    return {
      side: 'UNKNOWN',
      confidence: analysis.classificationConfidence,
      reason: 'Non-commercial — market side not applicable',
      supplyFacet: false,
      demandFacet: false,
    };
  }

  const wantsSupplySide = analysis.wants.some((w) => SUPPLY_WANTS.has(w.type));
  const wantsDemandSide = analysis.wants.some((w) => DEMAND_WANTS.has(w.type));
  const intentSupply = analysis.intents.primary && SUPPLY_INTENTS.has(analysis.intents.primary);
  const intentDemand =
    (analysis.intents.primary && DEMAND_INTENTS.has(analysis.intents.primary)) ||
    analysis.intents.primary === 'INVEST';

  const supplyFacet = Boolean(
    wantsSupplySide ||
      intentSupply ||
      hasHasType(analysis, ['PRODUCT', 'SERVICE', 'CAPABILITY']) ||
      ['SUPPLIER'].includes(actorRole.primary),
  );

  const investorSeekingDeal = isInvestorSeekingOpportunity(analysis, combinedText(analysis));
  const capitalSeeking = isCapitalSeeker(analysis);
  const demandFacet = Boolean(
    wantsDemandSide ||
      (analysis.intents.primary && DEMAND_INTENTS.has(analysis.intents.primary)) ||
      capitalSeeking ||
      investorSeekingDeal ||
      ['BUYER', 'CONSUMER', 'RETAILER', 'EMPLOYER', 'INVESTOR', 'CREATOR'].includes(actorRole.primary),
  );

  let side: MarketSide;
  let reason: string;

  if (supplyFacet && demandFacet) {
    side = 'DUAL_SIDED';
    reason = 'Actor exhibits both supply-side offers and demand-side wants';
  } else if (supplyFacet) {
    side = 'SUPPLY';
    reason = 'Primarily offering capability, product, or service to the market';
  } else if (demandFacet) {
    side = 'DEMAND';
    reason = 'Primarily seeking supply, service, capital, or counterparties';
  } else if (actorRole.primary === 'INTERMEDIARY' || actorRole.primary === 'DISTRIBUTOR') {
    side = 'INTERMEDIARY';
    reason = 'Intermediary or channel actor';
  } else {
    side = 'UNKNOWN';
    reason = 'Insufficient evidence to classify market side';
  }

  const confidence = Math.min(
    0.95,
    analysis.classificationConfidence * 0.7 +
      (supplyFacet || demandFacet ? 0.2 : 0) +
      (actorRole.primary !== 'UNKNOWN' && actorRole.primary !== 'BUSINESS' ? 0.1 : 0),
  );

  return { side, confidence, reason, supplyFacet, demandFacet };
}

function extractDemandContext(
  analysis: MarketIntentAnalysis,
  rawText: string,
  llm?: Partial<MarketIntentLlmResponse>,
): DemandContext {
  const constraints: DemandConstraint[] = [];
  const preferences: DemandPreference[] = [];

  for (const item of llm?.constraints ?? []) {
    constraints.push({
      label: item.label,
      kind: item.kind,
      basis: item.basis,
      confidence: item.confidence,
      evidence: item.evidence ?? [],
    });
  }

  for (const item of llm?.preferences ?? []) {
    preferences.push({
      label: item.label,
      basis: item.basis,
      confidence: item.confidence,
      evidence: item.evidence ?? [],
    });
  }

  const qtyMatch = rawText.match(/\b(\d{2,})\s*(boxes|units|pieces|kg|containers|pallets)\b/i);
  if (qtyMatch && !constraints.some((c) => c.kind === 'QUANTITY')) {
    constraints.push({
      label: `${qtyMatch[1]} ${qtyMatch[2]}`,
      kind: 'QUANTITY',
      basis: 'EXPLICIT',
      confidence: 0.9,
      evidence: [{ statement: qtyMatch[0], span: qtyMatch[0], basis: 'EXPLICIT', confidence: 0.9 }],
    });
  }

  const budgetMatch = rawText.match(/\bunder\s*\$[\d,.]+|\$\d+(?:\.\d{2})?\s*each\b/i);
  let budgetEvidence: BudgetEvidence | null = null;
  if (budgetMatch) {
    budgetEvidence = {
      label: budgetMatch[0],
      basis: 'EXPLICIT',
      confidence: 0.88,
      evidence: [{ statement: budgetMatch[0], span: budgetMatch[0], basis: 'EXPLICIT', confidence: 0.88 }],
    };
    constraints.push({
      label: budgetMatch[0],
      kind: 'BUDGET',
      basis: 'EXPLICIT',
      confidence: 0.88,
      evidence: budgetEvidence.evidence,
    });
  } else if (llm?.budgetEvidence) {
    budgetEvidence = {
      label: llm.budgetEvidence.label,
      basis: llm.budgetEvidence.basis,
      confidence: llm.budgetEvidence.confidence,
      evidence: llm.budgetEvidence.evidence ?? [],
    };
  }

  const timeMatch = rawText.match(/\bthis weekend\b|\bnext month\b|\bby (?:end of )?\w+\b|\burgent\b|\btìm gấp\b/i);
  let timeHorizon: DemandContext['timeHorizon'] = llm?.timeHorizon ?? null;
  if (timeMatch && !timeHorizon) {
    timeHorizon = {
      label: timeMatch[0],
      basis: 'EXPLICIT',
      confidence: 0.85,
      evidence: [{ statement: timeMatch[0], span: timeMatch[0], basis: 'EXPLICIT', confidence: 0.85 }],
    };
    constraints.push({
      label: timeMatch[0],
      kind: 'TIMING',
      basis: 'EXPLICIT',
      confidence: 0.85,
      evidence: timeHorizon.evidence,
    });
  }

  const premiumMatch = rawText.match(/\bpremium\b|\borganic\b|\beco-friendly\b|\baustralian\b|\bvietnamese\b/i);
  if (premiumMatch && !preferences.length) {
    preferences.push({
      label: premiumMatch[0],
      basis: 'EXPLICIT',
      confidence: 0.82,
      evidence: [{ statement: premiumMatch[0], span: premiumMatch[0], basis: 'EXPLICIT', confidence: 0.82 }],
    });
  }

  return { constraints, preferences, timeHorizon, budgetEvidence };
}

function buildGraphProjection(
  analysis: MarketIntentAnalysis,
  actorRole: ActorRoleAssessment,
  marketSide: MarketSideAssessment,
): GraphProjectionHints {
  return {
    nodeKind: analysis.classification === 'COMMERCIAL' ? 'MARKET_ACTOR' : 'NON_MARKET_SIGNAL',
    supplyFacets: marketSide.supplyFacet
      ? analysis.has.filter((h) => ['PRODUCT', 'SERVICE', 'CAPABILITY', 'BUSINESS', 'ASSET'].includes(h.type))
      : [],
    demandFacets: marketSide.demandFacet
      ? analysis.wants.filter((w) =>
          [...SUPPLY_WANTS, ...DEMAND_WANTS, 'PARTNER', 'CAPITAL', 'INVESTOR'].includes(w.type),
        )
      : [],
    identityHints: {
      actorHint: analysis.actorHint,
      businessHint: analysis.businessHint,
      locationHint: analysis.locationHint,
    },
    actorRoles: [actorRole.primary, ...actorRole.secondary],
    marketSide: marketSide.side,
  };
}

export function deriveMarketRepresentation(params: {
  analysis: Omit<MarketIntentAnalysis, 'marketRepresentation'>;
  rawText?: string;
  llmExtract?: Partial<MarketIntentLlmResponse>;
}): MarketRepresentation {
  const analysis = params.analysis as MarketIntentAnalysis;
  const rawText = params.rawText ?? '';

  const roleDerived = derivePrimaryActorRole(analysis);
  const actorRole: ActorRoleAssessment = {
    primary: params.llmExtract?.actorRole?.primary ?? roleDerived.primary,
    secondary: params.llmExtract?.actorRole?.secondary ?? roleDerived.secondary,
    confidence: params.llmExtract?.actorRole?.confidence ?? analysis.classificationConfidence,
    reason: params.llmExtract?.actorRole?.reason ?? roleDerived.reason,
    evidence: (params.llmExtract?.actorRole?.evidence as ActorRoleAssessment['evidence']) ?? [],
  };

  const sideDerived = deriveMarketSide(analysis, actorRole);
  const marketSide: MarketSideAssessment = {
    side: params.llmExtract?.marketSide?.side ?? sideDerived.side,
    confidence: params.llmExtract?.marketSide?.confidence ?? sideDerived.confidence,
    reason: params.llmExtract?.marketSide?.reason ?? sideDerived.reason,
    supplyFacet: sideDerived.supplyFacet,
    demandFacet: sideDerived.demandFacet,
  };

  const demandContext = extractDemandContext(analysis, rawText, params.llmExtract);
  const graphProjection = buildGraphProjection(analysis, actorRole, marketSide);

  return { actorRole, marketSide, demandContext, graphProjection };
}
