/**
 * Cardbey Seed 2026 — internal capital mission context.
 * Distinguishes proposed terms / current evidence / hypotheses / desired outcomes.
 * Does not fabricate traction, valuation, revenue, or investor interest.
 */
import { projectMarketGraphNode, type MarketGraphNode } from '../marketGraphNode.js';
import { buildMarketIntentAnalysis } from '../buildMarketIntentAnalysis.js';
import { normalizeMarketSignal } from '../normalizeMarketSignal.js';
import type { HasWantsItem } from '../types.js';
import type { CapitalSeekerProfile } from './qualifyCapitalPair.js';

export const CARDBEY_SEED_2026_MISSION_ID = 'cardbey-seed-2026';
export const CARDBEY_SEED_2026_NODE_ID = 'capital:seeker:cardbey-seed-2026';

/** Proposed round terms — aspirations, not verified outcomes. */
export const CARDBEY_SEED_2026_PROPOSED_TERMS = Object.freeze({
  roundLabel: 'Seed',
  targetRaiseAud: 3_000_000,
  currency: 'AUD',
  targetLabel: 'A$3M seed',
  geographyFocus: ['au', 'sea'],
  themes: ['marketplace', 'ai', 'saas', 'commerce', 'sme'],
  seeksLead: true as boolean | null,
  status: 'proposed',
});

/** Current evidence legitimately available as platform self-description — not traction claims. */
export const CARDBEY_SEED_2026_EVIDENCE = Object.freeze({
  companyLabel: 'Cardbey',
  description:
    'Australian marketplace and business intelligence platform connecting commercial actors, resources, and execution workflows.',
  headquarters: 'Australia',
  productDomains: ['marketplace', 'business intelligence', 'commerce tools', 'SME enablement'],
  internationalAmbition: 'Australia and Southeast Asia',
  evidenceKind: 'SOURCE_FACT' as const,
  notes: [
    'Platform exists as an operating product codebase and staged deployments.',
    'No revenue, valuation, or investor-interest figures are asserted in this mission record.',
  ],
});

export const CARDBEY_SEED_2026_HYPOTHESES = Object.freeze({
  items: [
    'Seed-stage ANZ and selective SEA funds with marketplace/SaaS themes may be plausible counterparties.',
    'A$3M may require a lead plus syndicate rather than a single-cheque close.',
  ],
  status: 'hypothesis',
});

export const CARDBEY_SEED_2026_DESIRED_OUTCOMES = Object.freeze({
  items: [
    'Identify evidence-backed capital counterparties for human review',
    'Prepare fundraising campaign admission packages without outreach',
  ],
  status: 'desired',
});

export function buildCardbeySeed2026SeekerProfile(): CapitalSeekerProfile {
  return {
    stagesSought: ['seed'],
    raiseAmountAud: CARDBEY_SEED_2026_PROPOSED_TERMS.targetRaiseAud,
    geographies: [...CARDBEY_SEED_2026_PROPOSED_TERMS.geographyFocus],
    themes: [...CARDBEY_SEED_2026_PROPOSED_TERMS.themes],
    seeksLead: CARDBEY_SEED_2026_PROPOSED_TERMS.seeksLead,
  };
}

