import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { MarketEntityKind } from './entityTypes.js';

/**
 * Classify entity kind from G1 analysis — no deep resolution, conservative.
 */
export function inferMarketEntityKind(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
): MarketEntityKind {
  if (analysis.classification === 'NON_COMMERCIAL') {
    return 'UNKNOWN';
  }

  const text = signal.rawText.toLowerCase();
  const primary = analysis.intents.primary;

  const hasAssetVehicle = analysis.has.some(
    (h) =>
      h.type === 'ASSET' &&
      /vehicle|car|toyota|camry|xe|ô tô|motor/i.test(h.label),
  );
  if (
    primary === 'SELL' &&
    (hasAssetVehicle || /used toyota|selling my|bán xe|low kms/i.test(text))
  ) {
    return 'PERSON';
  }

  if (
    primary === 'INVEST' &&
    /land|600m2|bất động sản|m2\b/i.test(text) &&
    !analysis.businessHint
  ) {
    return 'PERSON';
  }

  if (
    primary === 'COLLABORATE' &&
    (/co-founder|co founder|đồng sáng lập|đồng đội|myfit/i.test(text) ||
      analysis.businessHint?.toLowerCase().includes('myfit'))
  ) {
    return 'PROJECT';
  }

  if (analysis.businessHint || analysis.has.some((h) => h.type === 'BUSINESS')) {
    return 'BUSINESS';
  }

  if (
    primary &&
    ['DISTRIBUTE', 'EXPAND', 'PARTNER', 'LAUNCH', 'PROMOTE', 'HIRE', 'SUPPLY'].includes(primary)
  ) {
    return 'BUSINESS';
  }

  if (
    analysis.has.some((h) => h.type === 'PRODUCT') &&
    !analysis.has.some((h) => h.type === 'BUSINESS')
  ) {
    return 'PRODUCT_BRAND';
  }

  if (/my business|doanh nghiệp của tôi|công ty của tôi/i.test(text) && !analysis.businessHint) {
    return 'UNKNOWN';
  }

  if (analysis.actorHint?.toLowerCase().includes('individual')) {
    return 'PERSON';
  }

  return 'UNKNOWN';
}

export function isBusinessResearchApplicable(entityKind: MarketEntityKind): boolean {
  return entityKind === 'BUSINESS';
}
