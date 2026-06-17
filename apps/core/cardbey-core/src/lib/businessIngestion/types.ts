/**
 * Business Ingestion Foundation (V1) — shared types.
 *
 * Cardbey stores business identity records, not scraped content.
 * Only factual fields are ingested; unknown fields remain unknown.
 */

/** Source adapter label for provenance. */
export type IngestionSourceType =
  | 'csv'
  | 'google_sheet'
  | 'open_data_url'
  | 'registry_api'
  | 'licensed_feed'
  | 'partner_feed'
  | 'owner_submission'
  | 'places_discovery'
  | 'website_discovery';

/** Seed lifecycle states (Phase 5 + V1.1 QA). */
export type SeedVerificationStatus =
  | 'seeded_pending_qa'
  | 'seeded_claimable'
  | 'verified_owner'
  | 'active'
  | 'rejected'
  | 'duplicate';

/** Admin QA actions (V1.1). */
export type QaPromotionAction =
  | 'approve'
  | 'reject'
  | 'mark_duplicate'
  | 'merge'
  | 'send_back_to_review';

export interface QaAuditEntry {
  id: string;
  seedId: string;
  previousStatus: SeedVerificationStatus;
  nextStatus: SeedVerificationStatus;
  action: QaPromotionAction;
  reviewerId: string;
  timestamp: string;
  reason: string | null;
  /** Canonical seed when action is merge or mark_duplicate. */
  canonicalSeedId?: string | null;
}

export type QualityTier = 'high_quality' | 'medium_quality' | 'low_quality';

export type ResolutionStatus = 'unique' | 'possible_duplicate' | 'duplicate';

export interface QaQueueFilters {
  status?: SeedVerificationStatus;
  minQualityScore?: number;
  maxQualityScore?: number;
  sourceType?: IngestionSourceType;
  duplicateStatus?: ResolutionStatus;
  category?: string;
  city?: string;
  autoApprovalSuggested?: boolean;
  batchId?: string;
  campaignId?: string;
}

/** Common adapter output — raw facts as received from the source. */
export interface RawBusinessRecord {
  /** Stable id within this fetch batch (adapter-assigned or row index). */
  sourceRowId: string;
  sourceType: IngestionSourceType;
  sourceReference: string;
  fetchedAt: string;
  businessName: string | null;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  registrationNumber: string | null;
  email: string | null;
  operatingRegion: string | null;
  /** Raw row payload for audit (no reviews/ratings/UGC). */
  raw?: Record<string, unknown>;
}

/** Normalized business identity record (Phase 2). */
export interface NormalizedBusinessRecord {
  id: string;
  businessName: string | null;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  categoryConfidence: number;
  registrationNumber: string | null;
  email: string | null;
  operatingRegion: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  confidenceScore: number;
  sourceType: IngestionSourceType;
  sourceReference: string;
  sourceRowId: string;
  ingestedAt: string;
}

/** Entity resolution result (Phase 3). */
export interface EntityResolutionResult {
  record: NormalizedBusinessRecord;
  status: ResolutionStatus;
  matchEvidence: MatchEvidence[];
  matchedRecordId: string | null;
}

export interface MatchEvidence {
  field: string;
  signal: string;
  score: number;
}

/** Quality scoring output (Phase 4). */
export interface QualityAssessment {
  qualityScore: number;
  tier: QualityTier;
  factors: Record<string, number>;
}

/** Persisted seed business record with governance metadata. */
export interface IngestedSeedRecord {
  id: string;
  normalized: NormalizedBusinessRecord;
  resolution: ResolutionStatus;
  matchEvidence: MatchEvidence[];
  qualityScore: number;
  qualityTier: QualityTier;
  verificationStatus: SeedVerificationStatus;
  claimable: boolean;
  publicVisibility: 'limited' | 'full';
  ownerUserId: string | null;
  storeId: string | null;
  draftId: string | null;
  /** Set when this seed was merged into or marked duplicate of a canonical record. */
  canonicalSeedId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** First public discovery moment (QA approved / claimable). */
  firstSeenAt?: string | null;
  /** Owner began verification (first claim). */
  claimStartedAt?: string | null;
  /** Ownership proof verified. */
  verifiedAt?: string | null;
  /** Business Space created via runtime activation. */
  activatedAt?: string | null;
  /** Seed reached active / operating status. */
  operatingStartedAt?: string | null;
  /** claimStartedAt → verifiedAt */
  verificationDurationMs?: number | null;
  /** verifiedAt → activatedAt */
  activationDurationMs?: number | null;
  /** Pilot / campaign batch identifier (e.g. MELBOURNE_BATCH0_20260617). */
  batchId?: string | null;
  /** Discovery campaign identifier for funnel attribution. */
  campaignId?: string | null;
}

