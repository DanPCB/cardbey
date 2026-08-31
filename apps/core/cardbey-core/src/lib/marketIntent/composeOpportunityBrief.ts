import { randomUUID } from 'node:crypto';
import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { ResolvedMarketEntity, MarketEntityResearch } from './entityTypes.js';
import type { MarketOpportunityAssessment, CardbeyCapabilityMatch } from './opportunityTypes.js';
import type {
  BriefStatement,
  OpportunityBrief,
  OpportunityCardView,
  G4Outcome,
  PreparationLevel,
} from './briefTypes.js';
import { G4_COMPOSER_VERSION } from './determinePreparationLevel.js';

export type ComposeOpportunityBriefInput = {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  resolved: ResolvedMarketEntity;
  research: MarketEntityResearch | null;
  opportunity: MarketOpportunityAssessment;
  capabilityMatches: CardbeyCapabilityMatch[];
  preparationLevel: PreparationLevel;
  recommendedSolutionSummary?: string;
};

function stmt(
  statement: string,
  basis: BriefStatement['basis'],
  source?: BriefStatement['source'],
  confidence?: number,
): BriefStatement {
  return { statement, basis, source, confidence };
}

function collectFacts(
  analysis: MarketIntentAnalysis,
  resolved: ResolvedMarketEntity,
  research: MarketEntityResearch | null,
): BriefStatement[] {
  const facts: BriefStatement[] = [];

  if (analysis.classificationReason) {
    facts.push(stmt(analysis.classificationReason, 'FACT', 'g1', analysis.classificationConfidence));
  }

  for (const e of analysis.classificationEvidence ?? []) {
    facts.push(stmt(e.statement, 'FACT', 'g1', e.confidence));
  }

  for (const want of analysis.wants.filter((w) => w.basis === 'EXPLICIT')) {
    facts.push(stmt(`Wants: ${want.label}`, 'FACT', 'g1', want.confidence));
  }

  for (const has of analysis.has.filter((h) => h.basis === 'EXPLICIT')) {
    facts.push(stmt(`Has: ${has.label}`, 'FACT', 'g1', has.confidence));
  }

  if (resolved.canonicalName) {
    facts.push(stmt(`Resolved entity: ${resolved.canonicalName}`, 'FACT', 'g2_entity', resolved.confidence));
  }

  for (const e of resolved.evidence.slice(0, 5)) {
    facts.push(stmt(e.statement, 'FACT', 'g2_entity', e.confidence));
  }

  if (research?.businessIdentity) {
    facts.push(stmt(`Business identity: ${research.businessIdentity}`, 'FACT', 'g2_research', research.confidence));
  }

  for (const offering of research?.offerings?.slice(0, 5) ?? []) {
    facts.push(
      stmt(`Offering: ${offering.name}`, offering.basis === 'FACT' ? 'FACT' : 'INFERENCE', 'g2_research', offering.confidence),
    );
  }

  for (const geo of research?.geographies ?? []) {
    facts.push(stmt(`Geography: ${geo}`, 'FACT', 'g2_research', research?.confidence));
  }

  return facts;
}

function collectInferences(
  analysis: MarketIntentAnalysis,
  research: MarketEntityResearch | null,
  opportunity: MarketOpportunityAssessment,
): BriefStatement[] {
  const inferences: BriefStatement[] = [];

  if (analysis.intents.primary) {
    inferences.push(
      stmt(
        `Primary commercial objective appears to be ${analysis.intents.primary.replace(/_/g, ' ').toLowerCase()}`,
        'INFERENCE',
        'g1',
        analysis.intents.items[0]?.confidence,
      ),
    );
  }

  for (const want of analysis.wants.filter((w) => w.basis === 'INFERRED')) {
    inferences.push(stmt(`Likely wants: ${want.label}`, 'INFERENCE', 'g1', want.confidence));
  }

  if (research?.capabilities?.length) {
    inferences.push(
      stmt(
        `Business capabilities may include: ${research.capabilities.slice(0, 3).join(', ')}`,
        'INFERENCE',
        'g2_research',
        research.confidence,
      ),
    );
  }

  for (const factor of opportunity.factors.slice(0, 4)) {
    inferences.push(stmt(`${factor.factor}: ${factor.reason}`, 'INFERENCE', 'g3_assessment', factor.score / 100));
  }

  return inferences;
}

