/**
 * Real local business discovery — controlled pilot for Melbourne West.
 * Never creates Store. Optional dryRun. batchId required.
 */

import { isGooglePlacesConfigured } from '../businessDiscovery/businessDiscoverySources.js';
import { osmDiscoveryProvider } from '../discoveryEngine/providers/OsmDiscoveryProvider.js';
import { googlePlacesDiscoveryProvider } from '../discoveryEngine/providers/GooglePlacesDiscoveryProvider.js';
import type { BusinessCandidate as DiscoveryBusinessCandidate } from '../discoveryEngine/types/index.js';
import {
  BATCH001_SUBURBS,
  MELBOURNE_BATCH001_REAL_LOCAL_ID,
  REAL_LOCAL_CATEGORY_KEYWORDS,
  REAL_LOCAL_PILOT_CATEGORIES,
  REAL_LOCAL_PILOT_TARGET_COUNT,
} from './batch001Config.js';
import { ingestDiscoveredCandidates } from './candidateIngestionPipeline.js';
import type { BusinessCandidateRecord, CandidateIngestionResult } from './types.js';

export type RealLocalProviderMode = 'auto' | 'google_places' | 'osm';

export interface RealLocalDiscoveryParams {
  batchId: string;
  suburbs?: string[];
  categories?: string[];
  maxResults?: number;
  dryRun?: boolean;
  provider?: RealLocalProviderMode;
  createdBy?: string | null;
}

export interface RealLocalDiscoveryResult {
  batchId: string;
  dryRun: boolean;
  providerUsed: 'google_places' | 'osm';
  suburbsSearched: string[];
  categoriesSearched: string[];
  fetchLimit: number;
  candidatesFound: number;
  candidatesAccepted: number;
  duplicatesSkipped: number;
  errors: string[];
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

function resolveProvider(mode: RealLocalProviderMode): 'google_places' | 'osm' {
  if (mode === 'osm') return 'osm';
  if (mode === 'google_places') return 'google_places';
  return isGooglePlacesConfigured() ? 'google_places' : 'osm';
}

function candidatePreview(c: DiscoveryBusinessCandidate) {
  const placeId =
    typeof c.metadata.placeId === 'string' ? c.metadata.placeId : c.externalId ?? null;
  return {
    name: c.businessName,
    category: c.category,
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
  const providerUsed = resolveProvider(params.provider ?? 'auto');

  const errors: string[] = [];
  const collected: DiscoveryBusinessCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const suburb of suburbs) {
    if (collected.length >= maxResults) break;
    for (const category of categories) {
      if (collected.length >= maxResults) break;
      const keyword = REAL_LOCAL_CATEGORY_KEYWORDS[category] ?? category;
      const perQueryLimit = Math.min(10, maxResults - collected.length);

      try {
        let batch: DiscoveryBusinessCandidate[] = [];
        if (providerUsed === 'google_places') {
          batch = await googlePlacesDiscoveryProvider.discover({
            provider: 'google_places',
            city: suburb,
            category: keyword,
            limit: perQueryLimit,
            region: 'Melbourne VIC',
          });
        } else {
          batch = await osmDiscoveryProvider.discover({
            provider: 'osm',
            city: suburb,
            category: keyword.split(' ')[0],
            limit: perQueryLimit,
            region: 'Melbourne VIC',
          });
          for (const row of batch) {
            row.metadata = { ...row.metadata, suburb, pilotCategory: category };
            if (!row.city) row.city = suburb;
          }
        }

        for (const row of batch) {
          const key = [
            (row.businessName ?? '').toLowerCase(),
            row.city ?? suburb,
            row.metadata.placeId ?? row.externalId,
          ].join('|');
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          collected.push(row);
          if (collected.length >= maxResults) break;
        }
      } catch (err: unknown) {
        errors.push(
          `${suburb}/${category}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const preview = collected.map(candidatePreview);

  if (dryRun) {
    return {
      batchId,
      dryRun: true,
      providerUsed,
      suburbsSearched: suburbs,
      categoriesSearched: categories,
      fetchLimit: maxResults,
      candidatesFound: collected.length,
      candidatesAccepted: 0,
      duplicatesSkipped: 0,
      errors,
      preview,
    };
  }

  const ingestion = await ingestDiscoveredCandidates(collected, {
    batchId,
    campaignId: MELBOURNE_BATCH001_REAL_LOCAL_ID,
    createdBy: params.createdBy ?? null,
    createMission: false,
    initialStatus: 'PENDING_QA',
  });

  return {
    batchId,
    dryRun: false,
    providerUsed,
    suburbsSearched: suburbs,
    categoriesSearched: categories,
    fetchLimit: maxResults,
    candidatesFound: collected.length,
    candidatesAccepted: ingestion.accepted.length,
    duplicatesSkipped: ingestion.duplicatesRejected,
    errors,
    preview,
    accepted: ingestion.accepted,
    ingestion,
  };
}

export { MELBOURNE_BATCH001_REAL_LOCAL_ID, REAL_LOCAL_PILOT_TARGET_COUNT };
