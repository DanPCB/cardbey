/**
 * G2 — resolved entity + research contracts for external market signals.
 */
import type { EvidenceStatement } from './types.js';

export type MarketEntityKind =
  | 'PERSON'
  | 'BUSINESS'
  | 'PROJECT'
  | 'PRODUCT_BRAND'
  | 'UNKNOWN';

export type ResolutionStatus =
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'AMBIGUOUS'
  | 'UNRESOLVED'
  | 'NOT_APPLICABLE';

export type KnowledgeBasis = 'FACT' | 'INFERENCE' | 'UNKNOWN';

export type G2Outcome =
  | 'RESOLUTION_READY'
  | 'RESOLUTION_AMBIGUOUS'
  | 'RESOLUTION_UNRESOLVED'
  | 'RESEARCH_READY'
  | 'RESEARCH_NOT_APPLICABLE'
  | 'RESEARCH_INSUFFICIENT_EVIDENCE'
  | 'RESEARCH_FAILED'
  | 'SKIPPED_NON_COMMERCIAL'
  | 'SKIPPED_AMBIGUOUS_G1';

export type ResearchStatus =
  | 'READY'
  | 'NOT_APPLICABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'FAILED'
  | 'SKIPPED';

export interface EntityEvidence {
  statement: string;
  span?: string | null;
  basis: KnowledgeBasis;
  confidence: number;
  source?: string | null;
}

export type IdentityHintKind = 'PERSON' | 'BUSINESS' | 'UNKNOWN';

export type IdentityHintProvenance =
  | 'BUSINESS_EXPLICIT'
  | 'BUSINESS_INFERRED'
  | 'PERSON_EXPLICIT'
  | 'PROFILE_NAME'
  | 'WEBSITE_DOMAIN'
  | 'PHONE'
  | 'ADDRESS'
  | 'SOCIAL_PROFILE'
  | 'OTHER';

export type CandidateCoherenceDecision =
  | 'MATCH'
  | 'POSSIBLE_MATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONTRADICTED';

export interface EntityCandidate {
  entityId: string;
  name: string;
  website?: string | null;
  location?: string | null;
  phone?: string | null;
  placeId?: string | null;
  category?: string | null;
  confidence: number;
  matchReasons: string[];
  source: string;
  /** Provider confidence — how sure Google Places is about the candidate itself. */
  providerCandidateConfidence?: number;
  /** Cardbey identity confidence — how sure the candidate matches the source signal. */
  identityMatchConfidence?: number | null;
  coherenceDecision?: CandidateCoherenceDecision;
  coherenceReasons?: string[];
  candidateGeography?: string | null;
}

export interface ResolvedMarketEntity {
  signalId: string;
  resolvedEntityRef: string;
  entityKind: MarketEntityKind;
  resolutionStatus: ResolutionStatus;
  confidence: number;
  canonicalName?: string | null;
  website?: string | null;
  domains: string[];
  socialProfiles: Array<{ platform: string; url: string }>;
  location?: string | null;
  externalIdentifiers: Array<{ type: string; value: string }>;
  evidence: EntityEvidence[];
  candidateEntities: EntityCandidate[];
  selectedCandidateId?: string | null;
  resolutionNotes: string[];
  candidateReviews?: Array<{
    name: string;
    source: string;
    decision: CandidateCoherenceDecision;
    providerCandidateConfidence: number;
    identityMatchConfidence: number;
    reasons: string[];
  }>;
  researchedAt?: string | null;
}

export interface MarketOfferingItem {
  name: string;
  description?: string | null;
  category?: string | null;
  price?: number | null;
  currency?: string | null;
  basis: KnowledgeBasis;
  confidence: number;
  sourceUrl?: string | null;
  evidence: EntityEvidence[];
}

export interface MarketEntityResearch {
  signalId: string;
  resolvedEntityRef: string;
  businessIdentity?: string | null;
  businessType?: string | null;
  summary?: string | null;
  offerings: MarketOfferingItem[];
  capabilities: string[];
  geographies: string[];
  customerSegments: string[];
  digitalPresence: {
    website?: string | null;
    socialProfiles: Array<{ platform: string; url: string }>;
  };
  publicContacts: Array<{ type: string; value: string; basis: KnowledgeBasis; confidence: number }>;
  evidence: EntityEvidence[];
  confidence: number;
  researchStatus: ResearchStatus;
  limitations: string[];
  researchedAt: string;
  /** Reference to underlying BusinessResearchResult cache key when research ran. */
  researchCacheKey?: string | null;
}

export interface MarketSignalG2Result {
  signalId: string;
  resolvedEntity: ResolvedMarketEntity;
  research: MarketEntityResearch | null;
  outcome: G2Outcome;
  diagnostics: {
    signalId: string;
    entityKind: MarketEntityKind;
    resolutionStatus: ResolutionStatus;
    researchStatus: ResearchStatus | null;
    outcome: G2Outcome;
    failureReason?: string | null;
    resolutionHints?: ResolutionHints;
    placesLookup?: 'attempted' | 'skipped' | 'unavailable';
    candidateReviews?: Array<{
      name: string;
      source: string;
      decision: CandidateCoherenceDecision;
      providerCandidateConfidence: number;
      identityMatchConfidence: number;
      reasons: string[];
    }>;
  };
  /** Preserved G1 evidence chain */
  g1Evidence: EvidenceStatement[];
}

export interface ResolutionHints {
  businessName?: string | null;
  actorHint?: string | null;
  actorHintKind?: IdentityHintKind | null;
  businessNameProvenance?: IdentityHintProvenance | null;
  location?: string | null;
  websiteHint?: string | null;
  phoneHint?: string | null;
  category?: string | null;
  socialProfileUrl?: string | null;
}