export function buildCardbeySeed2026MarketGraphNode(): MarketGraphNode {
  const has: HasWantsItem[] = [
    {
      type: 'BUSINESS',
      label: 'Cardbey marketplace intelligence platform',
      confidence: 0.9,
      basis: 'EXPLICIT',
      evidence: [
        {
          statement: CARDBEY_SEED_2026_EVIDENCE.description,
          basis: 'EXPLICIT',
          confidence: 0.9,
        },
      ],
    },
    {
      type: 'CAPABILITY',
      label: 'commerce and intelligence technology',
      confidence: 0.85,
      basis: 'EXPLICIT',
      evidence: [
        {
          statement: `Product domains: ${CARDBEY_SEED_2026_EVIDENCE.productDomains.join(', ')}`,
          basis: 'EXPLICIT',
          confidence: 0.85,
        },
      ],
    },
    {
      type: 'CAPABILITY',
      label: 'supported business evidence network',
      confidence: 0.75,
      basis: 'INFERRED',
      evidence: [
        {
          statement: 'Platform operates business/network workflows (inferred from product scope)',
          basis: 'INFERRED',
          confidence: 0.75,
        },
      ],
    },
    {
      type: 'CAPABILITY',
      label: 'Resource Aggregation Accelerator (HAS ↔ WANTS coordination)',
      confidence: 0.85,
      basis: 'EXPLICIT',
      evidence: [
        {
          statement:
            'Platform implements Market Intent / MarketGraph HAS↔WANTS reciprocal matching as operating architecture (EXISTING_CAPABILITY — not proven network-effect economics).',
          basis: 'EXPLICIT',
          confidence: 0.85,
        },
      ],
    },
  ];

  const wants: HasWantsItem[] = [
    {
      type: 'CAPITAL',
      label: 'A$3M seed capital (proposed)',
      confidence: 0.9,
      basis: 'EXPLICIT',
      evidence: [
        {
          statement: 'Proposed seed raise target A$3,000,000 AUD',
          basis: 'EXPLICIT',
          confidence: 0.9,
        },
      ],
    },
    {
      type: 'INVESTOR',
      label: 'seed-stage investors Australia / Southeast Asia',
      confidence: 0.85,
      basis: 'EXPLICIT',
      evidence: [
        {
          statement: 'Seeking seed-stage capital counterparties with AU/SEA relevance',
          basis: 'EXPLICIT',
          confidence: 0.85,
        },
      ],
    },
  ];

  const rawText = [
    CARDBEY_SEED_2026_EVIDENCE.companyLabel,
    CARDBEY_SEED_2026_EVIDENCE.description,
    'Proposed: raising A$3M seed round for product and growth.',
    'Seeking seed-stage investors and strategic capital partners in Australia and Southeast Asia.',
    'No claim of closed capital, valuation, or revenue in this signal.',
  ].join(' ');

  const signal = normalizeMarketSignal({
    signalId: CARDBEY_SEED_2026_MISSION_ID,
    sourceType: 'cardbey_native',
    sourceRef: CARDBEY_SEED_2026_MISSION_ID,
    rawText,
    locationHint: 'Australia',
    provenance: {
      permissionBasis: 'internal_mission',
      ingestChannel: 'capital_fundraising_mission',
      sourcePlatform: 'cardbey',
    },
  });

  const analysis = buildMarketIntentAnalysis(
    signal,
    {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Internal capital raise mission — proposed seed terms with platform self-evidence',
      classificationEvidence: [],
      intents: [{ family: 'INVEST', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has,
      wants,
      actorHint: 'Cardbey',
      businessHint: 'Cardbey',
      locationHint: 'Australia',
    },
    'rule_assisted_fallback',
  );

  const node = projectMarketGraphNode({
    nodeId: CARDBEY_SEED_2026_NODE_ID,
    label: 'Cardbey — Seed 2026 (proposed A$3M)',
    analysis,
  });

  return {
    ...node,
    constraints: [
      ...node.constraints,
      'proposed_raise_aud: 3000000',
      'stage: seed',
      'no_fabricated_traction',
    ],
    geographyLabels: [...new Set([...node.geographyLabels, 'Australia', 'Southeast Asia'])],
  };
}

export function getCardbeySeed2026MissionRecord() {
  return {
    missionId: CARDBEY_SEED_2026_MISSION_ID,
    name: 'Cardbey Seed 2026',
    status: 'active_research',
    companyLabel: CARDBEY_SEED_2026_EVIDENCE.companyLabel,
    graphNodeId: CARDBEY_SEED_2026_NODE_ID,
    proposedTerms: CARDBEY_SEED_2026_PROPOSED_TERMS,
    evidence: CARDBEY_SEED_2026_EVIDENCE,
    hypotheses: CARDBEY_SEED_2026_HYPOTHESES,
    desiredOutcomes: CARDBEY_SEED_2026_DESIRED_OUTCOMES,
  };
}
