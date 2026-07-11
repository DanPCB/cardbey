/**
 * Format display price with currency — no hardcoded USD symbol.
 */

/**
 * @param {string} currencyCode
 */
export function currencySymbol(currencyCode) {
  const code = String(currencyCode ?? 'AUD').toUpperCase();
  if (code === 'AUD' || code === 'USD' || code === 'NZD' || code === 'CAD') return '$';
  if (code === 'GBP') return '£';
  if (code === 'EUR') return '€';
  return '$';
}

/**
 * @param {object} item
 * @param {string} [currencyCode]
 */
export function formatServiceDisplayPrice(item, currencyCode = 'AUD') {
  const sym = currencySymbol(currencyCode);
  if (item.priceMode === 'free' || /\bfree\b/i.test(String(item.name ?? ''))) return 'Free';
  if (item.priceMode === 'quote_required' || item.pricingModel === 'custom') return 'Quote required';
  if (item.priceMode === 'hourly' && item.fromPrice != null) return `From ${sym}${item.fromPrice}/hr`;
  if (item.priceMode === 'starting_from' && item.fromPrice != null) {
    const unit = item.priceUnit === 'hour' ? '/hr' : item.priceUnit === 'project' ? '' : item.priceUnit ? `/${item.priceUnit}` : '';
    return `From ${sym}${item.fromPrice}${unit}`;
  }
  if (typeof item.price === 'number' && item.price > 0) return `${sym}${item.price.toFixed(2)}`;
  return 'Quote required';
}

/**
 * Infer booking mode from service name and blueprint hints.
 * @param {object} src
 */
export function inferServiceBookingMode(src) {
  const name = String(src.name ?? '').toLowerCase();
  if (/request quote|get a quote|custom quote/.test(name)) return 'quote_first';
  if (/free inspection|consultation/.test(name)) return 'request';
  if (/emergency|call-?out|urgent/.test(name)) return 'request';
  if (/picture hanging|furniture assembly|flat pack|tv wall|window cleaning|gutter cleaning|shelf installation/.test(name)) {
    return src.serviceMode === 'fixed_booking' ? 'instant' : 'request';
  }
  if (/door repair|fence repair|deck|tile|plaster|caulking|pressure washing|plumb|electric|cabinet/.test(name)) {
    return 'quote_first';
  }
  if (src.serviceMode === 'fixed_booking') return 'instant';
  if (src.serviceMode === 'quote_required') return 'quote_first';
  return 'request';
}

/**
 * @param {object} src
 * @param {{ hasPriceEvidence?: boolean }} [opts]
 */
export function inferServicePriceMode(src, opts = {}) {
  const name = String(src.name ?? '').toLowerCase();
  if (/free inspection|\bfree\b/.test(name) && !/\bfree\s+quote\b/.test(name)) return 'free';
  if (/request quote|get a quote/.test(name)) return 'quote_required';
  if (!opts.hasPriceEvidence) return 'quote_required';
  if (src.pricingModel === 'hourly' || src.priceUnit === 'hour') return 'hourly';
  if (src.fromPrice != null) return 'starting_from';
  if (typeof src.price === 'number') return 'fixed';
  return 'quote_required';
}

/**
 * @param {string} name
 */
export function classifyConversionAction(name) {
  const n = String(name ?? '').toLowerCase().trim();
  if (/^request quote|^get a quote|^custom quote/.test(n)) {
    return { recordType: 'conversion_action', transactionMode: 'quote', itemKind: 'service' };
  }
  if (/free inspection/.test(n)) {
    return { recordType: null, itemKind: 'service', priceMode: 'free', bookingMode: 'request' };
  }
  if (/emergency call-?out|urgent call/.test(n)) {
    return { recordType: null, itemKind: 'service', bookingMode: 'request', urgencySupported: true };
  }
  return null;
}
