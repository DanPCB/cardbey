/**
 * Marketing inbox intent taxonomy.
 * USER_ACQUISITION intents are operational. INVESTOR_DISCOVERY intents are reserved.
 */

export const USER_ACQUISITION_INTENTS = Object.freeze([
  'GENERAL_INTEREST',
  'CREATE_BUSINESS',
  'SELL_PRODUCT',
  'SHOWCASE_SERVICE',
  'GLOBAL_LIVE_EOI',
  'SMART_PRODUCT',
  'MARKET_ENTRY',
  'SUPPLIER_PARTNERSHIP',
  'PARTNERSHIP',
  'SUPPORT',
  'NOT_RELEVANT',
  'UNKNOWN',
]);

export const INVESTOR_RESERVED_INTENTS = Object.freeze([
  'INVESTOR_INTEREST',
  'FUNDRAISING_QUERY',
  'VC',
  'ANGEL',
  'STRATEGIC_INVESTOR',
  'ACCELERATOR',
  'MEDIA_ANALYST',
  'NOT_INVESTOR',
]);

export const ALL_MARKETING_INTENTS = Object.freeze([
  ...USER_ACQUISITION_INTENTS,
  ...INVESTOR_RESERVED_INTENTS,
]);

const INTENT_SET = new Set(ALL_MARKETING_INTENTS);

export function isInvestorReservedIntent(intent) {
  return INVESTOR_RESERVED_INTENTS.includes(String(intent || ''));
}

export function isUserAcquisitionIntent(intent) {
  return USER_ACQUISITION_INTENTS.includes(String(intent || ''));
}

export function normalizeMarketingIntent(raw, { allowInvestor = false } = {}) {
  const key = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!INTENT_SET.has(key)) return 'UNKNOWN';
  if (isInvestorReservedIntent(key) && !allowInvestor) return 'NOT_RELEVANT';
  return key;
}

export const LOW_CONFIDENCE_THRESHOLD = 0.4;
