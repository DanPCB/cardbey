/**
 * VideoSearchService
 *
 * Central registry of video source adapters. Fans a single query out to every
 * registered adapter, normalises each adapter's output to the shared
 * VideoResult schema, and merges the results.
 *
 * Resilience contract:
 *   - A source whose credentials are missing (VideoSourceNotConfiguredError)
 *     is silently skipped in merged results — a warning is logged, never thrown.
 *   - Any other per-adapter failure is caught and logged so one failing source
 *     can never break the others.
 */
import * as PexelsAdapter from './PexelsAdapter.js';
import * as PixabayAdapter from './PixabayAdapter.js';
import * as CoverrAdapter from './CoverrAdapter.js';
import * as MixkitAdapter from './MixkitAdapter.js';
import { VideoSourceNotConfiguredError } from './VideoResult.js';

/** Adapter registry, keyed by source name. */
export const adapters = {
  pexels: PexelsAdapter,
  pixabay: PixabayAdapter,
  coverr: CoverrAdapter,
  mixkit: MixkitAdapter,
};

/** @returns {string[]} All registered source keys. */
export function listSources() {
  return Object.keys(adapters);
}

/** @returns {string[]} Source keys whose credentials are configured. */
export function listConfiguredSources() {
  return Object.entries(adapters)
    .filter(([, adapter]) => {
      try {
        return adapter.isConfigured();
      } catch {
        return false;
      }
    })
    .map(([key]) => key);
}

/**
 * Search every registered source and merge the results.
 *
 * @param {string} query
 * @param {{ perPage?: number, sources?: string[] }} [opts]
 *   - perPage: max results per source (passed through to adapters)
 *   - sources: optional subset of source keys to query (defaults to all)
 * @returns {Promise<{
 *   results: Array<object>,
 *   bySource: Record<string, number>,
 *   skipped: string[],
 *   errors: Record<string, string>
 * }>}
 */
export async function searchAllSources(query, opts = {}) {
  const requested = Array.isArray(opts.sources) && opts.sources.length
    ? opts.sources.filter((s) => adapters[s])
    : listSources();

  const settled = await Promise.all(
    requested.map(async (key) => {
      const adapter = adapters[key];
      try {
        const items = await adapter.search(query, { perPage: opts.perPage });
        return { key, items: Array.isArray(items) ? items : [] };
      } catch (err) {
        if (err instanceof VideoSourceNotConfiguredError) {
          // Missing credentials: skip silently from merged output (warn only).
          console.warn(`[VideoSearchService] source "${key}" not configured — skipping`);
          return { key, skipped: true };
        }
        const message = err?.message || String(err);
        console.warn(`[VideoSearchService] source "${key}" failed: ${message}`);
        return { key, error: message };
      }
    })
  );

  const results = [];
  const bySource = {};
  const skipped = [];
  const errors = {};

  for (const outcome of settled) {
    if (outcome.skipped) {
      skipped.push(outcome.key);
      continue;
    }
    if (outcome.error) {
      errors[outcome.key] = outcome.error;
      continue;
    }
    bySource[outcome.key] = outcome.items.length;
    results.push(...outcome.items);
  }

  return { results, bySource, skipped, errors };
}

export default { adapters, listSources, listConfiguredSources, searchAllSources };
