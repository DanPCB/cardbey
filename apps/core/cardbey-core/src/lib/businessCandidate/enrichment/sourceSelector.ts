/**
 * Confidence-gap source selection — skip expensive fetches when floor already met.
 */

import type { BusinessCandidateRecord } from '../types.js';
import { isDefaultOtherCategory } from './categoryMap.js';
import { isPlaceholderDescription, wordCount } from './htmlUtils.js';

export type EnrichmentGaps = {
  needsDescription: boolean;
  needsHero: boolean;
  needsFullName: boolean;
  needsCategory: boolean;
  needsHours: boolean;
};

export type SourceFetchPlan = {
  fetchOSM: boolean;
  fetchFoursquare: boolean;
  fetchFullName: boolean;
  fetchWikimedia: boolean;
  fetchFoursquarePhotos: boolean;
  /** Prefer skipping YP/True Local when Foursquare will cover description. */
  skipThinAggregators: boolean;
};

export function isBroaderEnrichmentSourcesEnabled(): boolean {
  const raw = process.env.ENRICHMENT_BROADER_SOURCES?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  return true;
}

export function isNameTruncated(
  name: string | null | undefined,
  rawSourceJson?: Record<string, unknown> | null,
): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  if (/[&,]\s*$/.test(n) || /\b(and|or)\s*$/i.test(n)) return true;
  const rawName =
    typeof rawSourceJson?.name === 'string'
      ? rawSourceJson.name.trim()
      : typeof rawSourceJson?.businessName === 'string'
        ? String(rawSourceJson.businessName).trim()
        : '';
  if (rawName && rawName.length > n.length + 3) return true;
  return false;
}

function looksClaimBoilerplate(desc: string | null | undefined): boolean {
  const t = String(desc ?? '');
  return /claim your profile|manage your storefront/i.test(t);
}

export function assessEnrichmentGaps(
  candidate: Pick<
    BusinessCandidateRecord,
    'description' | 'heroImageUrl' | 'name' | 'category' | 'openingHours' | 'rawSourceJson'
  >,
): EnrichmentGaps {
  const descWords = wordCount(candidate.description);
  return {
    needsDescription:
      descWords < 40 ||
      isPlaceholderDescription(candidate.description) ||
      looksClaimBoilerplate(candidate.description),
    needsHero: !candidate.heroImageUrl,
    needsFullName: isNameTruncated(candidate.name, candidate.rawSourceJson),
    needsCategory: isDefaultOtherCategory(candidate.category),
    needsHours: !candidate.openingHours,
  };
}

/**
 * Build fetch plan within remaining fetch budget (never schedules more than remaining).
 * Each true flag is intended as one fetch slot (FSQ venue + FSQ photos = 2).
 */
export function buildSourceFetchPlan(
  gaps: EnrichmentGaps,
  _hasWebsite: boolean,
  fetchBudgetRemaining: number,
): SourceFetchPlan {
  const plan: SourceFetchPlan = {
    fetchOSM: false,
    fetchFoursquare: false,
    fetchFullName: false,
    fetchWikimedia: false,
    fetchFoursquarePhotos: false,
    skipThinAggregators: false,
  };

  let remaining = Math.max(0, Math.floor(fetchBudgetRemaining));

  const take = (): boolean => {
    if (remaining < 1) return false;
    remaining -= 1;
    return true;
  };

  if ((gaps.needsDescription || gaps.needsCategory || gaps.needsHours) && take()) {
    plan.fetchOSM = true;
  }

  if ((gaps.needsDescription || gaps.needsCategory) && take()) {
    plan.fetchFoursquare = true;
    plan.skipThinAggregators = true;
  }

  if (gaps.needsHero && take()) {
    plan.fetchFoursquarePhotos = true;
  }

  if (gaps.needsFullName && take()) {
    plan.fetchFullName = true;
  }

  if (gaps.needsHero && !plan.fetchFoursquarePhotos && take()) {
    plan.fetchWikimedia = true;
  }

  return plan;
}

/** Count planned fetches for tests / logging. */
export function countPlannedFetches(plan: SourceFetchPlan): number {
  return (
    Number(plan.fetchOSM) +
    Number(plan.fetchFoursquare) +
    Number(plan.fetchFoursquarePhotos) +
    Number(plan.fetchFullName) +
    Number(plan.fetchWikimedia)
  );
}

/**
 * Split remaining fetch budget so Pexels hero ladder keeps reserved slots
 * when configured and hero is still needed.
 */
export function splitFetchBudgetForHeroReserve(
  remainingFetches: number,
  opts: {
    needsHero: boolean;
    pexelsConfigured: boolean;
    reserveSlots?: number;
  },
): { remainingForSources: number; heroReserve: number } {
  const remaining = Math.max(0, Math.floor(remainingFetches));
  const wantReserve =
    opts.needsHero && opts.pexelsConfigured
      ? Math.max(0, Math.floor(opts.reserveSlots ?? 2))
      : 0;
  const heroReserve = Math.min(wantReserve, remaining);
  return {
    heroReserve,
    remainingForSources: Math.max(0, remaining - heroReserve),
  };
}
