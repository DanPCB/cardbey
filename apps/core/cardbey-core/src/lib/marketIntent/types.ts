/**
 * Market Intent G1 — source-neutral external signal + commercial intent contracts.
 * Separate from Performer user intent and business ingestion seed records.
 */

/** How the signal entered Cardbey (source-neutral; not platform-specific types). */
export type MarketSignalSourceType =
  | 'manual_entry'
  | 'csv_import'
  | 'social_post_copy'
  | 'website_snippet'
  | 'community_post'
  | 'licensed_feed'
  | 'partner_feed'
  | 'executive_growth'
  | 'cardbey_native'
  | 'api_webhook';

export type CommercialClassification =
  | 'COMMERCIAL'
  | 'NON_COMMERCIAL'
  | 'AMBIGUOUS'
  | 'UNKNOWN';

export type MarketIntentSemanticStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'FAILED';

export type MarketIntentSemanticFailureCode =
  | 'LLM_PROVIDER_NOT_CONFIGURED'
  | 'LLM_PROVIDER_UNAVAILABLE'
  | 'LLM_REQUEST_FAILED'
  | 'LLM_RESPONSE_INVALID'
  | 'LLM_TIMEOUT'
  | 'SEMANTIC_EXTRACTION_FAILED';

export type MarketIntentFamily =
  | 'SELL'
  | 'BUY'
  | 'PROMOTE'
  | 'LAUNCH'
  | 'EXPAND'
  | 'PARTNER'
  | 'INVEST'
  | 'COLLABORATE'
  | 'HIRE'
  | 'SUPPLY'
  | 'DISTRIBUTE'
  | 'SOLVE_BUSINESS_PROBLEM'
  | 'OTHER_COMMERCIAL';

export type HasCategory =
  | 'PRODUCT'
  | 'SERVICE'
  | 'BUSINESS'
  | 'CAPABILITY'
  | 'ASSET'
  | 'CAPITAL'
  | 'LOCATION'
  | 'AUDIENCE'
  | 'KNOWLEDGE'
  | 'RELATIONSHIP'
  | 'OTHER';

import { MARKET_ACTOR_ROLES, MARKET_SIDES } from './constants.js';

export type MarketActorRole = (typeof MARKET_ACTOR_ROLES)[number];
export type MarketSide = (typeof MARKET_SIDES)[number];

export type DemandConstraintKind =
  | 'QUANTITY'
  | 'BUDGET'
  | 'TIMING'
  | 'GEOGRAPHY'
  | 'QUALITY'
  | 'OTHER';

export interface DemandConstraint {
  label: string;
  kind: DemandConstraintKind;
  basis: AssertionBasis;
  confidence: number;
  evidence: EvidenceStatement[];
}

export interface DemandPreference {
  label: string;
  basis: AssertionBasis;
  confidence: number;
  evidence: EvidenceStatement[];
}

export interface BudgetEvidence {
  label: string;
  basis: AssertionBasis;
  confidence: number;
  evidence: EvidenceStatement[];
}

export interface TimeHorizonEvidence {
  label: string;
  basis: AssertionBasis;
  confidence: number;
  evidence: EvidenceStatement[];
}

export interface ActorRoleAssessment {
  primary: MarketActorRole;
  secondary: MarketActorRole[];
  confidence: number;
  reason: string;
  evidence: EvidenceStatement[];
}

export interface MarketSideAssessment {
  side: MarketSide;
  confidence: number;
  reason: string;
  supplyFacet: boolean;
  demandFacet: boolean;
}

export interface DemandContext {
  constraints: DemandConstraint[];
  preferences: DemandPreference[];
  timeHorizon: TimeHorizonEvidence | null;
  budgetEvidence: BudgetEvidence | null;
}

/** Lightweight projection contract for future MarketGraphNode — not a graph DB. */
export interface GraphProjectionHints {
  nodeKind: 'MARKET_ACTOR' | 'NON_MARKET_SIGNAL';
  supplyFacets: HasWantsItem[];
  demandFacets: HasWantsItem[];
  identityHints: {
    actorHint?: string | null;
    businessHint?: string | null;
    locationHint?: string | null;
  };
  actorRoles: MarketActorRole[];
  marketSide: MarketSide;
}

