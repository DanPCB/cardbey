/**
 * Normalise enrichment signals (Google Places types, rawSourceJson shapes) for taxonomy mapping.
 */

import type { BusinessCandidateRecord } from '../types.js';

function cleanTypeToken(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s || s === 'establishment' || s === 'point_of_interest') return null;
  return s.replace(/\s+/g, '_');
}

/**
 * Extract Google Places type tokens from persisted rawSourceJson.
 * Handles legacy rows that only stored the first type as `category` string.
 */
export function resolvePlacesTypesFromRawSource(
  raw: Record<string, unknown> | null | undefined,
): string[] | null {
  if (!raw || typeof raw !== 'object') return null;

  const collected: string[] = [];

  const pushMany = (values: unknown) => {
    if (!Array.isArray(values)) return;
    for (const value of values) {
      const token = cleanTypeToken(value);
      if (token && !collected.includes(token)) collected.push(token);
    }
  };

  pushMany(raw.types);
  pushMany(raw.placeTypes);
  pushMany(raw.googleTypes);

  if (typeof raw.type === 'string') {
    const token = cleanTypeToken(raw.type);
    if (token && !collected.includes(token)) collected.push(token);
  }

  if (!collected.length && typeof raw.category === 'string' && raw.category.trim()) {
    const token = cleanTypeToken(raw.category.replace(/\s+/g, '_'));
    if (token) collected.push(token);
  }

  return collected.length ? collected : null;
}

export function buildCategoryMappingInputFromCandidate(
  candidate: Pick<
    BusinessCandidateRecord,
    'name' | 'businessType' | 'category' | 'rawSourceJson' | 'originalContent'
  >,
): {
  businessName: string | null;
  businessType: string | null;
  placesTypes: string[] | null;
} {
  const raw =
    candidate.rawSourceJson ??
    (candidate.originalContent?.metadata &&
    typeof candidate.originalContent.metadata === 'object' &&
    (candidate.originalContent.metadata as Record<string, unknown>).rawSourceJson &&
    typeof (candidate.originalContent.metadata as Record<string, unknown>).rawSourceJson === 'object'
      ? ((candidate.originalContent.metadata as Record<string, unknown>).rawSourceJson as Record<
          string,
          unknown
        >)
      : null);

  return {
    businessName: candidate.name,
    businessType: candidate.businessType ?? candidate.category,
    placesTypes: resolvePlacesTypesFromRawSource(raw),
  };
}
