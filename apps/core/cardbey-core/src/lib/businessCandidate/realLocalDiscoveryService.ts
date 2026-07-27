/**
 * Real local business discovery — controlled pilot for Melbourne West.
 * Never creates Store. Optional dryRun. batchId required.
 */

import {
  BATCH001_SUBURBS,
  MELBOURNE_BATCH001_REAL_LOCAL_ID,
  REAL_LOCAL_PILOT_CATEGORIES,
  REAL_LOCAL_PILOT_TARGET_COUNT,
} from './batch001Config.js';
import { ingestDiscoveredCandidates } from './candidateIngestionPipeline.js';
import type { BusinessCandidateRecord, CandidateIngestionResult } from './types.js';
import type { BusinessCandidate as DiscoveryBusinessCandidate } from '../discoveryEngine/types/index.js';
import {
  discoveryProviderManager,
  type DiscoveryProviderMode,
} from '../discoveryEngine/providers/DiscoveryProviderManager.js';
import type { DiscoveryProviderError } from '../discoveryEngine/providers/discoveryProviderErrors.js';

export type RealLocalProviderMode = DiscoveryProviderMode;

export interface RealLocalDiscoveryParams {
  batchId: string;
  suburbs?: string[];
  categories?: string[];
  maxResults?: number;
  dryRun?: boolean;
  provider?: RealLocalProviderMode;
  slowMode?: boolean;
  retryRateLimited?: Array<{ suburb: string; category: string }>;
  createdBy?: string | null;
}

export interface RealLocalDiscoveryResult {
  batchId: string;
  dryRun: boolean;
  providerUsed: 'google_places' | 'osm';
  provider: 'google_places' | 'osm';
  status: 'success' | 'partial' | 'rate_limited' | 'failed';
  suburbsSearched: string[];
  categoriesSearched: string[];
  fetchLimit: number;
  candidatesFound: number;
  candidatesAccepted: number;
  duplicatesSkipped: number;
  /** @deprecated use providerErrors + technicalErrors */
  errors: string[];
  technicalErrors: string[];
  providerErrors: DiscoveryProviderError[];
  usedFallback: boolean;
  usedCache: boolean;
  rateLimitedSearches: number;
  rateLimitedCount: number;
  successfulSearches: number;
  skippedSearches: number;
  retryCount: number;
  overpassRequestCount: number;
  requestsPerMinute: number;
  rateLimitedCategories: Array<{ suburb: string; category: string }>;
  skippedCategories: string[];
  preview: Array<{
    name: string | null;
    category: string | null;
    suburb: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    placeId: string | null;
    sourceUrl: string | null;
  }>;
  accepted?: BusinessCandidateRecord[];
  ingestion?: CandidateIngestionResult;
}

function candidatePreview(c: DiscoveryBusinessCandidate) {
  const placeId =
    typeof c.metadata.placeId === 'string' ? c.metadata.placeId : c.externalId ?? null;
  const pilotCategory =
    typeof c.metadata.pilotCategory === 'string' ? c.metadata.pilotCategory : c.category;
  return {
    name: c.businessName,
    category: pilotCategory,
    suburb: c.city ?? (typeof c.metadata.suburb === 'string' ? c.metadata.suburb : null),
    address: c.address,
    phone: c.phone,
    website: c.website,
    placeId,
    sourceUrl: c.sourceUrl,
  };
}

export async function runRealLocalDiscovery(
  params: RealLocalDiscoveryParams,
): Promise<RealLocalDiscoveryResult> {
  const batchId = params.batchId?.trim();
  if (!batchId) {
    throw new Error('batchId is required');
  }
  if (batchId.includes('BATCH0') && !batchId.includes('BATCH001')) {
    throw new Error('Cannot overwrite Batch 0 — use MELBOURNE_BATCH001_REAL_LOCAL');
  }

  const suburbs = params.suburbs?.length ? params.suburbs : [...BATCH001_SUBURBS];
  const categories = params.categories?.length ? params.categories : [...REAL_LOCAL_PILOT_CATEGORIES];
  const maxResults = Math.min(
    Math.max(params.maxResults ?? REAL_LOCAL_PILOT_TARGET_COUNT, 1),
    100,
  );
  const dryRun = params.dryRun === true;

  const batch = await discoveryProviderManager.runBatch({
    suburbs,
    categories,
    maxResults,
    dryRun,
    provider: params.provider ?? 'auto',
    slowMode: params.slowMode === true,
    retryRateLimited: params.retryRateLimited,
  });

  const collected = batch.candidates;
  const preview = collected.map(candidatePreview);

  const baseResult: RealLocalDiscoveryResult = {
    batchId,
    dryRun,
    providerUsed: batch.provider,
    provider: batch.provider,
    status: batch.status,
    suburbsSearched: suburbs,
    categoriesSearched: categories,
    fetchLimit: maxResults,
    candidatesFound: collected.length,
    candidatesAccepted: 0,
    duplicatesSkipped: 0,
    errors: batch.technicalErrors,
    technicalErrors: batch.technicalErrors,
    providerErrors: batch.providerErrors,
    usedFallback: batch.usedFallback,
    usedCache: batch.usedCache,
    rateLimitedSearches: batch.rateLimitedSearches,
    rateLimitedCount: batch.rateLimitedCount,
    successfulSearches: batch.successfulSearches,
    skippedSearches: batch.skippedSearches,
    retryCount: batch.retryCount,
    overpassRequestCount: batch.overpassRequestCount,
    requestsPerMinute: batch.requestsPerMinute,
    rateLimitedCategories: batch.rateLimitedCategories,
    skippedCategories: batch.skippedCategories,
    preview,
  };

  if (dryRun) {
    return baseResult;
  }

  const ingestion = await ingestDiscoveredCandidates(collected, {
    batchId,
    campaignId: MELBOURNE_BATCH001_REAL_LOCAL_ID,
    createdBy: params.createdBy ?? null,
    createMission: false,
    initialStatus: 'PENDING_QA',
  });

  return {
    ...baseResult,
    candidatesAccepted: ingestion.accepted.length,
    duplicatesSkipped: ingestion.duplicatesRejected,
    accepted: ingestion.accepted,
    ingestion,
  };
}

export { MELBOURNE_BATCH001_REAL_LOCAL_ID, REAL_LOCAL_PILOT_TARGET_COUNT };
