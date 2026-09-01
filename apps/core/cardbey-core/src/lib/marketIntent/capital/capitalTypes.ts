/**
 * Evidence provenance kinds for capital resource projection.
 * SOURCE_FACT = publicly evidenced catalog/mandate fact.
 * AI_INTERPRETATION = derived/interpreted (must never invent mandate attributes).
 */
export type EvidenceKind = 'SOURCE_FACT' | 'AI_INTERPRETATION' | 'UNKNOWN';

export type CapitalEvidenceRef = {
  kind: EvidenceKind;
  summary: string;
  sourceUrl?: string | null;
  source?: string | null;
  field?: string | null;
};

export type UnknownMandateField =
  | 'cheque_min'
  | 'cheque_max'
  | 'stage_exclusions'
  | 'ownership_expectations'
  | 'lead_follow'
  | 'sector_detail'
  | 'portfolio_conflicts';

export type CapitalResourceProfile = {
  domain: 'CAPITAL';
  actorKind: 'CAPITAL_SEEKER' | 'CAPITAL_PROVIDER' | 'DUAL' | 'UNKNOWN';
  stages: string[];
  geographies: string[];
  themes: string[];
  canLead: boolean | null;
  chequeMinAud: number | null;
  chequeMaxAud: number | null;
  investorType: string | null;
  unknownFields: UnknownMandateField[];
  evidenceRefs: CapitalEvidenceRef[];
  sourceFacts: CapitalEvidenceRef[];
  interpretations: CapitalEvidenceRef[];
};

export type CapitalQualificationBand =
  | 'QUALIFIED'
  | 'PARTIAL'
  | 'REVIEW_REQUIRED'
  | 'INCOMPATIBLE'
  | 'INSUFFICIENT_EVIDENCE';

export type CapitalDimensionFit = 'COMPATIBLE' | 'PARTIAL' | 'UNKNOWN' | 'INCOMPATIBLE';

/**
 * Factor ownership — avoid double-counting with reciprocal matcher.
 *
 * Reciprocal (general): HAS/WANTS resource overlap, coarse geography labels,
 * generic constraints, actor-type guards, evidence confidence band.
 *
 * Capital domain (this module): round/stage, cheque range, mandate themes,
 * lead/follow, capital-specific geo codes (au/sea/…), ownership/mandate exclusions.
 */
export type CapitalDomainQualification = {
  kind: 'CAPITAL_DOMAIN_QUALIFICATION_V1';
  band: CapitalQualificationBand;
  stageFit: CapitalDimensionFit;
  chequeFit: CapitalDimensionFit;
  geographyFit: CapitalDimensionFit;
  mandateFit: CapitalDimensionFit;
  leadFollowFit: CapitalDimensionFit;
  compatibleFactors: string[];
  contradictions: string[];
  unknowns: string[];
  rankingReasons: string[];
  /** Never a funding probability — ordinal rank hint for operator review only. */
  reviewPriority: number;
};

export type QualifiedCapitalOpportunity = {
  kind: 'QUALIFIED_CAPITAL_OPPORTUNITY_V1';
  companyNodeId: string;
  investorNodeId: string;
  reciprocalBand: string;
  reciprocalMatch: unknown;
  capitalQualification: CapitalDomainQualification;
  reviewState: 'pending' | 'reviewed' | 'admit_to_campaign' | 'dismissed';
  handoff?: CapitalCampaignHandoffContract | null;
};

export type CapitalCampaignHandoffContract = {
  kind: 'ADMIT_TO_FUNDRAISING_CAMPAIGN_V1';
  companyNodeId: string;
  investorNodeId: string;
  fundraisingObjectiveId: string;
  evidenceRefs: CapitalEvidenceRef[];
  reciprocalBand: string;
  capitalQualificationBand: CapitalQualificationBand;
  unresolvedGaps: string[];
  sourceProvenance: Record<string, unknown>;
  preparedAt: string;
  /** Conceptual only in V1 — does not execute CRM writes unless caller confirms. */
  requiresHumanConfirmation: true;
};
