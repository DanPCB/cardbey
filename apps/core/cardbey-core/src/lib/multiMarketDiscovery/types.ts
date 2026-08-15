/**
 * Multi-market discovery job contract — bounded territory/category batches only.
 */

import type { MarketCountryCode } from '../marketRegistry/types.js';

export type DiscoveryJobStatus =
  | 'prepared'
  | 'running'
  | 'success'
  | 'partial'
  | 'rate_limited'
  | 'failed'
  | 'cancelled';

export type DiscoveryProviderMode = 'auto' | 'google_places' | 'osm';

export interface DiscoveryJobFailureClass {
  code: string;
  count: number;
  sampleMessage?: string;
}

export interface MultiMarketDiscoveryJob {
  id: string;
  batchId: string;
  market: 'australia' | 'vietnam';
  countryCode: MarketCountryCode;
  regionCode: string | null;
  territoryId: string;
  locality: string | null;
  categoryId: string;
  searchTerms: string[];
  language: 'en' | 'vi';
  provider: DiscoveryProviderMode;
  providerCursor: string | null;
  campaignId: string | null;
  pilotId: string | null;
  dryRun: boolean;
  slowMode: boolean;
  requestedLimit: number;
  status: DiscoveryJobStatus;
  discoveredCount: number;
  acceptedCount: number;
  duplicatesSkipped: number;
  failureClasses: DiscoveryJobFailureClass[];
  estimatedQueryCount: number;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Optional provider query area */
  queryArea?: {
    bbox?: [number, number, number, number] | null;
    radiusM?: number | null;
  } | null;
  resultPreview?: Array<{
    name: string | null;
    category: string | null;
    locality: string | null;
    address: string | null;
  }>;
}

export interface PrepareDiscoveryJobInput {
  countryCode: MarketCountryCode;
  territoryId: string;
  categoryId: string;
  locality?: string | null;
  language?: 'en' | 'vi';
  provider?: DiscoveryProviderMode;
  dryRun?: boolean;
  slowMode?: boolean;
  requestedLimit?: number;
  campaignId?: string | null;
  pilotId?: string | null;
  createdBy?: string | null;
}

export interface RunDiscoveryJobInput extends PrepareDiscoveryJobInput {
  jobId?: string;
}
