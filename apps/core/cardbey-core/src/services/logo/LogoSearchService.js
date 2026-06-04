/**
 * LogoSearchService — central registry for logo source adapters.
 */
import * as ClearbitAdapter from './ClearbitAdapter.js';
import * as BrandfetchAdapter from './BrandfetchAdapter.js';
import { LogoSourceNotConfiguredError } from './LogoResult.js';

export const adapters = {
  clearbit: ClearbitAdapter,
  brandfetch: BrandfetchAdapter,
};

export function listSources() {
  return Object.keys(adapters);
}

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
 * @param {string} query
 * @param {{ sources?: string[] }} [opts]
 */
export async function searchAllSources(query, opts = {}) {
  const requested = Array.isArray(opts.sources) && opts.sources.length
    ? opts.sources.filter((s) => adapters[s])
    : listSources();

  const settled = await Promise.all(
    requested.map(async (key) => {
      const adapter = adapters[key];
      try {
        const items = await adapter.search(query);
        return { key, items: Array.isArray(items) ? items : [] };
      } catch (err) {
        if (err instanceof LogoSourceNotConfiguredError) {
          console.warn(`[LogoSearchService] source "${key}" not configured — skipping`);
          return { key, skipped: true };
        }
        const message = err?.message || String(err);
        console.warn(`[LogoSearchService] source "${key}" failed: ${message}`);
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
