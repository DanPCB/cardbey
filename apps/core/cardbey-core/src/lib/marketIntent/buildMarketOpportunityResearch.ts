import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { ResolvedMarketEntity, MarketEntityResearch } from './entityTypes.js';
import type { KnowledgeBasis } from './entityTypes.js';
import type { GeographicAuthority } from './geographicAuthority.js';
import type { MarketResearchObjective, MarketResearchObjectiveType } from './marketResearchObjective.js';
import { formatObjectiveDisplayLabel } from './marketResearchObjective.js';

export type MarketOpportunityResearch = {
  objective: MarketResearchObjective;
  geography: GeographicAuthority;
  offering: string | null;
  need: string | null;
  counterparties: string[];
  marketContext: string;
  demandOrOpportunitySignals: Array<{ statement: string; basis: KnowledgeBasis; confidence: number }>;
  geographicPriorities: Array<{ label: string; basis: KnowledgeBasis; confidence: number }>;
  counterpartyProfile: string | null;
  competitiveContext: string | null;
  entryOrExpansionConsiderations: string[];
  evidence: Array<{ statement: string; basis: KnowledgeBasis; confidence: number; source: string }>;
  confidence: number;
  unknowns: string[];
  limitations: string[];
  recommendedActions: string[];
  displayLabel: string;
};

function researchQuestionsForObjective(
  objectiveType: MarketResearchObjectiveType,
  geography: string,
  offering: string | null,
  counterparties: string[],
): string[] {
  const offeringLabel = offering ?? 'the offering';
  const counterpartyLabel = counterparties.length ? counterparties.join(', ') : 'relevant counterparties';

  switch (objectiveType) {
    case 'DISTRIBUTION_EXPANSION':
      return [
        `Which regions within ${geography} should be prioritized for distribution expansion?`,
        `What distributor/channel profile fits ${offeringLabel}?`,
        `What channel structures (agents, contractors, regional reps) matter most?`,
        `Where may geographic white-space exist without naming specific distributors?`,
        `What market-entry or channel considerations apply before outreach?`,
      ];
    case 'PARTNER_SEARCH':
      return [
        `What is the local market context for ${offeringLabel} in ${geography}?`,
        `What partner profile (capital vs operating) best matches the stated need?`,
        `What competitive environment should a partner evaluate?`,
        `What evidence gaps remain before partner engagement?`,
      ];
    case 'INVESTMENT_READINESS':
      return [
        `What market context supports investment or expansion readiness in ${geography}?`,
        `What business-model strengths and gaps should be clarified for investors?`,
        `What preparation is required before capital conversations?`,
      ];
    case 'MARKET_ENTRY':
    case 'GEOGRAPHIC_EXPANSION':
      return [
        `What distinguishes origin market from target market (${geography})?`,
        `What demand or channel signals support market entry?`,
        `What localization or compliance considerations apply?`,
      ];
    case 'CUSTOMER_ACQUISITION':
      return [
        `Who are likely customers for ${offeringLabel} in ${geography}?`,
        `What demand indicators or local context matter?`,
        `Which channels should initial customer acquisition prioritize?`,
      ];
    default:
      return [
        `What market context is relevant for ${offeringLabel} in ${geography}?`,
        `What opportunity signals are supported by available evidence?`,
      ];
  }
}

export function buildMarketOpportunityResearch(params: {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  resolved: ResolvedMarketEntity;
  research: MarketEntityResearch | null;
  objective: MarketResearchObjective;
  geography: GeographicAuthority;
}): MarketOpportunityResearch {
  const { objective, geography, analysis, research, resolved } = params;
  const displayLabel = formatObjectiveDisplayLabel(objective);

  const demandSignals: MarketOpportunityResearch['demandOrOpportunitySignals'] = [];
  for (const want of analysis.wants.slice(0, 5)) {
    demandSignals.push({
      statement: want.label,
      basis: want.basis === 'EXPLICIT' ? 'FACT' : 'INFERENCE',
      confidence: want.confidence,
    });
  }

  const geographicPriorities: MarketOpportunityResearch['geographicPriorities'] = [];
  if (objective.targetMarkets.length) {
    for (const market of objective.targetMarkets) {
      geographicPriorities.push({
        label: market,
        basis: 'FACT',
        confidence: 0.85,
      });
    }
  } else if (geography.observedGeography.length) {
    geographicPriorities.push({
      label: geography.observedGeography[0].label,
      basis: geography.observedGeography[0].basis,
      confidence: geography.observedGeography[0].confidence,
    });
  }

  const questions = researchQuestionsForObjective(
    objective.objectiveType,
    objective.researchGeography,
    objective.offering,
    objective.counterpartyTypes,
  );

  const counterpartyProfile =
    objective.counterpartyTypes.length > 0
      ? `Seeking: ${objective.counterpartyTypes.join(', ')}`
      : null;

  const limitations = [
    'Research is objective-driven preparation — no automated counterparty/investor matching in this gate',
    'No specific distributor or investor names unless supported by G2 research evidence',
    ...(research?.limitations ?? []),
  ];

  if (resolved.resolutionStatus === 'UNRESOLVED') {
    limitations.push('Business identity unresolved — research uses signal-level intelligence only');
  }

  const unknowns: string[] = [];
  if (!objective.targetMarkets.length && objective.objectiveType === 'DISTRIBUTION_EXPANSION') {
    unknowns.push('Explicit target geography may be broader than observed origin');
  }
  if (!research || research.researchStatus !== 'READY') {
    unknowns.push('External business research incomplete — depth limited to signal interpretation');
  }

  const recommendedActions = [
    ...questions.map((q) => `Research question: ${q}`),
    'Review geographic authority before treating any market as confirmed fact',
  ];

  const evidence = [
    ...objective.evidence,
    ...demandSignals.map((d) => ({ ...d, source: 'g1' })),
  ];

  let confidence = analysis.classificationConfidence * 0.6;
  if (research?.researchStatus === 'READY') confidence += research.confidence * 0.25;
  if (objective.targetMarkets.length) confidence += 0.1;
  confidence = Math.min(0.95, confidence);

  const marketContext =
    objective.objectiveType === 'DISTRIBUTION_EXPANSION'
      ? `Distribution-oriented market research for ${objective.offering ?? 'the offering'} targeting ${objective.researchGeography}`
      : objective.objectiveType === 'PARTNER_SEARCH'
        ? `Partnership/expansion research for ${objective.offering ?? 'the business'} in ${objective.researchGeography}`
        : `Market research scoped to ${displayLabel}`;

  return {
    objective,
    geography,
    offering: objective.offering,
    need: objective.need,
    counterparties: objective.counterpartyTypes,
    marketContext,
    demandOrOpportunitySignals: demandSignals,
    geographicPriorities,
    counterpartyProfile,
    competitiveContext: research?.summary ?? null,
    entryOrExpansionConsiderations: questions,
    evidence,
    confidence,
    unknowns,
    limitations,
    recommendedActions,
    displayLabel,
  };
}
