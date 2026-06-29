/**
 * Melbourne Batch 001 — Performer-first real business onboarding (Melbourne West).
 * Batch 0 (MELBOURNE_BATCH0) remains for engineering validation; Batch 001 is separate.
 */

export const MELBOURNE_BATCH0_ID = 'MELBOURNE_BATCH0_20260617';
export const MELBOURNE_BATCH001_ID = 'MELBOURNE_BATCH001_20260627';
/** Real local business pilot — 25 businesses, Melbourne West suburbs */
export const MELBOURNE_BATCH001_REAL_LOCAL_ID = 'MELBOURNE_BATCH001_REAL_LOCAL';
export const MELBOURNE_BATCH001_CAMPAIGN_ID = 'cardbey-batch-001-melbourne-west';
export const REAL_LOCAL_PILOT_TARGET_COUNT = 25;

export const BATCH001_TARGET_COUNT = 100;

export const BATCH001_SUBURBS = [
  'Braybrook',
  'Sunshine',
  'Sunshine North',
  'St Albans',
  'Footscray',
] as const;

export type Batch001Suburb = (typeof BATCH001_SUBURBS)[number];

/** Priority industries for discovery targeting. */
export const BATCH001_PRIORITY_INDUSTRIES = [
  'cafe',
  'restaurant',
  'bakery',
  'hair_beauty',
  'grocery',
  'retail',
  'home_services',
] as const;

/** Real local pilot categories (Melbourne West). */
export const REAL_LOCAL_PILOT_CATEGORIES = [
  'Bakery',
  'Cafe',
  'Restaurant',
  'Nail salon',
  'Hair salon',
  'Grocery',
  'Local retail',
  'Home services',
] as const;

/** OSM / Google search keyword mapping per pilot category. */
export const REAL_LOCAL_CATEGORY_KEYWORDS: Record<string, string> = {
  Bakery: 'bakery',
  Cafe: 'cafe coffee',
  Restaurant: 'restaurant',
  'Nail salon': 'nail salon beauty',
  'Hair salon': 'hair salon hairdresser',
  Grocery: 'grocery supermarket',
  'Local retail': 'shop retail store',
  'Home services': 'plumber electrician home services',
};

export function isProtectedBatch0(batchId: string | null | undefined): boolean {
  if (!batchId) return false;
  return batchId.includes('BATCH0') && !batchId.includes('BATCH001');
}

export function isBatch001BatchId(batchId: string | null | undefined): boolean {
  if (!batchId) return false;
  return (
    batchId === MELBOURNE_BATCH001_ID ||
    batchId === MELBOURNE_BATCH001_REAL_LOCAL_ID ||
    batchId.startsWith('MELBOURNE_BATCH001')
  );
}

export function isRealLocalPilotBatch(batchId: string | null | undefined): boolean {
  return batchId === MELBOURNE_BATCH001_REAL_LOCAL_ID;
}

export function isPerformerFirstBatch(batchId: string | null | undefined): boolean {
  return isBatch001BatchId(batchId);
}
