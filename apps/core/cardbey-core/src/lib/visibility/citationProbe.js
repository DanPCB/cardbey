/**
 * Citation probe — Phase 5 foundation (flag-gated, dry-run by default).
 *
 * Does NOT call external AI engines unless ENABLE_CITATION_PROBES_V1=true.
 * Does NOT claim AI visibility. Production SSR must be verified before live probes.
 */

import { Features } from '../../config/features.js';
import { buildSKPBySlug, skpToPublicDto } from '../storeKnowledge/index.js';

/**
 * @returns {boolean}
 */
export function isCitationProbesEnabled() {
  return Features.visibility?.citationProbesV1 === true;
}

/**
 * Build planned citation queries for a store (no network I/O).
 * @param {{ storeSlug: string, storeName?: string|null, suburb?: string|null }} input
 */
export function planCitationQueries(input = {}) {
  const slug = String(input.storeSlug || '').trim();
  const name = String(input.storeName || slug || '').trim();
  const suburb = String(input.suburb || '').trim();
  if (!slug && !name) return [];

  const queries = [
    `"${name}" Cardbey`,
    `"${name}" site:cardbey.com`,
    `cardbey.com/s/${slug}`,
  ];
  if (suburb) queries.push(`"${name}" ${suburb}`);
  return queries;
}

/**
 * Run a citation probe for a store slug.
 * Default: dry-run only (planned queries, zero citations logged).
 *
 * @param {{ storeSlug: string, dryRun?: boolean }} opts
 */
export async function runCitationProbe(opts = {}) {
  const storeSlug = String(opts.storeSlug || '').trim();
  const dryRun = opts.dryRun !== false; // default true
  const enabled = isCitationProbesEnabled();

  if (!storeSlug) {
    return { ok: false, skipped: true, reason: 'store_slug_required' };
  }

  if (!enabled && !dryRun) {
    return {
      ok: false,
      skipped: true,
      reason: 'citation_probes_disabled',
      message:
        'Set ENABLE_CITATION_PROBES_V1=true only after production SSR + attribution are verified.',
    };
  }

  let storeName = null;
  let suburb = null;
  let canonicalUrl = null;
  try {
    const skp = await buildSKPBySlug(storeSlug);
    if (skp) {
      const dto = skpToPublicDto(skp);
      storeName = dto?.name || null;
      suburb = dto?.suburb || null;
      canonicalUrl = dto?.canonicalUrl || null;
    }
  } catch (err) {
    console.warn('[citationProbe] SKP load failed', err?.message || err);
  }

  const plannedQueries = planCitationQueries({ storeSlug, storeName, suburb });

  // Live external probes are intentionally not implemented in this patch.
  // When ENABLE_CITATION_PROBES_V1 is on, still return dry-run structure until
  // an approved provider adapter is wired (avoids premature AI visibility claims).
  return {
    ok: true,
    dryRun: true,
    enabled,
    storeSlug,
    storeName,
    canonicalUrl,
    plannedQueries,
    citations: [],
    citationCount: 0,
    note:
      'Dry-run only. No external AI engines queried. Do not claim AI visibility until citations are logged and SSR is live in production.',
  };
}
