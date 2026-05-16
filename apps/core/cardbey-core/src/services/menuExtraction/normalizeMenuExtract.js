/**
 * Pure normalization for menu extraction (Phase 1). Used by extractMenuFromFile + unit tests.
 */

export const MAX_MENU_ITEMS = 50;
export const MIN_ITEM_CONFIDENCE = 0.4;

const ALLOWED_CURRENCIES = new Set(['AUD', 'VND', 'USD']);

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export function parseMenuPrice(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const s = v.replace(/[^\d.,-]/g, '').replace(',', '.');
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * @param {number} x
 * @returns {number}
 */
function clamp01(x) {
  if (!Number.isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
}

/**
 * Infer AUD vs USD vs VND from numeric prices and language hint.
 * @param {Array<{ price: number | null, currency?: string }>} items
 * @param {'en' | 'vi'} language
 */
export function inferCurrencyFromPrices(items, language) {
  const prices = items.map((i) => i.price).filter((p) => p != null && Number.isFinite(p));
  if (prices.length === 0) return language === 'vi' ? 'VND' : 'AUD';
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const allWhole = prices.every((p) => Math.abs(p - Math.round(p)) < 1e-6);
  if (language === 'vi' || (maxP >= 5000 && allWhole)) return 'VND';
  if (maxP < 100 && minP >= 0 && prices.some((p) => String(p).includes('.') || p % 1 !== 0)) {
    return 'AUD';
  }
  if (maxP < 100 && allWhole && maxP <= 99) return 'AUD';
  if (maxP >= 100 && maxP < 500 && allWhole) return 'USD';
  if (maxP >= 5000) return 'VND';
  return 'AUD';
}

/**
 * Apply currency to items that lack a valid ISO code; does not overwrite explicit AUD/VND/USD.
 * @param {Array<{ price: number | null, currency: string }>} items mutable
 * @param {'en' | 'vi'} language
 */
export function applyCurrencyInference(items, language) {
  const fallback = inferCurrencyFromPrices(items, language);
  for (const it of items) {
    const c = typeof it.currency === 'string' ? it.currency.trim().toUpperCase() : '';
    if (!ALLOWED_CURRENCIES.has(c)) {
      it.currency = fallback;
    }
  }
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {{
 *   name: string;
 *   price: number | null;
 *   currency: string;
 *   description: string;
 *   category: string;
 *   imageUrl: null;
 *   confidence: number;
 * } | null}
 */
function normalizeOneRawItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  const price = parseMenuPrice(raw.price);
  let currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : 'AUD';
  if (!ALLOWED_CURRENCIES.has(currency)) currency = 'AUD';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const category =
    typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'General';
  const confRaw = raw.confidence;
  const confidence =
    confRaw != null && Number.isFinite(Number(confRaw)) ? clamp01(Number(confRaw)) : 0.65;

  return {
    name,
    price,
    currency,
    description,
    category,
    imageUrl: null,
    confidence,
  };
}

/**
 * Filter by per-item confidence, cap count, sort by confidence desc, infer currency.
 * Items with price null are kept if they pass confidence.
 *
 * @param {unknown[]} rawItems
 * @param {{ language?: 'en' | 'vi' }} [options]
 * @returns {Array<{ name: string, price: number | null, currency: string, description: string, category: string, imageUrl: null, confidence: number }>}
 */
export function normalizeMenuExtractItems(rawItems, options = {}) {
  const language = options.language === 'vi' ? 'vi' : 'en';
  const list = [];
  if (!Array.isArray(rawItems)) return list;
  for (const r of rawItems) {
    const it = normalizeOneRawItem(r);
    if (!it) continue;
    if (it.confidence < MIN_ITEM_CONFIDENCE) continue;
    list.push(it);
  }
  list.sort((a, b) => b.confidence - a.confidence);
  const capped = list.slice(0, MAX_MENU_ITEMS);
  applyCurrencyInference(capped, language);
  return capped;
}

/**
 * @param {{ confidence: number }[]} items
 * @returns {number}
 */
export function averageConfidence(items) {
  if (!items.length) return 0;
  const sum = items.reduce((s, i) => s + i.confidence, 0);
  return Math.round((sum / items.length) * 1000) / 1000;
}
