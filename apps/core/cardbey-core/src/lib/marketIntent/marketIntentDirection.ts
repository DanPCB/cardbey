import type { MarketIntentAnalysis } from './types.js';

/** True when signal is ordinary local customer acquisition without broader growth scope. */
export function isGenericLocalAcquisition(analysis: MarketIntentAnalysis): boolean {
  const primary = analysis.intents.primary;
  if (!primary || !['PROMOTE', 'SELL'].includes(primary)) return false;

  const expansionWants = new Set([
    'DISTRIBUTOR',
    'RESELLER',
    'PARTNER',
    'INVESTOR',
    'CAPITAL',
    'MARKET_ACCESS',
  ]);
  if (analysis.wants.some((w) => expansionWants.has(w.type))) return false;

  const expansionIntents = new Set(['DISTRIBUTE', 'EXPAND', 'PARTNER', 'LAUNCH', 'INVEST']);
  if (expansionIntents.has(primary)) return false;
  if (analysis.intents.secondary.some((s) => expansionIntents.has(s))) return false;

  const scopeText = [
    analysis.classificationReason ?? '',
    ...analysis.wants.map((w) => w.label),
    ...analysis.has.map((h) => h.label),
  ].join(' ');

  if (/\bnationwide\b|\btoàn quốc\b|\binternational\b|\bglobal\b|\bexport\b|\bexpan/i.test(scopeText)) {
    return false;
  }

  return true;
}

/** Buyer-side: seeking suppliers/manufacturers to source from (not selling distribution). */
export function isBuyerSideSourcingSignal(analysis: MarketIntentAnalysis): boolean {
  const text = [
    analysis.classificationReason ?? '',
    ...analysis.wants.map((w) => w.label),
    ...analysis.has.map((h) => h.label),
  ].join(' ').toLowerCase();

  return (
    /\bseeking\b.*\b(manufacturer|supplier|vendor)s?\b/i.test(text) ||
    /\blooking for\b.*\b(supplier|manufacturer|vendor)s?\b/i.test(text) ||
    /\bneeds?\b.*\b(raw material|supplier)s?\b/i.test(text) ||
    /\btìm\b.*\b(nhà cung cấp|nhà sản xuất)\b/i.test(text) ||
    (analysis.intents.primary === 'BUY' && analysis.wants.some((w) => w.type === 'SUPPLIER'))
  );
}

/** Distributor/buyer seeking upstream supply — not a seller seeking downstream channels. */
export function isBuyerSideDistributionSignal(analysis: MarketIntentAnalysis): boolean {
  const text = [
    analysis.classificationReason ?? '',
    ...analysis.wants.map((w) => w.label),
  ]
    .join(' ')
    .toLowerCase();

  return (
    /\bdistributor\b.*\bseeking\b.*\b(manufacturer|supplier)s?\b/i.test(text) ||
    /\bpackaging distributor seeking\b/i.test(text)
  );
}
