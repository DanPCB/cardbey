import type { ExternalMarketSignal, MarketIntentAnalysis, MarketIntentFamily, WantsCategory } from './types.js';
import type { KnowledgeBasis } from './entityTypes.js';
import type { GeographicAuthority } from './geographicAuthority.js';
import { formatResearchGeographyLabel } from './geographicAuthority.js';

export type MarketResearchObjectiveType =
  | 'CUSTOMER_ACQUISITION'
  | 'DISTRIBUTION_EXPANSION'
  | 'PARTNER_SEARCH'
  | 'INVESTMENT_READINESS'
  | 'MARKET_ENTRY'
  | 'GEOGRAPHIC_EXPANSION'
  | 'SUPPLIER_SEARCH'
  | 'TALENT_SEARCH'
  | 'COMPETITIVE_RESEARCH'
  | 'GENERAL_MARKET_RESEARCH';

export type ResearchDepthLevel = 0 | 1 | 2 | 3 | 4;

export type MarketResearchObjective = {
  primaryIntent: string | null;
  offering: string | null;
  need: string | null;
  counterpartyTypes: string[];
  businessOrigin: string | null;
  currentMarkets: string[];
  targetMarkets: string[];
  researchGeography: string;
  objectiveType: MarketResearchObjectiveType;
  researchDepth: ResearchDepthLevel;
  evidence: Array<{ statement: string; basis: KnowledgeBasis; confidence: number; source: string }>;
};

const INTENT_OBJECTIVE_MAP: Partial<Record<MarketIntentFamily, MarketResearchObjectiveType>> = {
  DISTRIBUTE: 'DISTRIBUTION_EXPANSION',
  EXPAND: 'GEOGRAPHIC_EXPANSION',
  PARTNER: 'PARTNER_SEARCH',
  INVEST: 'INVESTMENT_READINESS',
  PROMOTE: 'CUSTOMER_ACQUISITION',
  SELL: 'CUSTOMER_ACQUISITION',
  LAUNCH: 'MARKET_ENTRY',
  BUY: 'SUPPLIER_SEARCH',
  HIRE: 'TALENT_SEARCH',
  SOLVE_BUSINESS_PROBLEM: 'GENERAL_MARKET_RESEARCH',
  OTHER_COMMERCIAL: 'GENERAL_MARKET_RESEARCH',
};

const WANTS_COUNTERPARTY_MAP: Partial<Record<WantsCategory, string[]>> = {
  DISTRIBUTOR: ['distributor', 'channel partner'],
  RESELLER: ['reseller', 'agent'],
  PARTNER: ['business partner', 'operating partner'],
  INVESTOR: ['investor', 'capital partner'],
  CAPITAL: ['capital partner', 'investor'],
  CUSTOMER: ['customer', 'buyer'],
  BUYER: ['buyer', 'customer'],
  MARKET_ACCESS: ['market channel', 'distribution partner'],
};

function inferObjectiveType(analysis: MarketIntentAnalysis): MarketResearchObjectiveType {
  const primary = analysis.intents.primary;
  if (primary && INTENT_OBJECTIVE_MAP[primary]) {
    return INTENT_OBJECTIVE_MAP[primary]!;
  }

  for (const want of analysis.wants) {
    if (want.type === 'DISTRIBUTOR' || want.type === 'RESELLER') return 'DISTRIBUTION_EXPANSION';
    if (want.type === 'PARTNER' || want.type === 'CAPITAL' || want.type === 'INVESTOR') {
      return want.type === 'INVESTOR' || want.type === 'CAPITAL' ? 'INVESTMENT_READINESS' : 'PARTNER_SEARCH';
    }
  }

  if (/\bdistribut/i.test(analysis.classificationReason ?? '')) return 'DISTRIBUTION_EXPANSION';
  return 'GENERAL_MARKET_RESEARCH';
}

