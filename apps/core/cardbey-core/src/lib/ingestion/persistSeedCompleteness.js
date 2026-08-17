/**
 * Thin persistence wrapper around computeSeedCompleteness.
 */

import { computeSeedCompleteness } from './computeSeedCompleteness.js';
import { toSeedSnapshot } from './toSeedSnapshot.js';
import { getSeedRecordById, upsertSeedRecords } from '../businessIngestion/IngestionRepository.js';

export function completenessToSeedFields(result, checkedAt = new Date()) {
  return {
    completenessTier: result.tier,
    completenessScore: result.score,
    completenessBlockers: JSON.stringify(result.blockers),
    completenessGaps: JSON.stringify(result.gaps),
    completenessFieldReport: JSON.stringify(result.fieldReport ?? {}),
    completenessCheckedAt: checkedAt.toISOString(),
  };
}

export function parseCompletenessList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function parseCompletenessFieldReport(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function stampCompleteness(seed, result, checkedAt = new Date()) {
  return {
    ...seed,
    ...completenessToSeedFields(result, checkedAt),
    updatedAt: seed.updatedAt ?? checkedAt.toISOString(),
  };
}

export function scoreSeedRecord(seed) {
  return computeSeedCompleteness(toSeedSnapshot(seed));
}

/**
 * Recompute and persist completeness for one seed.
 * @param {string} seedId
 */
export async function persistSeedCompleteness(seedId) {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, seed: null, completeness: null, message: 'Seed not found.' };

  const previousChecked = seed.completenessCheckedAt ? Date.parse(seed.completenessCheckedAt) : 0;
  const checkedAt = new Date();
  if (Number.isFinite(previousChecked) && checkedAt.getTime() < previousChecked) {
    checkedAt.setTime(previousChecked);
  }

  const completeness = scoreSeedRecord(seed);
  const updated = stampCompleteness(seed, completeness, checkedAt);
  await upsertSeedRecords([updated]);
  return { ok: true, seed: updated, completeness, message: 'Completeness updated.' };
}

export function persistSeedCompletenessOnRecord(seed) {
  const completeness = scoreSeedRecord(seed);
  const updated = stampCompleteness(seed, completeness, new Date());
  return { seed: updated, completeness };
}
