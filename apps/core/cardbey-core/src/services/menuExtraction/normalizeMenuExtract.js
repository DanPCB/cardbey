/**
 * Pure normalization for menu extraction (Phase 1). Used by extractMenuFromFile + unit tests.
 */

import { CATALOG_IMPORT_SAFETY_CEILING } from '../../config/catalogLimits.js';

/** Safety ceiling for a single extract pass — not a “menu is only N items” product rule. */
export const MAX_MENU_ITEMS = CATALOG_IMPORT_SAFETY_CEILING;
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
/** Common LLM default when it cannot read prices — treat as missing. */
const SUSPICIOUS_UNIFORM_PRICE_DEFAULTS = new Set([15, 49.99, 79.99, 19.99]);

/**
 * @param {Array<{ price: number | null }>} items
 * @returns {{ priceWarning: boolean; uniformPrice: number | null }}
 */
export function detectSuspiciousUniformPrices(items) {
  if (!Array.isArray(items) || items.length <= 3) {
    return { priceWarning: false, uniformPrice: null };
  }
  const prices = items.map((i) => i.price).filter((p) => p != null && Number.isFinite(p));
  if (prices.length <= 3) return { priceWarning: false, uniformPrice: null };
  const first = prices[0];
  const allSame = prices.every((p) => Math.abs(p - first) < 1e-6);
  const suspicious =
    allSame &&
    (SUSPICIOUS_UNIFORM_PRICE_DEFAULTS.has(first) || prices.length >= 8);
  if (suspicious) {
    console.warn('[menu-extract] suspicious: all items have same price', first, {
      itemCount: items.length,
    });
  }
  return { priceWarning: suspicious, uniformPrice: allSame ? first : null };
}

function normalizeOneRawItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  let price = parseMenuPrice(raw.price);
  if (price == null && raw.priceDisplay != null) {
    price = parseMenuPrice(raw.priceDisplay);
  }
  if (price == null && raw.priceText != null) {
    price = parseMenuPrice(raw.priceText);
  }
  let currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : 'AUD';
  if (!ALLOWED_CURRENCIES.has(currency)) currency = 'AUD';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  // Prefer explicit category / categoryPath; do not invent "General" (collapses real menus).
  const categoryPath = Array.isArray(raw.categoryPath)
    ? raw.categoryPath.map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  let category =
    typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : '';
  if ((!category || /^general$/i.test(category)) && categoryPath.length) {
    category = categoryPath[categoryPath.length - 1];
  }
  if (!category && typeof raw.section === 'string' && raw.section.trim()) {
    category = raw.section.trim();
  }
  if (!category && typeof raw.parentCategory === 'string' && raw.parentCategory.trim()) {
    category = raw.parentCategory.trim();
  }
  const confRaw = raw.confidence;
  const confidence =
    confRaw != null && Number.isFinite(Number(confRaw)) ? clamp01(Number(confRaw)) : 0.65;

  const durationRaw = raw.durationMinutes ?? raw.duration;
  const durationMinutes =
    durationRaw != null && Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : null;
  const inclusions = Array.isArray(raw.inclusions)
    ? raw.inclusions.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
    : [];
  const addOns = Array.isArray(raw.addOns)
    ? raw.addOns
        .filter((a) => a && typeof a === 'object' && typeof a.name === 'string')
        .map((a) => ({
          name: String(a.name).trim(),
          price: parseMenuPrice(a.price ?? a.priceText ?? a.priceDisplay),
          priceText:
            typeof a.priceText === 'string'
              ? a.priceText.trim()
              : typeof a.priceDisplay === 'string'
                ? a.priceDisplay.trim()
                : null,
        }))
        .filter((a) => a.name)
    : [];
  const options = Array.isArray(raw.options)
    ? raw.options
        .filter((o) => o && typeof o === 'object')
        .map((o) => normalizeOptionRow(o))
        .filter(Boolean)
    : [];

  // Duration×price tables often omit a top-level price — use the lowest option.
  if (price == null && options.length) {
    const optionPrices = options
      .map((o) => o.price)
      .filter((p) => p != null && Number.isFinite(p));
    if (optionPrices.length) price = Math.min(...optionPrices);
  }

  return {
    name,
    price,
    currency,
    description,
    category: category || '',
    ...(categoryPath.length ? { categoryPath } : {}),
    imageUrl: null,
    confidence,
    ...(durationMinutes != null ? { durationMinutes } : {}),
    ...(inclusions.length ? { inclusions } : {}),
    ...(addOns.length ? { addOns } : {}),
    ...(options.length ? { options } : {}),
  };
}

/**
 * @param {object} raw
 * @returns {{ label: string, durationMinutes: number | null, price: number | null, priceText: string | null } | null}
 */
function normalizeOptionRow(raw) {
  const durationRaw = raw.durationMinutes ?? raw.duration ?? raw.mins;
  let durationMinutes =
    durationRaw != null && Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : null;
  if (durationMinutes == null && typeof raw.label === 'string') {
    const m = raw.label.match(/(\d+)\s*(?:min|mins|minutes)?/i);
    if (m) durationMinutes = Number(m[1]);
  }
  let price = parseMenuPrice(raw.price);
  if (price == null) price = parseMenuPrice(raw.priceText ?? raw.priceDisplay);
  const priceText =
    typeof raw.priceText === 'string' && raw.priceText.trim()
      ? raw.priceText.trim()
      : typeof raw.priceDisplay === 'string' && raw.priceDisplay.trim()
        ? raw.priceDisplay.trim()
        : price != null
          ? `$${price}`
          : null;
  const label =
    (typeof raw.label === 'string' && raw.label.trim()) ||
    (typeof raw.name === 'string' && raw.name.trim()) ||
    (durationMinutes != null ? `${durationMinutes} Mins` : '') ||
    (priceText || '');
  if (!label && price == null && durationMinutes == null) return null;
  return {
    label: label || (price != null ? `$${price}` : 'Option'),
    durationMinutes,
    price,
    priceText,
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