function extractCounterpartyTypes(analysis: MarketIntentAnalysis): string[] {
  const types = new Set<string>();
  for (const want of analysis.wants) {
    const mapped = WANTS_COUNTERPARTY_MAP[want.type as WantsCategory];
    if (mapped) mapped.forEach((t) => types.add(t));
    if (/distributor|đại lý|nhà phân phối/i.test(want.label)) types.add('distributor');
    if (/agent|đại diện/i.test(want.label)) types.add('agent');
    if (/contractor|painter|thợ sơn/i.test(want.label)) types.add('contractor');
    if (/capital|investor|đối tác vốn/i.test(want.label)) types.add('capital partner');
    if (/partner|đối tác/i.test(want.label)) types.add('business partner');
  }
  return [...types];
}

function inferResearchDepth(analysis: MarketIntentAnalysis, geography: GeographicAuthority): ResearchDepthLevel {
  if (analysis.classification !== 'COMMERCIAL') return 0;
  if (geography.explicitTargetGeography.some((g) => /global discovery/i.test(g.label))) return 4;
  if (geography.explicitTargetGeography.length && geography.businessOrigin.length) {
    const origin = geography.businessOrigin[0]?.label.toLowerCase() ?? '';
    const target = geography.explicitTargetGeography[0]?.label.toLowerCase() ?? '';
    if (origin && target && !target.includes(origin.split(',')[0] ?? '')) return 3;
  }
  if (geography.explicitTargetGeography.some((g) => /nationwide/i.test(g.label))) return 2;
  if (analysis.wants.length || analysis.intents.primary) return 2;
  return 1;
}

export function deriveMarketResearchObjective(params: {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  geography: GeographicAuthority;
}): MarketResearchObjective {
  const { analysis, geography } = params;
  const objectiveType = inferObjectiveType(analysis);
  const offering =
    analysis.has.find((h) => h.type === 'PRODUCT' || h.type === 'SERVICE' || h.type === 'BUSINESS')?.label ??
    analysis.has[0]?.label ??
    null;
  const need = analysis.wants[0]?.label ?? null;
  const counterpartyTypes = extractCounterpartyTypes(analysis);

  const businessOrigin = geography.businessOrigin[0]?.label ?? geography.observedGeography[0]?.label ?? null;
  const currentMarkets = geography.observedGeography.map((g) => g.label);
  const targetMarkets = geography.explicitTargetGeography.map((g) => g.label);

  const evidence: MarketResearchObjective['evidence'] = [];
  if (analysis.intents.primary) {
    evidence.push({
      statement: `Primary intent: ${analysis.intents.primary}`,
      basis: 'FACT',
      confidence: analysis.intents.items[0]?.confidence ?? 0.8,
      source: 'g1',
    });
  }
  for (const want of analysis.wants.filter((w) => w.basis === 'EXPLICIT').slice(0, 4)) {
    evidence.push({
      statement: `Wants: ${want.label}`,
      basis: 'FACT',
      confidence: want.confidence,
      source: 'g1',
    });
  }

  return {
    primaryIntent: analysis.intents.primary,
    offering,
    need,
    counterpartyTypes,
    businessOrigin,
    currentMarkets,
    targetMarkets,
    researchGeography: formatResearchGeographyLabel(geography),
    objectiveType,
    researchDepth: inferResearchDepth(analysis, geography),
    evidence,
  };
}

export function formatObjectiveDisplayLabel(objective: MarketResearchObjective): string {
  const typeLabels: Record<MarketResearchObjectiveType, string> = {
    CUSTOMER_ACQUISITION: 'Customer Acquisition',
    DISTRIBUTION_EXPANSION: 'Distribution Expansion',
    PARTNER_SEARCH: 'Partnership Opportunity',
    INVESTMENT_READINESS: 'Investment Readiness',
    MARKET_ENTRY: 'Market Entry',
    GEOGRAPHIC_EXPANSION: 'Geographic Expansion',
    SUPPLIER_SEARCH: 'Supplier Research',
    TALENT_SEARCH: 'Talent Search',
    COMPETITIVE_RESEARCH: 'Competitive Research',
    GENERAL_MARKET_RESEARCH: 'Market Research',
  };
  const typeLabel = typeLabels[objective.objectiveType] ?? 'Market Research';
  const geo = objective.researchGeography && objective.researchGeography !== 'Geography not established'
    ? ` — ${objective.researchGeography}`
    : '';
  return `${typeLabel}${geo}`;
}
