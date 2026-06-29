/**
 * Performer-first BusinessCandidate — canonical pre-store entity for Batch 001+.
 * Discovery output is persisted here; StoreDraft is created only after Performer reasoning.
 */

import type { BusinessCandidate as DiscoveryBusinessCandidate } from '../discoveryEngine/types/index.js';

/** Canonical runtime lifecycle — single source of truth (CRM derives from this). */
export type BusinessCandidateStatus =
  | 'DISCOVERED'
  | 'FETCHING'
  | 'READY_FOR_REVIEW'
  | 'OWNER_CONTACTED'
  | 'STORE_DRAFT_READY'
  | 'OWNER_REVIEW'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'PENDING_QA'
  | 'QA_REJECTED'
  | 'CLAIMABLE'
  | 'CLAIM_PENDING'
  | 'VERIFIED'
  | 'DUPLICATE';

export type DiscoveredFromSource =
  | 'google'
  | 'website'
  | 'qr'
  | 'ocr'
  | 'facebook'
  | 'manual'
  | 'referral'
  | 'walk_in'
  | 'osm'
  | 'csv'
  | 'vision';

/** Runtime pipeline stages for operations dashboard (derived from status). */
export type OnboardingPipelineStage =
  | 'discovery'
  | 'reasoning'
  | 'store_draft'
  | 'owner_review'
  | 'published'
  | 'activated'
  | 'growing';

/** CRM overlay labels — never stored independently; derived from runtime status. */
export type CrmOverlayStage =
  | 'discovery'
  | 'contacted'
  | 'conversation_started'
  | 'store_draft_ready'
  | 'owner_reviewing'
  | 'published'
  | 'activated';

export type ContentSourceType =
  | 'ORIGINAL'
  | 'AI_GENERATED'
  | 'USER_UPLOADED'
  | 'WEBSITE'
  | 'OCR'
  | 'SOCIAL';

export type DemoReplacementStatus = 'pending' | 'replaced' | 'skipped';

export interface ContentProvenance {
  source: ContentSourceType;
  isDemo?: boolean;
  needsReplacement?: boolean;
  replacementStatus?: DemoReplacementStatus;
  demoReason?: string | null;
}

export interface FetchedAsset {
  url: string;
  provenance: ContentProvenance;
  label?: string | null;
}

export interface BusinessCandidateRecord {
  id: string;
  batchId: string;
  campaignId: string | null;
  name: string | null;
  businessType: string | null;
  address: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  socialLinks: Array<{ platform: string; url: string }>;
  coordinates: { lat: number; lng: number } | null;
  discoveredFrom: DiscoveredFromSource;
  confidenceScore: number;
  originalContent: Record<string, unknown>;
  fetchedImages: FetchedAsset[];
  fetchedMenu: Record<string, unknown> | null;
  fetchedServices: Array<Record<string, unknown>>;
  missingFields: string[];
  ownerMatched: boolean;
  ownerId: string | null;
  storeDraftId: string | null;
  storeId: string | null;
  missionId: string | null;
  /** Google place_id or equivalent external stable id */
  placeId: string | null;
  sourceUrl: string | null;
  rawSourceJson: Record<string, unknown> | null;
  /** Linked BusinessSeed after QA approval (claim flow) */
  seedId: string | null;
  status: BusinessCandidateStatus;
  dedupeKey: string;
  discoveryProviderId: string;
  externalId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessCandidateTransitionRecord {
  id: string;
  candidateId: string;
  fromStatus: BusinessCandidateStatus;
  toStatus: BusinessCandidateStatus;
  action: string;
  actorId: string;
  actorType: 'admin' | 'user' | 'system' | 'performer';
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Runtime onboarding event types (Runtime Authority audit contract). */
export type BusinessOnboardingRuntimeEventType =
  | 'business_discovered'
  | 'business_fetched'
  | 'website_scanned'
  | 'ocr_completed'
  | 'store_draft_created'
  | 'owner_contacted'
  | 'owner_replied'
  | 'demo_content_generated'
  | 'demo_content_replaced'
  | 'store_published'
  | 'store_activated'
  | 'first_customer'
  | 'weekly_active'
  | 'candidate_status_changed';

export interface CandidateIngestionResult {
  accepted: BusinessCandidateRecord[];
  duplicatesRejected: number;
  missionsCreated: number;
}

export interface BatchOnboardingMetrics {
  batchId: string;
  campaignId: string;
  targetCount: number;
  total: number;
  byStatus: Partial<Record<BusinessCandidateStatus, number>>;
  pipeline: Record<OnboardingPipelineStage, number>;
  crmOverlay: Record<CrmOverlayStage, number>;
  missingMenus: number;
  missingLogos: number;
  waitingOwnerReview: number;
  published: number;
  active: number;
  bySuburb: Record<string, number>;
  byBusinessType: Record<string, number>;
  completionPercent: number;
  /** Real pilot operational counts */
  discovered: number;
  duplicatesSkipped: number;
  pendingQa: number;
  qaApproved: number;
  claimable: number;
  claimed: number;
  verified: number;
  storeDraftReady: number;
  providerUsed: string | null;
  suburbsSearched: string[];
  categoriesSearched: string[];
  fetchLimit: number;
  errors: string[];
  /** Media + BI brief pilot metrics */
  candidatesWithMedia: number;
  candidatesWithBusinessSpecificMedia: number;
  candidatesUsingRepresentativeMedia: number;
  briefsGenerated: number;
  briefsDownloaded: number;
  claimIntentsStarted: number;
  claimIntentsFromBiDownload: number;
  claimConversionRate: number;
}

export type { DiscoveryBusinessCandidate };
