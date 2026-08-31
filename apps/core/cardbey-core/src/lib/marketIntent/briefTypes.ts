/**
 * G4 — opportunity brief + solution assembly contracts.
 */
import type { AssessmentEvidence } from './opportunityTypes.js';

export type BriefKnowledgeBasis = 'FACT' | 'INFERENCE' | 'RECOMMENDATION' | 'UNKNOWN';

export type PreparationLevel = 0 | 1 | 2 | 3;

export type G4Outcome =
  | 'BRIEF_READY'
  | 'SOLUTION_READY'
  | 'PREVIEW_READY'
  | 'NO_SOLUTION_REQUIRED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'PREPARATION_BLOCKED'
  | 'NOT_APPLICABLE'
  | 'ASSEMBLY_FAILED';

export type SolutionComponentMode =
  | 'PREPARE'
  | 'EXECUTE_LATER'
  | 'HUMAN_ACTION_REQUIRED'
  | 'UNAVAILABLE';

export interface BriefStatement {
  statement: string;
  basis: BriefKnowledgeBasis;
  confidence?: number | null;
  source?: 'g1' | 'g2_entity' | 'g2_research' | 'g3_assessment' | 'g4' | 'capability_authority';
}

export interface OpportunityBriefSections {
  situation: BriefStatement[];
  intent: BriefStatement[];
  business: BriefStatement[];
  opportunity: BriefStatement[];
  gaps: BriefStatement[];
  cardbeyFit: BriefStatement[];
  proposedSolution: BriefStatement[];
  limitations: BriefStatement[];
  nextAction: BriefStatement[];
}

/** Compact view model for future Performer / Executive Growth UI */
export interface OpportunityCardView {
  title: string;
  fitBand: string;
  fitLabel: string;
  intentSummary: string;
  foundSummary: string;
  relevanceSummary: string;
  canPrepare: string[];
  currentLimitations: string[];
  nextActionLabel: string;
}

export interface OpportunityBrief {
  signalId: string;
  resolvedEntityRef?: string | null;
  assessmentRef: string;
  summary: string;
  sections: OpportunityBriefSections;
  evidence: BriefStatement[];
  knownFacts: BriefStatement[];
  inferences: BriefStatement[];
  unknowns: BriefStatement[];
  businessContext: {
    name?: string | null;
    entityKind?: string | null;
    location?: string | null;
    offerings?: string[];
    geographies?: string[];
    website?: string | null;
  };
  opportunity: string;
  gaps: string[];
  constraints: string[];
  cardbeyFitSummary: string;
  matchedCapabilities: Array<{
    capabilityId: string;
    capabilityName: string;
    fitLevel: string;
    availability: string;
  }>;
  recommendedSolutionSummary: string;
  confidence: number;
  limitations: string[];
  opportunityCard: OpportunityCardView;
  preparationLevel: PreparationLevel;
  briefStatus: G4Outcome;
  composedAt: string;
  composerVersion: string;
}

export interface SolutionComponent {
  capabilityId: string;
  capabilityName: string;
  role: 'primary' | 'supporting';
  reason: string;
  mode: SolutionComponentMode;
  inputs: string[];
  expectedOutput: string;
  dependencies: string[];
  approvalRequired: boolean;
  evidence: AssessmentEvidence[];
  limitations: string[];
  rank: number;
}

export interface SolutionPreviewArtifact {
  type: 'store_presentation_preview' | 'promotion_concept' | 'market_entry_outline';
  capabilityId: string;
  label: string;
  preview: Record<string, unknown>;
  limitations: string[];
}

export interface ProposedCardbeySolution {
  solutionId: string;
  signalId: string;
  opportunityAssessmentRef: string;
  objective: string;
  targetOutcome: string;
  components: SolutionComponent[];
  sequence: string[];
  capabilityIds: string[];
  requiredInputs: string[];
  optionalInputs: string[];
  executableNow: string[];
  preparableNow: string[];
  unavailableDesired: Array<{ need: string; reason: string }>;
  approvalsRequired: string[];
  estimatedEffortBand?: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  limitations: string[];
  previews: SolutionPreviewArtifact[];
  solutionStatus: G4Outcome;
  preparationLevel: PreparationLevel;
  assembledAt: string;
  assemblerVersion: string;
}

export interface MarketSignalG4Result {
  signalId: string;
  brief: OpportunityBrief;
  solution: ProposedCardbeySolution | null;
  outcome: G4Outcome;
  preparationLevel: PreparationLevel;
  diagnostics: {
    signalId: string;
    outcome: G4Outcome;
    preparationLevel: PreparationLevel;
    componentCount: number;
    previewCount: number;
    failureReason?: string | null;
  };
  provenanceChain: {
    g1EvidenceCount: number;
    entityEvidenceCount: number;
    researchEvidenceCount: number;
    g3FactorCount: number;
  };
}
