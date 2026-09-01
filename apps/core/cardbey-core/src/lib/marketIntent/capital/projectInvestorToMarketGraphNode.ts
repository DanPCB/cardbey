/**
 * Project researched investors into canonical MarketGraphNode for CAPITAL domain.
 * Does not permanently classify INVESTOR as supply — role is contextual from HAS/WANTS.
 * Never invents mandate attributes; missing evidence → UNKNOWN fields.
 */
import { projectMarketGraphNode, type MarketGraphNode } from '../marketGraphNode.js';
import { buildMarketIntentAnalysis } from '../buildMarketIntentAnalysis.js';
import { normalizeMarketSignal } from '../normalizeMarketSignal.js';
import type { HasWantsItem, AssertionBasis } from '../types.js';
import type {
  CapitalEvidenceRef,
  CapitalResourceProfile,
  UnknownMandateField,
} from './capitalTypes.js';

export type InvestorProjectionInput = {
  catalogId: string;
  name: string;
  type: string;
  geography: string;
  geographies: string[];
  stages: string[];
  themes: string[];
  canLead: boolean;
  website: string;
  headquarters: string;
  mandateSummary: string;
  /** Optional evidence-backed cheque range (AUD). Leave null if unknown. */
  chequeMinAud?: number | null;
  chequeMaxAud?: number | null;
  accessRoute?: string;
  publicTeamRoles?: string[];
  relevantPortfolio?: string[];
  /** Explicit exclusions only when publicly evidenced */
  stageExclusions?: string[];
  geographicRestrictions?: string[];
  evidenceAsOf?: string;
};

function item(
  type: HasWantsItem['type'],
  label: string,
  basis: AssertionBasis,
  confidence: number,
  statement: string,
): HasWantsItem {
  return {
    type,
    label,
    confidence,
    basis,
    evidence: [{ statement, basis, confidence }],
  };
}

function geoLabels(input: InvestorProjectionInput): string[] {
  const labels = new Set<string>();
  if (input.headquarters) labels.add(input.headquarters);
  for (const g of input.geographies) {
    if (g === 'au') labels.add('Australia');
    else if (g === 'sea') labels.add('Southeast Asia');
    else if (g === 'vn') labels.add('Vietnam');
    else if (g === 'global') labels.add('Global');
    else if (g === 'nz') labels.add('New Zealand');
    else if (g === 'us') labels.add('United States');
    else if (g === 'eu') labels.add('Europe');
    else labels.add(g);
  }
  return [...labels];
}

export function buildCapitalProfileFromInvestor(input: InvestorProjectionInput): CapitalResourceProfile {
  const unknownFields: UnknownMandateField[] = [];
  const sourceFacts: CapitalEvidenceRef[] = [];
  const interpretations: CapitalEvidenceRef[] = [];

  sourceFacts.push({
    kind: 'SOURCE_FACT',
    field: 'mandate_summary',
    summary: input.mandateSummary,
    sourceUrl: input.website,
    source: 'investor_catalog',
  });
  sourceFacts.push({
    kind: 'SOURCE_FACT',
    field: 'stages',
    summary: `Public stages: ${input.stages.join(', ') || 'unknown'}`,
    sourceUrl: input.website,
    source: 'investor_catalog',
  });
  sourceFacts.push({
    kind: 'SOURCE_FACT',
    field: 'geographies',
    summary: `Public geographies: ${input.geographies.join(', ')}`,
    sourceUrl: input.website,
    source: 'investor_catalog',
  });

  const chequeMinAud = input.chequeMinAud ?? null;
  const chequeMaxAud = input.chequeMaxAud ?? null;
  if (chequeMinAud == null) unknownFields.push('cheque_min');
  if (chequeMaxAud == null) unknownFields.push('cheque_max');
  if (!input.stageExclusions?.length) unknownFields.push('stage_exclusions');
  unknownFields.push('ownership_expectations');
  unknownFields.push('portfolio_conflicts');
  if (!input.themes.length) unknownFields.push('sector_detail');

  interpretations.push({
    kind: 'AI_INTERPRETATION',
    field: 'lead_follow',
    summary: input.canLead
      ? 'Catalog indicates lead capability (interpreted from public canLead flag)'
      : 'Catalog indicates follow/program participation (interpreted from public canLead flag)',
    source: 'investor_catalog',
  });

  return {
    domain: 'CAPITAL',
    actorKind: 'CAPITAL_PROVIDER',
    stages: [...input.stages],
    geographies: [...input.geographies],
    themes: [...input.themes],
    canLead: typeof input.canLead === 'boolean' ? input.canLead : null,
    chequeMinAud,
    chequeMaxAud,
    investorType: input.type || null,
    unknownFields: [...new Set(unknownFields)],
    evidenceRefs: [...sourceFacts, ...interpretations],
    sourceFacts,
    interpretations,
  };
}

/**
 * Project investor catalog org → MarketGraphNode.
 * HAS = capital capability (+ optional operational support when evidenced).
 * WANTS = investment opportunities at stated stages/themes/geographies.
 */
