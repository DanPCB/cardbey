/**
 * DiscoveryProviderManager — provider order, throttling, cache, and batch metrics.
 */
import { isGooglePlacesConfigured } from '../../businessDiscovery/businessDiscoverySources.js';
import {
  inferPilotCategoryFromOsmTags,
  osmTagsForPilotCategories,
  REAL_LOCAL_CATEGORY_KEYWORDS,
} from '../../businessCandidate/batch001Config.js';
import type { BusinessCandidate as DiscoveryBusinessCandidate } from '../types/index.js';
import { getDiscoveryProviderConfig, requestsPerMinuteFromDelay } from '../config/discoveryProviderConfig.js';
import { readDiscoveryCache, writeDiscoveryCache } from './discoveryProviderCache.js';
import type { DiscoveryProviderError } from './discoveryProviderErrors.js';
import {
  DiscoveryProviderRateLimitError,
  isRateLimitError,
  toDiscoveryProviderError,
} from './discoveryProviderErrors.js';
import { logDiscoveryProviderEvent } from './discoveryProviderLogger.js';
import { googlePlacesDiscoveryProvider } from './GooglePlacesDiscoveryProvider.js';
import {
  osmDiscoveryProvider,
  registryBboxToOverpass,
} from './OsmDiscoveryProvider.js';

export type DiscoveryProviderMode = 'auto' | 'google_places' | 'osm';

export type DiscoveryBatchSearchResult = {
  provider: 'google_places' | 'osm';
  status: 'success' | 'partial' | 'rate_limited' | 'failed';
  fetchedCount: number;
  savedCount: number;
  duplicatesSkipped: number;
  rateLimitedCount: number;
  providerErrors: DiscoveryProviderError[];
  usedFallback: boolean;
  usedCache: boolean;
  retryCount: number;
  successfulSearches: number;
  skippedSearches: number;
  rateLimitedSearches: number;
  rateLimitedCategories: Array<{ suburb: string; category: string }>;
  skippedCategories: string[];
  overpassRequestCount: number;
  requestsPerMinute: number;
  candidates: DiscoveryBusinessCandidate[];
  technicalErrors: string[];
};

export type DiscoveryBatchParams = {
  suburbs: string[];
  categories: string[];
  maxResults: number;
  dryRun: boolean;
  provider?: DiscoveryProviderMode;
  slowMode?: boolean;
  retryRateLimited?: Array<{ suburb: string; category: string }>;
  /** Multi-market only — when unset, Melbourne pilot behaviour is unchanged. */
  countryCode?: string;
  regionCode?: string | null;
  /** Map display category label → Places search term */
  categorySearchTerms?: Record<string, string>;
  /** Prefer these OSM tags over pilot `osmTagsForPilotCategories` */
  osmTags?: string[];
  /** Market-registry bbox [minLng, minLat, maxLng, maxLat] */
  bbox?: [number, number, number, number] | null;
};

function resolvePrimaryProvider(mode: DiscoveryProviderMode): 'google_places' | 'osm' {
  if (mode === 'osm') return 'osm';
  if (mode === 'google_places') return 'google_places';
  return isGooglePlacesConfigured() ? 'google_places' : 'osm';
}

function candidateKey(row: DiscoveryBusinessCandidate, suburb: string): string {
  return [
    (row.businessName ?? '').toLowerCase(),
    row.city ?? suburb,
    row.metadata.placeId ?? row.externalId,
  ].join('|');
}

function annotateOsmCandidate(
  row: DiscoveryBusinessCandidate,
  suburb: string,
  pilotCategory: string | null,
): void {
  row.metadata = {
    ...row.metadata,
    suburb,
    pilotCategory: pilotCategory ?? row.metadata.pilotCategory ?? null,
  };
  if (!row.city) row.city = suburb;
}

