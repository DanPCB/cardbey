/**
 * G3 — opportunity assessment + capability match contracts.
 */
import type { EntityEvidence } from './entityTypes.js';
import type { EvidenceStatement } from './types.js';

export type FitBand =
  | 'HIGH_FIT'
  | 'MEDIUM_FIT'
  | 'LOW_FIT'
  | 'NOT_A_CARDBEY_OPPORTUNITY'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NOT_APPLICABLE';

export type G3Outcome =
  | 'READY'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NO_RELEVANT_CAPABILITY'
  | 'NOT_A_CARDBEY_OPPORTUNITY'
  | 'NOT_APPLICABLE'
  | 'ASSESSMENT_FAILED';

export type CapabilityFitLevel = 'DIRECT_MATCH' | 'SUPPORTING_MATCH' | 'WEAK_MATCH' | 'NOT_AVAILABLE';

export type CapabilityAvailability = 'AVAILABLE' | 'PARTIAL' | 'FLAGGED' | 'STUBBED' | 'UNAVAILABLE';

export type MissionContext = 'CARDBEY_ACQUISITION' | 'BUSINESS_GROWTH' | 'SUPPLY_MATCH';

export interface FitFactorScore {
  factor:
    | 'intentStrength'
    | 'evidenceConfidence'
    | 'entityConfidence'
    | 'businessRelevance'
    | 'capabilityFit'
    | 'strategicFit'
    | 'valueScope'
    | 'timing';
  score: number; // 0-100
  weight: number; // percentage weight
  weightedContribution: number;
  reason: string;
}

export interface AssessmentEvidence {
  statement: string;
  source: 'g1' | 'g2_entity' | 'g2_research' | 'capability_authority' | 'assessment';
  basis?: string | null;
  confidence?: number | null;
}

export interface CardbeyCapabilityMatch {
  capabilityId: string;
  capabilityName: string;
  availability: CapabilityAvailability;
  fitLevel: CapabilityFitLevel;
  rank: number;
  score: number; // 0-100 match strength
  reason: string;
  inputRequirements: string[];
  executionMode: string;
  approvalRequired: boolean;
  evidence: AssessmentEvidence[];
  limitations: string[];
}

export interface MarketOpportunityAssessment {
  signalId: string;
  resolvedEntityRef?: string | null;
  missionContext: MissionContext;
  relevanceStatus: FitBand;
  intentStrength: number;
  evidenceConfidence: number;
  entityConfidence: number;
  businessRelevance: number;
  strategicFit: number;
  capabilityFit: number;
  overallFitBand: FitBand;
  /** Heuristic 0–100 — not predictive conversion probability */
  overallScore: number;
  factors: FitFactorScore[];
  reasons: string[];
  disqualifiers: string[];
  limitations: string[];
  primaryMatches: CardbeyCapabilityMatch[];
  supportingMatches: CardbeyCapabilityMatch[];
  unavailableDesiredCapabilities: Array<{
    need: string;
    reason: string;
  }>;
  assessmentEvidence: AssessmentEvidence[];
  assessedAt: string;
  scorerVersion: string;
}

export interface MarketSignalG3Result {
  signalId: string;
  opportunity: MarketOpportunityAssessment;
  capabilityMatches: CardbeyCapabilityMatch[];
  outcome: G3Outcome;
  diagnostics: {
    signalId: string;
    overallFitBand: FitBand;
    overallScore: number;
    outcome: G3Outcome;
    primaryCapabilityCount: number;
    failureReason?: string | null;
  };
  /** Preserved upstream evidence */
  provenanceChain: {
    g1Evidence: EvidenceStatement[];
    entityEvidence: EntityEvidence[];
    researchEvidence: EntityEvidence[];
  };
}