function collectUnknowns(
  analysis: MarketIntentAnalysis,
  resolved: ResolvedMarketEntity,
  research: MarketEntityResearch | null,
): BriefStatement[] {
  const unknowns: BriefStatement[] = [];

  if (analysis.classification === 'AMBIGUOUS' || analysis.classification === 'UNKNOWN') {
    unknowns.push(stmt('Commercial intent classification is ambiguous', 'UNKNOWN', 'g1'));
  }

  if (resolved.resolutionStatus === 'AMBIGUOUS') {
    unknowns.push(stmt('Entity resolution is ambiguous — multiple candidates', 'UNKNOWN', 'g2_entity'));
  }

  if (!research || research.researchStatus !== 'READY') {
    unknowns.push(stmt('Business research is incomplete or not applicable', 'UNKNOWN', 'g2_research'));
  }

  if (!analysis.locationHint && !resolved.location) {
    unknowns.push(stmt('Target geography not clearly established', 'UNKNOWN', 'g4'));
  }

  return unknowns;
}

function buildOpportunityCard(
  input: ComposeOpportunityBriefInput,
  canPrepare: string[],
): OpportunityCardView {
  const name =
    input.resolved.canonicalName ??
    input.research?.businessIdentity ??
    input.analysis.businessHint ??
    'Unknown business';

  const fitLabel = input.opportunity.overallFitBand.replace(/_/g, ' ');
  const intent =
    input.analysis.intents.primary?.replace(/_/g, ' ').toLowerCase() ??
    input.analysis.wants[0]?.label ??
    'commercial objective';

  const found =
    input.research?.offerings?.[0]?.name ??
    input.analysis.has[0]?.label ??
    input.analysis.classificationReason ??
    'Limited public business context';

  return {
    title: name,
    fitBand: input.opportunity.overallFitBand,
    fitLabel,
    intentSummary: `Intent: ${intent}`,
    foundSummary: `What we found: ${found}`,
    relevanceSummary: `Why relevant: ${input.opportunity.reasons[0] ?? 'Cardbey capability alignment assessed'}`,
    canPrepare,
    currentLimitations: input.opportunity.unavailableDesiredCapabilities.map((u) => u.need),
    nextActionLabel: 'Review opportunity brief and solution plan before any connection (G5)',
  };
}

