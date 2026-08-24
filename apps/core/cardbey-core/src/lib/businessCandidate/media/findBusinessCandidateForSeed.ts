/**
 * Resolve BusinessCandidate linked to a public seed.
 * Prefer seedId; fall back to placeId/externalId or name+suburb for Real Local
 * candidates that were never back-linked to a seed.
 */

import type { IngestedSeedRecord } from '../../businessIngestion/types.js';
import {
  getBusinessCandidateBySeedId,
  listBusinessCandidates,
} from '../candidateRepository.js';
import type { BusinessCandidateRecord } from '../types.js';

function norm(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function seedPlaceKeys(seed: IngestedSeedRecord): string[] {
  const keys = new Set<string>();
  const rowId = seed.normalized.sourceRowId?.trim();
  if (rowId) keys.add(rowId);
  const ref = seed.normalized.sourceReference?.trim();
  if (ref) {
    // Google place ids (ChIJ…) or other stable external ids in sourceReference
    if (/^ChIJ[\w-]+$/.test(ref) || ref.length >= 8) keys.add(ref);
  }
  return [...keys];
}

/**
 * Find the enrichment candidate for a public seed when seedId linkage is missing.
 */
export async function findBusinessCandidateForSeed(
  seed: IngestedSeedRecord,
): Promise<BusinessCandidateRecord | null> {
  const linked = await getBusinessCandidateBySeedId(seed.id);
  if (linked) return linked;

  const all = await listBusinessCandidates();
  if (!all.length) return null;

  const placeKeys = seedPlaceKeys(seed);
  if (placeKeys.length) {
    const byPlace = all.find(
      (c) =>
        (c.placeId && placeKeys.includes(c.placeId)) ||
        (c.externalId && placeKeys.includes(c.externalId)),
    );
    if (byPlace) return byPlace;
  }

  const name = norm(seed.normalized.businessName);
  if (!name) return null;
  const suburb = norm(seed.normalized.city);

  const byName = all.find((c) => {
    if (norm(c.name) !== name) return false;
    if (!suburb) return true;
    const cs = norm(c.suburb ?? c.city);
    return !cs || cs === suburb || cs.includes(suburb) || suburb.includes(cs);
  });
  return byName ?? null;
}
