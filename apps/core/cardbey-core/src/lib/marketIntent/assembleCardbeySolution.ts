import { randomUUID } from 'node:crypto';
import type { MarketIntentAnalysis } from './types.js';
import type { MarketOpportunityAssessment, CardbeyCapabilityMatch } from './opportunityTypes.js';
import type {
  ProposedCardbeySolution,
  SolutionComponent,
  G4Outcome,
  PreparationLevel,
} from './briefTypes.js';
import { getMarketCapabilityById } from './marketCapabilityCatalog.js';
import { isSolutionAssemblyEligible } from './determinePreparationLevel.js';

export const G4_ASSEMBLER_VERSION = 'g4.0.0-composition';

/** Canonical dependency order for solution sequencing */
const CAPABILITY_SEQUENCE_ORDER = [
  'market_research',
  'validate_store_context',
  'structured_store_build',
  'prepare_catalog',
  'create_store',
  'generate_mini_website',
  'edit_artifact',
  'analyze_store',
  'audit_store_completeness',
  'create_promotion',
  'create_campaign',
  'connect_social_account',
  'publish_to_social',
  'launch_campaign',
] as const;

const INTENT_PRIORITY_CAPABILITIES: Partial<Record<string, string[]>> = {
  DISTRIBUTE: ['market_research', 'structured_store_build', 'create_store', 'edit_artifact', 'create_promotion'],
  EXPAND: ['market_research', 'create_store', 'structured_store_build', 'create_promotion', 'publish_to_social'],
  PARTNER: ['structured_store_build', 'create_store', 'create_promotion', 'generate_mini_website'],
  PROMOTE: ['create_store', 'create_promotion', 'market_research', 'publish_to_social'],
  SELL: ['create_promotion', 'create_store', 'publish_to_social'],
  LAUNCH: ['create_store', 'structured_store_build', 'create_promotion', 'generate_mini_website'],
  SOLVE_BUSINESS_PROBLEM: ['market_research', 'create_store', 'create_promotion'],
  INVEST: ['create_store', 'create_promotion'],
  COLLABORATE: ['create_store', 'generate_mini_website'],
  OTHER_COMMERCIAL: ['market_research', 'create_store', 'create_promotion'],
};