export interface MarketRepresentation {
  actorRole: ActorRoleAssessment;
  marketSide: MarketSideAssessment;
  demandContext: DemandContext;
  graphProjection: GraphProjectionHints;
}

export type WantsCategory =
  | 'CUSTOMER'
  | 'BUYER'
  | 'SUPPLIER'
  | 'PARTNER'
  | 'INVESTOR'
  | 'CAPITAL'
  | 'DISTRIBUTOR'
  | 'RESELLER'
  | 'EMPLOYEE'
  | 'COLLABORATOR'
  | 'MARKET_ACCESS'
  | 'PROMOTION'
  | 'GROWTH'
  | 'SOLUTION'
  | 'OTHER';

export type AssertionBasis = 'EXPLICIT' | 'INFERRED';

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type ProcessingOutcome =
  | 'READY'
  | 'NON_COMMERCIAL'
  | 'AMBIGUOUS'
  | 'INVALID_INPUT'
  | 'CLASSIFICATION_FAILED'
  | 'SEMANTIC_RUNTIME_DEGRADED';

export interface EvidenceStatement {
  statement: string;
  /** Verbatim substring from rawText when available. */
  span?: string | null;
  basis: AssertionBasis;
  confidence: number;
}

export interface HasWantsItem {
  type: HasCategory | WantsCategory;
  label: string;
  confidence: number;
  basis: AssertionBasis;
  evidence: EvidenceStatement[];
}

export interface MarketSignalProvenance {
  permissionBasis?: string | null;
  ingestedBy?: string | null;
  sourcePlatform?: string | null;
  ingestChannel?: string | null;
  [key: string]: unknown;
}

/** Canonical external market signal (G1). Raw text and provenance are always preserved. */
export interface ExternalMarketSignal {
  signalId: string;
  fingerprint: string;
  sourceType: MarketSignalSourceType;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  observedAt?: string | null;
  capturedAt: string;
  rawText: string;
  language?: string | null;
  actorHint?: string | null;
  locationHint?: string | null;
  provenance: MarketSignalProvenance;
  metadata?: Record<string, unknown>;
  /** Future G0/G2 lineage — opportunity and attribution hooks. */
  attributionContext?: Record<string, unknown> | null;
}

export interface IntentItem {
  family: MarketIntentFamily;
  confidence: number;
  basis: AssertionBasis;
  evidence: EvidenceStatement[];
}

export interface MarketIntentAnalysis {
  signalId: string;
  fingerprint: string;
  classification: CommercialClassification;
  classificationConfidence: number;
  classificationReason: string;
  classificationEvidence: EvidenceStatement[];
  intents: {
    primary: MarketIntentFamily | null;
    secondary: MarketIntentFamily[];
    items: IntentItem[];
  };
  has: HasWantsItem[];
  wants: HasWantsItem[];
  actorHint?: string | null;
  businessHint?: string | null;
  locationHint?: string | null;
  marketRepresentation?: MarketRepresentation | null;
  outcome: ProcessingOutcome;
  analyzedAt: string;
  analyzerVersion: string;
  diagnostics: MarketIntentDiagnostics;
}

export interface MarketIntentDiagnostics {
  signalId: string;
  classification: CommercialClassification;
  primaryIntent: MarketIntentFamily | null;
  classificationConfidence: number;
  outcome: ProcessingOutcome;
  method: 'llm' | 'rule_assisted_fallback' | 'semantic_runtime_degraded';
  failureReason?: string | null;
  semanticStatus?: MarketIntentSemanticStatus;
  semanticFailureCode?: MarketIntentSemanticFailureCode | null;
}

/** Caller input for manual / batch ingestion. */
export interface MarketSignalInput {
  rawText: string;
  sourceType: MarketSignalSourceType;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  observedAt?: string | null;
  signalId?: string | null;
  language?: string | null;
  actorHint?: string | null;
  locationHint?: string | null;
  provenance?: MarketSignalProvenance;
  metadata?: Record<string, unknown>;
  attributionContext?: Record<string, unknown> | null;
}

export interface IngestMarketSignalResult {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  duplicateOfSignalId?: string | null;
}