/** Batch-scoped pilot funnel metrics for Control Center. */
export interface PilotBatchMetrics {
  batchId: string;
  campaignId: string;
  discovered: number;
  pendingQa: number;
  claimable: number;
  reportViewed: number;
  verified: number;
  activated: number;
  operating: number;
  biSnapshots: number;
  seedSuitcases: number;
}

export interface QaQueueItem extends IngestedSeedRecord {
  autoApprovalSuggested: boolean;
  autoApprovalReasons: string[];
}

/** Seed store draft payload (Phase 6). */
export interface SeedStoreDraft {
  businessName: string;
  businessType: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  region: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  owner: null;
  claimable: true;
  publicVisibility: 'limited';
  provenance: 'ingestion_seed';
  sourceType: IngestionSourceType;
  sourceReference: string;
  sourceRowId: string;
  ingestedAt: string;
  qualityScore: number;
  confidenceScore: number;
  verificationStatus: SeedVerificationStatus;
  registrationNumber: string | null;
}

/** Pipeline run metrics (Phase 8). */
export interface IngestionRunMetrics {
  runId: string;
  sourceType: IngestionSourceType;
  sourceReference: string;
  startedAt: string;
  completedAt: string;
  recordsFetched: number;
  recordsNormalized: number;
  duplicatesRemoved: number;
  possibleDuplicates: number;
  uniqueRecords: number;
  /** Seed records written to ingestion storage (not Cardbey Business rows). */
  seedsCreated: number;
  /** Existing seeds updated with changed factual data. */
  seedsUpdated: number;
  /** Existing seeds unchanged — skipped re-write. */
  seedsSkippedExisting: number;
  /** Business/DraftStore rows persisted when persistStores=true. */
  businessStoresPersisted: number;
  qualityBreakdown: Record<QualityTier, number>;
  sourceBreakdown: Record<string, number>;
  claimRate: number;
  verificationRate: number;
}

export interface BusinessFeedAdapter {
  readonly sourceType: IngestionSourceType;
  readonly sourceReference: string;
  fetch(): Promise<RawBusinessRecord[]>;
}

/** V1.2 — ownership claim proof types. */
export type ClaimProofType = 'email' | 'phone' | 'website' | 'registration';

export type ClaimProofStatus = 'pending' | 'verified' | 'rejected';

export type ClaimRequestStatus =
  | 'pending'
  | 'otp_sent'
  | 'proof_submitted'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'duplicate_blocked'
  | 'activated';

export type ClaimLifecycleAction =
  | 'claim_started'
  | 'otp_sent'
  | 'proof_submitted'
  | 'proof_verified'
  | 'claim_rejected'
  | 'claim_expired'
  | 'seed_activated'
  | 'duplicate_blocked';

export interface IngestionClaimRequest {
  id: string;
  seedId: string;
  claimantUserId: string;
  proofType: ClaimProofType;
  proofContact: string | null;
  proofStatus: ClaimProofStatus;
  claimStatus: ClaimRequestStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  attempts: number;
  verifiedAt: string | null;
  rejectionReason: string | null;
  duplicateBlockedStoreId: string | null;
  claimStartedAt?: string | null;
  activatedAt?: string | null;
}

export interface ClaimAuditEntry {
  id: string;
  seedId: string;
  claimRequestId: string | null;
  action: ClaimLifecycleAction;
  actorId: string;
  previousStatus: string | null;
  nextStatus: string | null;
  reason: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  /** @deprecated use metadata */
  details?: Record<string, unknown> | null;
}

export interface PublicClaimPreview {
  seedId: string;
  businessName: string;
  city: string | null;
  category: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
  /** Normalized source confidence (0–1). */
  sourceConfidence: number | null;
  claimable: boolean;
  claimCtaPath: string;
}

export interface ClaimQueueMetrics {
  pendingClaims: number;
  verifiedClaims: number;
  rejectedClaims: number;
  duplicateBlocked: number;
  activatedSeeds: number;
  claimRate: number;
  verificationRate: number;
  activationRate: number;
  operatingConversionRate: number;
  averageVerificationDurationMs: number | null;
  averageActivationDurationMs: number | null;
  stalledActivationCount: number;
}

/** V2.2 — Business Enrichment Agent candidate (suggestions only; never auto-applied). */
export type EnrichmentPermissionType =
  | 'owner_website'
  | 'open_graph'
  | 'schema_org'
  | 'licensed_feed';

export type EnrichmentCandidateStatus = 'suggested' | 'accepted' | 'rejected';

export type EnrichmentCandidateField =
  | 'description'
  | 'hero_image'
  | 'logo'
  | 'category'
  | 'opening_hours'
  | 'social_links'
  | 'services';

export interface EnrichmentCandidate {
  id: string;
  seedId: string;
  field: EnrichmentCandidateField;
  value: string;
  sourceUrl: string;
  confidence: number;
  permissionType: EnrichmentPermissionType;
  status: EnrichmentCandidateStatus;
  createdAt: string;
  updatedAt: string;
  rejectedReason?: string | null;
}

