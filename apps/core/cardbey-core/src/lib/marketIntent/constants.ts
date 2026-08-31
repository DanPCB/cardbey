export const MARKET_INTENT_ANALYZER_VERSION = 'g1.0.0';

export const MARKET_INTENT_FAMILIES = [
  'SELL',
  'BUY',
  'PROMOTE',
  'LAUNCH',
  'EXPAND',
  'PARTNER',
  'INVEST',
  'COLLABORATE',
  'HIRE',
  'SUPPLY',
  'DISTRIBUTE',
  'SOLVE_BUSINESS_PROBLEM',
  'OTHER_COMMERCIAL',
] as const;

export const HAS_CATEGORIES = [
  'PRODUCT',
  'SERVICE',
  'BUSINESS',
  'CAPABILITY',
  'ASSET',
  'CAPITAL',
  'LOCATION',
  'AUDIENCE',
  'KNOWLEDGE',
  'RELATIONSHIP',
  'OTHER',
] as const;

export const WANTS_CATEGORIES = [
  'CUSTOMER',
  'BUYER',
  'SUPPLIER',
  'PARTNER',
  'INVESTOR',
  'CAPITAL',
  'DISTRIBUTOR',
  'RESELLER',
  'EMPLOYEE',
  'COLLABORATOR',
  'MARKET_ACCESS',
  'PROMOTION',
  'GROWTH',
  'SOLUTION',
  'OTHER',
] as const;
