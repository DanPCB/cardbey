/**
 * Multi-source BusinessCandidate enrichment — types only.
 * Does not write BusinessSeed / Business / DraftStore / User.
 */

export type EnrichmentFieldName =
  | 'description'
  | 'category'
  | 'tags'
  | 'heroImageUrl'
  | 'biBrief'
  | 'openingHours'
  | 'abn'
  | 'legalName'
  | 'website'
  | 'phone'
  | 'email'
  | 'socialLinks';

export type EnrichmentSourceKind =
  | 'business_website'
  | 'instagram_public'
  | 'facebook_public'
  | 'linkedin_public'
  | 'abr_lookup'
  | 'openstreetmap'
  | 'yellow_pages'
  | 'true_local'
  | 'yelp'
  | 'tripadvisor'
  | 'google_places'
  | 'pexels'
  | 'pixabay'
  | 'unsplash'
  | 'claude_synthesised'
  | 'rule_synthesised';

export type EnrichmentSourceTier = 1 | 2 | 3 | 4;

export type CandidateEnrichmentStatus = 'ENRICHED' | 'PARTIAL' | 'SKIPPED' | 'TIMEOUT';

export interface CandidateFieldProvenanceRecord {
  id: string;
  enrichmentRunId: string;
  candidateId: string;
  field: EnrichmentFieldName | string;
  source: EnrichmentSourceKind | string;
  sourceTier: EnrichmentSourceTier;
  sourceUrl: string | null;
  confidence: number;
  rawExtract: string | null;
  generatedAt: string;
}

export interface MultiSourceEnrichmentResult {
  candidateId: string;
  businessName: string | null;
  enrichmentRunId: string;
  status: CandidateEnrichmentStatus;
  category: string | null;
  descriptionLength: number;
  heroImageSource: string | null;
  biStatus: 'generated' | 'not_generated' | 'failed';
  abn: string | null;
  sourcesUsed: string[];
  highestTierReached: EnrichmentSourceTier | null;
  flags: string[];
  enrichmentDurationMs: number;
  websiteFetches: number;
  claudeCalls: number;
  message?: string;
}

export interface MultiSourceBatchResult {
  enrichmentRunId: string;
  batchId: string;
  startedAt: string;
  finishedAt: string;
  results: MultiSourceEnrichmentResult[];
  summary: {
    total: number;
    enriched: number;
    partial: number;
    skipped: number;
    timeout: number;
  };
}

export interface ConfirmedField<T = string> {
  value: T;
  source: EnrichmentSourceKind;
  sourceTier: EnrichmentSourceTier;
  sourceUrl: string | null;
  confidence: number;
  rawExtract: string | null;
}

export interface EnrichmentReconProfile {
  searchQueryPrimary: string;
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  yellowPagesUrl: string | null;
  identifiedUrls: string[];
}

export const FROZEN_CANDIDATE_KEYS = [
  'id',
  'batchId',
  'seedId',
  'status',
  'dedupeKey',
  'placeId',
  'missionId',
  'storeDraftId',
  'storeId',
  'ownerId',
  'ownerMatched',
  'campaignId',
  'discoveryProviderId',
  'externalId',
  'createdAt',
] as const;

export type FrozenCandidateKey = (typeof FROZEN_CANDIDATE_KEYS)[number];