export interface EnrichmentMetrics {
  candidatesFound: number;
  suggestedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  missingWebsiteCount: number;
  lowConfidenceProfileCount: number;
}

export interface PublicPreparedSuggestion {
  id: string;
  kind: EnrichmentCandidateField;
  label: string;
  displayValue: string;
  imageUrl?: string | null;
}

export interface PerformerEnrichmentHandoff {
  knownFacts: string[];
  suggestedImprovements: string[];
  missingFields: string[];
  recommendedFirstActions: string[];
  acceptedCandidateIds: string[];
}

/** Phase V3 — Business Intelligence Snapshot (rules-based, no LLM). */
export interface BusinessIntelligenceRecommendedAction {
  rank: number;
  label: string;
  /** Performer routing key — never auto-executed from BI layer. */
  proposedAction: string;
}

export interface BusinessIntelligenceSnapshot {
  snapshotId: string;
  seedId: string;
  createdAt: string;
  version: 'v1';
  visibilityScore: number;
  completenessScore: number;
  engagementReadinessScore: number;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  risks: string[];
  recommendedActions: BusinessIntelligenceRecommendedAction[];
  confidenceScore: number;
  summary: string;
}

/** Public-safe subset for activation page (no internal ids beyond seed). */
export interface PublicBusinessSnapshot {
  visibilityScore: number;
  completenessScore: number;
  engagementReadinessScore: number;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  recommendedActions: string[];
  summary: string;
  campaignMessage: string;
}

export interface ActivationNarrative {
  headline: string;
  body: string;
  ctaLabel: string;
  activationPath: string;
}

/** Pre-activation seed suitcase — no Business Space or owner required. */
export interface SeedSuitcase {
  seedId: string;
  createdAt: string;
  updatedAt: string;
  discoveryEvidence: {
    sourceType: IngestionSourceType;
    sourceReference: string;
    ingestedAt: string;
    matchEvidenceCount: number;
  };
  enrichmentCandidateIds: string[];
  biSnapshot: BusinessIntelligenceSnapshot | null;
  opportunityAnalysis: string[];
  activationNarrative: ActivationNarrative | null;
  reportViewedAt: string | null;
  reportViewCount: number;
  migratedToStoreId: string | null;
  migratedAt: string | null;
  /** Cached on last business-evolution read (V4). */
  lastEvolution?: SeedSuitcaseEvolutionCache | null;
}

/** Post-activation Performer briefing migrated from seed suitcase. */
export interface BusinessIntelligenceBriefing {
  openingLine: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  recommendedActions: string[];
  snapshotId: string;
  migratedFromSeedId: string;
}

export interface DiscoveryIntelligenceMetrics {
  snapshotsGenerated: number;
  activationReportViews: number;
  activationReportOpenRate: number | null;
  activationConversionAfterReportView: number | null;
  reportViewedSeeds: number;
  activatedAfterReportView: number;
  /** Phase V4 — Business Evolution aggregates */
  averageVisibilityImprovement: number | null;
  averageOpportunityCompletion: number | null;
  activatedBusinessesWithBiProgress: number;
  topUnresolvedOpportunityTypes: string[];
}

/** Phase V4 — per-store before/after evolution (read-only). */
export interface BusinessEvolutionScorecard {
  visibilityScore: number;
  completenessScore: number;
  engagementReadinessScore: number;
  distributionCoverage: number;
}

export interface BusinessEvolutionTimelineEvent {
  id: string;
  label: string;
  completed: boolean;
  completedAt: string | null;
  source: 'performer' | 'owner' | 'system';
}

export interface BusinessEvolutionOpportunity {
  label: string;
  resolved: boolean;
  proposedAction: string | null;
}

export interface BusinessEvolutionRecommendedAction {
  label: string;
  recommendationType: string;
  reason: string;
}

export interface BusinessEvolutionSnapshot {
  storeId: string;
  seedId: string | null;
  baselineCapturedAt: string | null;
  currentCapturedAt: string;
  hasBaseline: boolean;
  baseline: BusinessEvolutionScorecard;
  current: BusinessEvolutionScorecard;
  deltas: BusinessEvolutionScorecard;
  opportunityCompletion: { completed: number; total: number };
  timeline: BusinessEvolutionTimelineEvent[];
  resolvedOpportunities: string[];
  unresolvedOpportunities: BusinessEvolutionOpportunity[];
  recommendedNextActions: BusinessEvolutionRecommendedAction[];
}

export interface SeedSuitcaseEvolutionCache {
  capturedAt: string;
  visibilityDelta: number;
  opportunityCompleted: number;
  opportunityTotal: number;
  unresolvedOpportunityTypes: string[];
}