function componentMode(match: CardbeyCapabilityMatch): SolutionComponent['mode'] {
  if (match.availability === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (match.approvalRequired) return 'HUMAN_ACTION_REQUIRED';
  if (match.availability === 'STUBBED') return 'EXECUTE_LATER';
  if (match.availability === 'PARTIAL') return 'PREPARE';
  return 'PREPARE';
}

function expectedOutput(capabilityId: string): string {
  const outputs: Record<string, string> = {
    market_research: 'Market entry / audience research brief',
    create_store: 'Claimable business store draft configuration',
    structured_store_build: 'Structured offering/catalog preview',
    edit_artifact: 'Localized business presentation copy',
    create_promotion: 'Promotion concept outline',
    publish_to_social: 'Social distribution plan (no auto-publish)',
    generate_mini_website: 'Mini-website presentation structure',
    launch_campaign: 'Campaign plan outline (deploy stubbed)',
    create_campaign: 'Campaign configuration draft',
    connect_social_account: 'Social account connection checklist',
    analyze_store: 'Store readiness audit',
    validate_store_context: 'Store context validation checklist',
    prepare_catalog: 'Catalog preparation outline',
    audit_store_completeness: 'Completeness audit report',
  };
  return outputs[capabilityId] ?? 'Prepared capability output';
}

function selectMinimalCapabilities(
  analysis: MarketIntentAnalysis,
  matches: CardbeyCapabilityMatch[],
): CardbeyCapabilityMatch[] {
  const primary = matches.filter((m) => m.fitLevel === 'DIRECT_MATCH' || m.fitLevel === 'SUPPORTING_MATCH');
  if (!primary.length) return [];

  const intentPriority = INTENT_PRIORITY_CAPABILITIES[analysis.intents.primary ?? ''] ?? [];
  const byId = new Map(primary.map((m) => [m.capabilityId, m]));

  const selected: CardbeyCapabilityMatch[] = [];
  for (const id of intentPriority) {
    const match = byId.get(id);
    if (match && match.availability !== 'UNAVAILABLE') {
      selected.push(match);
    }
    if (selected.length >= 5) break;
  }

  if (selected.length < 2) {
    for (const match of primary) {
      if (!selected.includes(match) && match.availability !== 'UNAVAILABLE') {
        selected.push(match);
      }
      if (selected.length >= 4) break;
    }
  }

  if (selected.length < 2) {
    const weak = matches.filter(
      (m) => m.fitLevel === 'WEAK_MATCH' && m.availability !== 'UNAVAILABLE',
    );
    for (const match of weak) {
      if (!selected.some((s) => s.capabilityId === match.capabilityId)) {
        selected.push(match);
      }
      if (selected.length >= 2) break;
    }
  }

  return selected;
}

function sortByDependency(capabilityIds: string[]): string[] {
  const order = new Map(CAPABILITY_SEQUENCE_ORDER.map((id, i) => [id, i]));
  return [...capabilityIds].sort((a, b) => (order.get(a as typeof CAPABILITY_SEQUENCE_ORDER[number]) ?? 99) - (order.get(b as typeof CAPABILITY_SEQUENCE_ORDER[number]) ?? 99));
}

function buildComponent(
  match: CardbeyCapabilityMatch,
  role: 'primary' | 'supporting',
  rank: number,
  dependencies: string[],
): SolutionComponent {
  const catalog = getMarketCapabilityById(match.capabilityId);
  return {
    capabilityId: match.capabilityId,
    capabilityName: match.capabilityName,
    role,
    reason: match.reason,
    mode: componentMode(match),
    inputs: [...match.inputRequirements, ...(catalog?.requiresStore ? ['storeId (after onboarding)'] : [])],
    expectedOutput: expectedOutput(match.capabilityId),
    dependencies,
    approvalRequired: match.approvalRequired,
    evidence: match.evidence,
    limitations: match.limitations,
    rank,
  };
}

export type AssembleCardbeySolutionInput = {
  signalId: string;
  analysis: MarketIntentAnalysis;
  opportunity: MarketOpportunityAssessment;
  capabilityMatches: CardbeyCapabilityMatch[];
  preparationLevel: PreparationLevel;
};

export function assembleCardbeySolution(input: AssembleCardbeySolutionInput): ProposedCardbeySolution | null {
  if (!isSolutionAssemblyEligible(input.preparationLevel)) {
    return null;
  }

  if (
    input.opportunity.overallFitBand === 'NOT_A_CARDBEY_OPPORTUNITY' ||
    input.opportunity.overallFitBand === 'NOT_APPLICABLE' ||
    input.opportunity.overallFitBand === 'INSUFFICIENT_EVIDENCE'
  ) {
    return null;
  }

  const selected = selectMinimalCapabilities(input.analysis, input.capabilityMatches);
  if (!selected.length) {
    return null;
  }

  const capabilityIds = sortByDependency(selected.map((m) => m.capabilityId));
  const components: SolutionComponent[] = [];
  const prior: string[] = [];

  capabilityIds.forEach((id, index) => {
    const match = selected.find((m) => m.capabilityId === id)!;
    const role: 'primary' | 'supporting' =
      input.opportunity.primaryMatches.some((p) => p.capabilityId === id) ? 'primary' : 'supporting';
    const deps = [...prior];
    components.push(buildComponent(match, role, index + 1, deps));
    prior.push(id);
  });

  const preparableNow = components
    .filter((c) => c.mode === 'PREPARE' && c.role === 'primary')
    .map((c) => c.capabilityId);
  const executableNow = components
    .filter((c) => c.mode === 'PREPARE' && !c.approvalRequired)
    .map((c) => c.capabilityId);
  const approvalsRequired = components.filter((c) => c.approvalRequired).map((c) => c.capabilityId);

  const objective =
    input.analysis.wants[0]?.label ??
    input.analysis.intents.primary?.replace(/_/g, ' ').toLowerCase() ??
    'support business growth';

  const targetOutcome = `Prepare useful Cardbey value for: ${objective}`;

  const effortBand: ProposedCardbeySolution['estimatedEffortBand'] =
    components.length >= 4 ? 'HIGH' : components.length >= 2 ? 'MEDIUM' : 'LOW';

  const limitations = [
    ...input.opportunity.limitations,
    'G4 prepares plans and previews only — no external execution or outreach',
    ...input.opportunity.unavailableDesiredCapabilities.map((u) => `${u.need}: ${u.reason}`),
  ];

  let solutionStatus: G4Outcome = 'SOLUTION_READY';
  if (!preparableNow.length && components.every((c) => c.mode === 'UNAVAILABLE')) {
    solutionStatus = 'CAPABILITY_UNAVAILABLE';
  }

  return {
    solutionId: `sol_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    signalId: input.signalId,
    opportunityAssessmentRef: `${input.opportunity.signalId}:${input.opportunity.scorerVersion}`,
    objective,
    targetOutcome,
    components,
    sequence: capabilityIds,
    capabilityIds,
    requiredInputs: ['signalId', 'resolvedEntityRef', 'human review before execution'],
    optionalInputs: ['targetMarket', 'preferredLanguage', 'brandAssets'],
    executableNow,
    preparableNow,
    unavailableDesired: input.opportunity.unavailableDesiredCapabilities,
    approvalsRequired,
    estimatedEffortBand: effortBand,
    confidence: input.opportunity.evidenceConfidence / 100,
    limitations,
    previews: [],
    solutionStatus,
    preparationLevel: input.preparationLevel,
    assembledAt: new Date().toISOString(),
    assemblerVersion: G4_ASSEMBLER_VERSION,
  };
}

export function createSolutionId(): string {
  return `sol_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
