/**
 * Discovery Engine V1 — canonical types.
 * BusinessCandidate is pre-seed; promotion yields IngestedSeedRecord via governed pipeline.
 */

export type DiscoveryProviderId =
  | 'osm'
  | 'csv'
  | 'referral'
  | 'manual'
  | 'government_register'
  | 'directory'
  | 'partner_import'
  | 'vision';

export type DiscoveryJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type IdentityDecision = 'unique' | 'review_required' | 'duplicate';

export interface SocialProfile {
  platform: string;
  url: string;
}

/** Raw discovery output — not yet a BusinessSeed. */
export interface BusinessCandidate {
  providerId: DiscoveryProviderId;
  externalId: string;
  businessName: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  socialProfiles: SocialProfile[];
  sourceUrl: string | null;
  discoveredAt: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface DiscoveryDiscoverParams {
  provider: DiscoveryProviderId;
  city?: string;
  category?: string;
  postcode?: string;
  limit?: number;
  bbox?: { south: number; west: number; north: number; east: number };
  /** CSV path or inline content */
  csvPath?: string;
  csvContent?: string;
  /** Referral / manual single-record fields */
  businessName?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  referredByUserId?: string;
  region?: string;
}

export interface ScoredCandidate extends BusinessCandidate {
  discoveryScore: number;
  identityScore: number | null;
  identityDecision: IdentityDecision;
}

export interface DiscoveryJob {
  id: string;
  provider: DiscoveryProviderId;
  region: string | null;
  category: string | null;
  status: DiscoveryJobStatus;
  recordsFound: number;
  recordsAccepted: number;
  recordsRejected: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  params: Record<string, unknown>;
}

export interface DiscoveryProvider {
  providerId: DiscoveryProviderId;
  discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]>;
}

export interface DiscoveryEngineRunResult {
  job: DiscoveryJob;
  candidatesFound: number;
  seedsCreated: number;
  seedsUpdated: number;
  duplicatesRejected: number;
  reviewRequired: number;
}

export interface DiscoveryCenterMetrics {
  candidatesFound: number;
  seedsPendingQa: number;
  claimable: number;
  verified: number;
  activated: number;
  funnel: {
    discovered: number;
    pendingQa: number;
    claimable: number;
    verified: number;
    activated: number;
    operating: number;
  };
  sourceBreakdown: Record<string, number>;
  regionBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  recentJobs: DiscoveryJob[];
}