export class DiscoveryProviderManager {
  async runBatch(params: DiscoveryBatchParams): Promise<DiscoveryBatchSearchResult> {
    const cfg = getDiscoveryProviderConfig();
    const providerRequested = params.provider ?? 'auto';
    let providerUsed = resolvePrimaryProvider(providerRequested);
    let usedFallback = false;
    let usedCache = false;
    let retryCount = 0;
    let overpassRequestCount = 0;

    const providerErrors: DiscoveryProviderError[] = [];
    const technicalErrors: string[] = [];
    const rateLimitedCategories: Array<{ suburb: string; category: string }> = [];
    const skippedCategories: string[] = [];
    const collected: DiscoveryBusinessCandidate[] = [];
    const seenKeys = new Set<string>();

    let successfulSearches = 0;
    let rateLimitedSearches = 0;
    let skippedSearches = 0;

    const retrySet = new Set(
      (params.retryRateLimited ?? []).map((r) => `${r.suburb}::${r.category}`),
    );
    const onlyRetry = retrySet.size > 0;

    const addCandidate = (row: DiscoveryBusinessCandidate, suburb: string) => {
      const key = candidateKey(row, suburb);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      collected.push(row);
      return true;
    };

    const runGoogleSuburbCategory = async (suburb: string, category: string, limit: number) => {
      const keyword =
        params.categorySearchTerms?.[category] ??
        REAL_LOCAL_CATEGORY_KEYWORDS[category] ??
        category;
      const batch = await googlePlacesDiscoveryProvider.discover({
        provider: 'google_places',
        city: suburb,
        category: keyword,
        limit,
        region: params.countryCode ? suburb : 'Melbourne VIC',
        countryCode: params.countryCode,
        regionCode: params.regionCode ?? null,
      });
      for (const row of batch) {
        row.metadata = { ...row.metadata, suburb, pilotCategory: category };
        addCandidate(row, suburb);
      }
      successfulSearches += 1;
      return batch.length;
    };

    const runOsmGroupedSuburb = async (suburb: string, categories: string[]) => {
      const perSuburbLimit = Math.min(50, params.maxResults - collected.length);
      if (perSuburbLimit <= 0) return;

      const tags =
        params.osmTags && params.osmTags.length > 0
          ? params.osmTags
          : osmTagsForPilotCategories(categories);

      const cacheInput = {
        provider: 'osm',
        suburb: params.countryCode ? `${params.countryCode}:${suburb}` : suburb,
        categoryGroup: categories,
        maxResults: perSuburbLimit,
        dryRun: params.dryRun,
      };

      const tryCache = async (): Promise<DiscoveryBusinessCandidate[] | null> => {
        const cached = await readDiscoveryCache(cacheInput);
        if (!cached) return null;
        usedCache = true;
        return cached.candidates;
      };

      const persistCache = async (rows: DiscoveryBusinessCandidate[]) => {
        if (rows.length > 0) {
          await writeDiscoveryCache(cacheInput, rows);
        }
      };

      try {
        overpassRequestCount += 1;
        const overpassBbox = params.bbox ? registryBboxToOverpass(params.bbox) : null;
        const { candidates: batch, retryCount: retries } = await osmDiscoveryProvider.discoverGrouped({
          city: suburb,
          tags,
          limit: perSuburbLimit,
          slowMode: params.slowMode,
          suburb,
          categories,
          bbox: overpassBbox,
          countryCode: params.countryCode ?? null,
        });
        retryCount += retries;

        for (const row of batch) {
          const osmTags = (row.metadata.osmTags as Record<string, string>) ?? {};
          const pilotCategory = inferPilotCategoryFromOsmTags(osmTags) ?? categories[0] ?? null;
          annotateOsmCandidate(row, suburb, pilotCategory);
          if (params.countryCode && !row.country) row.country = params.countryCode;
          if (params.regionCode && !row.state) row.state = params.regionCode;
          addCandidate(row, suburb);
        }

        await persistCache(batch);
        successfulSearches += 1;
      } catch (err) {
        if (isRateLimitError(err)) {
          rateLimitedSearches += 1;
          const structured = err.toStructured();
          providerErrors.push(structured);
          for (const category of categories) {
            rateLimitedCategories.push({ suburb, category });
            skippedCategories.push(category);
          }
          logDiscoveryProviderEvent('discovery_provider_rate_limited', structured);

          const cached = await tryCache();
          if (cached?.length) {
            for (const row of cached) {
              const osmTags = (row.metadata.osmTags as Record<string, string>) ?? {};
              const pilotCategory = inferPilotCategoryFromOsmTags(osmTags);
              annotateOsmCandidate(row, suburb, pilotCategory);
              row.metadata = { ...row.metadata, usedCache: true };
              addCandidate(row, suburb);
            }
            technicalErrors.push(
              `${suburb}: used cached OSM results after rate limit (${cached.length} businesses)`,
            );
          } else {
            technicalErrors.push(`${suburb}: ${structured.message}`);
          }
          return;
        }

        const structured = toDiscoveryProviderError(err, {
          provider: 'osm_overpass',
          suburb,
          categories,
        });
        providerErrors.push(structured);
        technicalErrors.push(`${suburb}: ${structured.message}`);
        skippedSearches += categories.length;
      }
    };

    const suburbsToSearch = params.suburbs;
    const categoriesToSearch = params.categories;

    if (providerUsed === 'google_places') {
      let googleWorked = false;
      for (const suburb of suburbsToSearch) {
        if (collected.length >= params.maxResults) break;
        for (const category of categoriesToSearch) {
          if (collected.length >= params.maxResults) break;
          if (onlyRetry && !retrySet.has(`${suburb}::${category}`)) continue;

          try {
            const fetched = await runGoogleSuburbCategory(
              suburb,
              category,
              Math.min(10, params.maxResults - collected.length),
            );
            if (fetched > 0) googleWorked = true;
          } catch (err) {
            const structured = toDiscoveryProviderError(err, {
              provider: 'google_places',
              suburb,
              category,
            });
            providerErrors.push(structured);
            technicalErrors.push(`${suburb}/${category}: ${structured.message}`);
            skippedSearches += 1;
          }
        }
      }

      if (!googleWorked && providerRequested === 'auto' && collected.length === 0) {
        providerUsed = 'osm';
        usedFallback = true;
        logDiscoveryProviderEvent('discovery_provider_fallback', {
          from: 'google_places',
          to: 'osm',
          reason: 'no_results_or_errors',
        });
      }
    }

    if (providerUsed === 'osm') {
      if (usedFallback) {
        /* already logged */
      }

      for (const suburb of suburbsToSearch) {
        if (collected.length >= params.maxResults) break;

        let suburbCategories = [...categoriesToSearch];
        if (onlyRetry) {
          suburbCategories = suburbCategories.filter((c) => retrySet.has(`${suburb}::${c}`));
          if (!suburbCategories.length) continue;
        }

        await runOsmGroupedSuburb(suburb, suburbCategories);
      }
    }

    const status: DiscoveryBatchSearchResult['status'] =
      rateLimitedSearches > 0 && collected.length > 0
        ? 'partial'
        : rateLimitedSearches > 0 && collected.length === 0
          ? 'rate_limited'
          : providerErrors.length > 0 && collected.length > 0
            ? 'partial'
            : providerErrors.length > 0
              ? 'failed'
              : 'success';

    if (status === 'partial') {
      logDiscoveryProviderEvent('discovery_batch_partial_success', {
        provider: providerUsed,
        fetchedCount: collected.length,
        rateLimitedSearches,
        providerErrorCount: providerErrors.length,
      });
    }

    return {
      provider: providerUsed,
      status,
      fetchedCount: collected.length,
      savedCount: 0,
      duplicatesSkipped: 0,
      rateLimitedCount: rateLimitedCategories.length,
      providerErrors,
      usedFallback,
      usedCache,
      retryCount,
      successfulSearches,
      skippedSearches,
      rateLimitedSearches,
      rateLimitedCategories,
      skippedCategories: [...new Set(skippedCategories)],
      overpassRequestCount,
      requestsPerMinute: requestsPerMinuteFromDelay(
        cfg.overpassRequestDelayMs,
        params.slowMode === true,
      ),
      candidates: collected.slice(0, params.maxResults),
      technicalErrors,
    };
  }
}

export const discoveryProviderManager = new DiscoveryProviderManager();
