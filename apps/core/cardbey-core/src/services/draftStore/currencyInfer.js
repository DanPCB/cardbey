/**
 * Infer ISO 4217 currency from free-text location (suburb, address, region).
 * Returns null when there is no usable signal (caller may default e.g. AUD).
 * @param {string | null | undefined} text
 * @returns {string | null}
 */
export function inferCurrencyFromLocationText(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  if (/\b(vic|nsw|qld|wa|sa|tas|nt|act|australia|\bau\b)\b/.test(t)) return 'AUD';
  if (
    /\b(melbourne|sydney|brisbane|perth|adelaide|hobart|darwin|canberra|geelong|ballarat|bendigo|maribyrnong|fairfield|footscray|richmond|brunswick|carlton|st\s*kilda|parramatta|newcastle|wollongong|gold\s*coast|sunshine\s*coast|fremantle|hobart)\b/.test(
      t,
    )
  ) {
    return 'AUD';
  }
  // AU postcodes (4 digits) with suburb-like token nearby are a weak AUD signal when state absent.
  if (/\b\d{4}\b/.test(t) && /\b(st|street|rd|road|ave|avenue|dr|drive|parade|pde)\b/.test(t)) {
    return 'AUD';
  }
  if (/\bnz\b|new zealand/.test(t)) return 'NZD';
  if (/\buk\b|united kingdom|england|scotland|wales/.test(t)) return 'GBP';
  if (/\b(ca|canada)\b/.test(t)) return 'CAD';
  if (/\b(us|usa|united states|u\.s\.a\.)\b/.test(t)) return 'USD';
  return null;
}