function deriveBriefStatus(
  preparationLevel: PreparationLevel,
  fitBand: string,
): G4Outcome {
  if (fitBand === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (preparationLevel === 0) return 'NO_SOLUTION_REQUIRED';
  return 'BRIEF_READY';
}

/**
 * Compose evidence-backed opportunity brief from G1–G3 outputs.
 * No LLM — deterministic composition only.
 */
export function composeOpportunityBrief(input: ComposeOpportunityBriefInput): OpportunityBrief {
  const knownFacts = collectFacts(input.analysis, input.resolved, input.research);
  const inferences = collectInferences(input.analysis, input.research, input.opportunity);
  const unknowns = collectUnknowns(input.analysis, input.resolved, input.research);

  const matchedCapabilities = input.capabilityMatches.slice(0, 8).map((m) => ({
    capabilityId: m.capabilityId,
    capabilityName: m.capabilityName,
    fitLevel: m.fitLevel,
    availability: m.availability,
  }));

  const canPrepareLabels = input.opportunity.primaryMatches
    .filter((m) => m.availability === 'AVAILABLE' || m.availability === 'PARTIAL')
    .slice(0, 5)
    .map((m) => m.capabilityName);

  const gaps = input.opportunity.unavailableDesiredCapabilities.map((u) => u.need);
  const limitations = [
    ...input.opportunity.limitations,
    ...input.opportunity.unavailableDesiredCapabilities.map((u) => `${u.need}: ${u.reason}`),
  ];

  const objective =
    input.analysis.wants[0]?.label ??
    input.analysis.intents.primary?.replace(/_/g, ' ').toLowerCase() ??
    'business growth';

  const recommendedSolutionSummary =
    input.recommendedSolutionSummary ??
    (input.preparationLevel >= 2
      ? `Prepare a minimal Cardbey solution to support: ${objective}`
      : 'No structured solution recommended at current fit level');

  const sections = {
    situation: [
      stmt(`Signal from ${input.signal.sourceType}: ${input.signal.rawText.slice(0, 200)}`, 'FACT', 'g1'),
      ...knownFacts.slice(0, 2),
    ],
    intent: [
      ...(input.analysis.intents.primary
        ? [stmt(`Commercial intent: ${input.analysis.intents.primary}`, 'FACT', 'g1')]
        : []),
      ...input.analysis.wants.map((w) => stmt(`Wants ${w.label}`, w.basis === 'EXPLICIT' ? 'FACT' : 'INFERENCE', 'g1', w.confidence)),
    ],
    business: knownFacts.filter((f) => f.source === 'g2_entity' || f.source === 'g2_research'),
    opportunity: [
      stmt(`Fit band: ${input.opportunity.overallFitBand} (heuristic score ${input.opportunity.overallScore})`, 'INFERENCE', 'g3_assessment'),
      ...inferences.filter((i) => i.source === 'g3_assessment').slice(0, 3),
    ],
    gaps: gaps.map((g) => stmt(`Gap: ${g}`, 'INFERENCE', 'g3_assessment')),
    cardbeyFit: [
      stmt(input.opportunity.reasons[0] ?? 'Cardbey capabilities assessed against detected needs', 'INFERENCE', 'g3_assessment'),
      ...matchedCapabilities.map((m) =>
        stmt(`${m.capabilityName} (${m.fitLevel}, ${m.availability})`, 'RECOMMENDATION', 'capability_authority'),
      ),
    ],
    proposedSolution: [
      stmt(recommendedSolutionSummary, 'RECOMMENDATION', 'g4', input.opportunity.overallScore / 100),
    ],
    limitations: limitations.map((l) => stmt(l, 'FACT', 'g3_assessment')),
    nextAction: [
      stmt('Human operator should review brief and solution plan before any outreach (G5)', 'RECOMMENDATION', 'g4'),
    ],
  };

  const summary = `${input.resolved.canonicalName ?? input.analysis.businessHint ?? 'Prospect'} — ${input.opportunity.overallFitBand.replace(/_/g, ' ')}: ${objective}`;

  const briefStatus = deriveBriefStatus(input.preparationLevel, input.opportunity.overallFitBand);

  return {
    signalId: input.signal.signalId,
    resolvedEntityRef: input.resolved.resolvedEntityRef,
    assessmentRef: `${input.opportunity.signalId}:${input.opportunity.scorerVersion}`,
    summary,
    sections,
    evidence: [...knownFacts, ...inferences],
    knownFacts,
    inferences,
    unknowns,
    businessContext: {
      name: input.resolved.canonicalName ?? input.research?.businessIdentity ?? input.analysis.businessHint,
      entityKind: input.resolved.entityKind,
      location: input.resolved.location ?? input.analysis.locationHint,
      offerings: input.research?.offerings?.map((o) => o.name) ?? [],
      geographies: input.research?.geographies ?? [],
      website: input.resolved.website ?? input.research?.digitalPresence?.website ?? null,
    },
    opportunity: input.opportunity.reasons.join('; ') || summary,
    gaps,
    constraints: input.opportunity.disqualifiers,
    cardbeyFitSummary: `Score ${input.opportunity.overallScore}/100 — ${input.opportunity.primaryMatches.length} primary capabilities`,
    matchedCapabilities,
    recommendedSolutionSummary,
    confidence: input.opportunity.evidenceConfidence / 100,
    limitations,
    opportunityCard: buildOpportunityCard(input, canPrepareLabels),
    preparationLevel: input.preparationLevel,
    briefStatus,
    composedAt: new Date().toISOString(),
    composerVersion: G4_COMPOSER_VERSION,
  };
}

export function createBriefId(): string {
  return `oppbrief_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