export function projectInvestorToMarketGraphNode(input: InvestorProjectionInput): {
  node: MarketGraphNode;
  capitalProfile: CapitalResourceProfile;
} {
  const capitalProfile = buildCapitalProfileFromInvestor(input);
  const has: HasWantsItem[] = [
    item('CAPITAL', 'investment capital capability', 'EXPLICIT', 0.85, input.mandateSummary),
    item('BUSINESS', input.name, 'EXPLICIT', 0.95, `Investor organisation: ${input.name}`),
    item('CAPABILITY', `${input.type} investment capability`, 'EXPLICIT', 0.8, `Type: ${input.type}`),
  ];

  if (input.stages.length) {
    has.push(
      item(
        'CAPABILITY',
        `stage investment: ${input.stages.join(', ')}`,
        'EXPLICIT',
        0.85,
        `Stages: ${input.stages.join(', ')}`,
      ),
    );
  }
  if (input.canLead === true) {
    has.push(item('CAPABILITY', 'lead investment capability', 'INFERRED', 0.7, 'canLead=true from catalog'));
  } else if (input.canLead === false) {
    has.push(item('CAPABILITY', 'follow or program capital', 'INFERRED', 0.7, 'canLead=false from catalog'));
  }
  if (chequeLabel(input)) {
    has.push(item('CAPITAL', chequeLabel(input)!, 'EXPLICIT', 0.75, chequeLabel(input)!));
  }

  const wants: HasWantsItem[] = [
    item(
      'SOLUTION',
      `investment opportunities (${input.stages.join(', ') || 'stage unknown'})`,
      'EXPLICIT',
      0.85,
      input.mandateSummary,
    ),
  ];
  if (input.themes.length) {
    wants.push(
      item('SOLUTION', `themes: ${input.themes.join(', ')}`, 'EXPLICIT', 0.8, `Themes: ${input.themes.join(', ')}`),
    );
  }
  wants.push(
    item(
      'SOLUTION',
      `companies in ${geoLabels(input).join(', ') || 'unspecified geography'}`,
      'EXPLICIT',
      0.8,
      `Geographies: ${input.geographies.join(', ')}`,
    ),
  );

  const constraints: string[] = [];
  if (input.geographicRestrictions?.length) {
    constraints.push(...input.geographicRestrictions.map((g) => `geography: ${g}`));
  }
  if (input.stageExclusions?.length) {
    constraints.push(...input.stageExclusions.map((s) => `stage_exclusion: ${s}`));
  }
  if (input.chequeMinAud != null) constraints.push(`cheque_min_aud: ${input.chequeMinAud}`);
  if (input.chequeMaxAud != null) constraints.push(`cheque_max_aud: ${input.chequeMaxAud}`);
  if (input.canLead === true) constraints.push('prefers_lead_or_can_lead');

  const rawText = [
    input.name,
    input.mandateSummary,
    `Stages: ${input.stages.join(', ')}`,
    `Geographies: ${input.geographies.join(', ')}`,
    `Themes: ${input.themes.join(', ')}`,
    `HQ: ${input.headquarters}`,
  ].join('. ');

  const signal = normalizeMarketSignal({
    signalId: `investor:${input.catalogId}`,
    sourceType: 'licensed_feed',
    sourceRef: input.catalogId,
    sourceUrl: input.website,
    rawText,
    locationHint: input.headquarters || null,
    provenance: {
      permissionBasis: 'public_catalog',
      ingestChannel: 'capital_resource_projection',
      sourcePlatform: 'investor_organization_catalog',
      evidenceAsOf: input.evidenceAsOf ?? null,
    },
  });

  const analysis = buildMarketIntentAnalysis(
    signal,
    {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: `Investor organisation projected for capital matching: ${input.name}`,
      classificationEvidence: [],
      intents: [{ family: 'INVEST', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has,
      wants,
      actorHint: input.name,
      businessHint: input.name,
      locationHint: input.headquarters || null,
    },
    'rule_assisted_fallback',
  );

  const node = projectMarketGraphNode({
    nodeId: `capital:investor:${input.catalogId}`,
    label: input.name,
    analysis,
  });

  // Attach constraints/preferences that projection may miss from override path
  const enriched: MarketGraphNode = {
    ...node,
    constraints: [...new Set([...node.constraints, ...constraints])],
    geographyLabels: [...new Set([...node.geographyLabels, ...geoLabels(input)])],
    contextSummary:
      node.contextSummary ??
      `${input.name} — capital provider (contextual). Mandate: ${input.mandateSummary}`,
  };

  return { node: enriched, capitalProfile };
}

function chequeLabel(input: InvestorProjectionInput): string | null {
  if (input.chequeMinAud == null && input.chequeMaxAud == null) return null;
  if (input.chequeMinAud != null && input.chequeMaxAud != null) {
    return `cheque range A$${input.chequeMinAud.toLocaleString()}–A$${input.chequeMaxAud.toLocaleString()}`;
  }
  if (input.chequeMinAud != null) return `cheque min A$${input.chequeMinAud.toLocaleString()}`;
  return `cheque max A$${input.chequeMaxAud!.toLocaleString()}`;
}

export function projectCatalogOrgToMarketGraphNode(org: {
  catalogId: string;
  name: string;
  type: string;
  geography: string;
  geographies: string[];
  stages: string[];
  themes: string[];
  canLead: boolean;
  website: string;
  headquarters: string;
  mandateSummary: string;
  chequeMinAud?: number | null;
  chequeMaxAud?: number | null;
  accessRoute?: string;
  publicTeamRoles?: string[];
  relevantPortfolio?: string[];
}): ReturnType<typeof projectInvestorToMarketGraphNode> {
  return projectInvestorToMarketGraphNode(org);
}
