/**
 * Extract services, menu items, and products from business facts + raw sources.
 */

import { inferServiceMode, normalizeServiceCatalogItem } from '../catalog/serviceCatalogNormalizer.js';
import { CATALOG_IMPORT_SAFETY_CEILING } from '../../config/catalogLimits.js';
import { summarizeDescription } from './researchSafety.js';

const PRICE_RE = /(?:AUD|USD|\$)\s*(\d+(?:\.\d{2})?)|(\d+(?:\.\d{2})?)\s*(?:AUD|USD)/i;
const DURATION_RE = /(\d+)\s*(?:min|mins|minutes|hr|hour|hours)/i;

const FOOD_RE = /\b(restaurant|cafe|coffee|bakery|menu|pizza|burger|pasta|meal|dining)\b/i;
const RETAIL_RE = /\b(retail|shop|store|boutique|merchandise|product|florist|flowers?|floral|blooms?|bouquets?|gift)\b/i;
const QUOTE_RE = /\b(til(e|ing)|floor(ing)?|renovation|plumb|electric|paint|construct|waterproof)\b/i;
const BOOKING_RE = /\b(nail|spa|salon|manicure|pedicure|massage|facial|wax|haircut|beauty)\b/i;

/**
 * @param {import('./types.js').BusinessFacts} facts
 * @param {import('./types.js').SourceMatchResult[]} matchedSources
 * @param {import('./types.js').StoreCreationResearchInput} input
 */
export function extractServiceMenuCatalog(facts, matchedSources, input) {
  const corpus = [
    input.businessName,
    input.category,
    facts.category?.value,
    facts.description?.value,
  ]
    .filter(Boolean)
    .join(' ');

  const businessKind = classifyBusinessKind(corpus);
  const items = [];

  for (const match of matchedSources) {
    const raw = match.source.raw ?? {};
    const fromOffers = extractItemsFromOffers(raw, match, businessKind);
    items.push(...fromOffers);
    const fromOcr = extractItemsFromOcr(raw.ocrText, match, businessKind);
    items.push(...fromOcr);
  }

  const deduped = dedupeItems(items);
  const classified = deduped.map((item) => classifyCatalogItem(item, businessKind, corpus));

  if (businessKind === 'food_menu') {
    facts.menuItems = classified;
  } else if (businessKind === 'product_retail') {
    facts.products = classified;
  } else {
    facts.services = classified;
  }

  return { items: classified, businessKind };
}

function classifyBusinessKind(corpus) {
  const c = String(corpus ?? '').toLowerCase();
  if (FOOD_RE.test(c)) return 'food_menu';
  if (RETAIL_RE.test(c) && !QUOTE_RE.test(c) && !BOOKING_RE.test(c)) return 'product_retail';
  if (QUOTE_RE.test(c)) return 'service_quote_required';
  if (BOOKING_RE.test(c)) return 'service_fixed_booking';
  return 'service_fixed_booking';
}

function extractItemsFromOffers(raw, match, businessKind) {
  const offers = Array.isArray(raw.offers) ? raw.offers : Array.isArray(raw.hasOfferCatalog?.itemListElement) ? raw.hasOfferCatalog.itemListElement : [];
  const out = [];
  for (const offer of offers) {
    const item = offer?.itemOffered ?? offer;
    const name = cleanName(item?.name ?? offer?.name);
    if (!name) continue;
    const categoryPath = Array.isArray(item?.categoryPath)
      ? item.categoryPath.map((p) => String(p ?? '').trim()).filter(Boolean)
      : Array.isArray(offer?.categoryPath)
        ? offer.categoryPath.map((p) => String(p ?? '').trim()).filter(Boolean)
        : [];
    let category = cleanName(item?.category ?? offer?.category);
    if ((!category || /^general$/i.test(category)) && categoryPath.length) {
      category = categoryPath[categoryPath.length - 1];
    }
    out.push({
      name,
      description: summarizeDescription(item?.description ?? offer?.description ?? ''),
      price: parsePrice(item?.price ?? offer?.price),
      durationMinutes: parseDuration(item?.durationMinutes ?? offer?.durationMinutes ?? ''),
      category,
      ...(categoryPath.length ? { categoryPath } : category ? { categoryPath: [category] } : {}),
      sourceUrl: match.source.sourceUrl ?? undefined,
      sourceType: match.source.sourceType,
      confidence: match.confidence,
      needsOwnerReview: match.confidence < 0.55,
      contentOrigin: 'sourced',
      businessKind,
    });
  }
  return out;
}

function extractItemsFromOcr(ocrText, match, businessKind) {
  if (!ocrText || typeof ocrText !== 'string') return [];
  const lines = ocrText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  let currentCategory = '';
  for (const line of lines) {
    if (line.length < 2 || line.length > 80) continue;
    if (/^(phone|email|www|http|tel|fax|abn)/i.test(line)) continue;
    const price = parsePrice(line);
    const duration = parseDuration(line);
    const name = line.replace(PRICE_RE, '').replace(DURATION_RE, '').trim();
    if (!name || name.length < 2) continue;

    // Conservative section heading: no price/duration, short, no digits.
    const looksLikeHeading =
      price == null &&
      duration == null &&
      name.length >= 3 &&
      name.length <= 40 &&
      !/[,.;:!?$]/.test(name) &&
      !/\d/.test(name) &&
      /^[\p{L}][\p{L}\s'’/-]*$/u.test(name);
    if (looksLikeHeading) {
      currentCategory = name;
      continue;
    }
    if (!/[\p{L}]/u.test(name) || name.length < 3) continue;

    out.push({
      name,
      price,
      durationMinutes: duration,
      ...(currentCategory
        ? { category: currentCategory, categoryPath: [currentCategory] }
        : {}),
      sourceType: 'uploaded_document',
      confidence: Math.min(0.65, match.confidence),
      needsOwnerReview: true,
      businessKind,
    });
  }
  return out.slice(0, CATALOG_IMPORT_SAFETY_CEILING);
}

function classifyCatalogItem(item, businessKind, corpus) {
  const path = Array.isArray(item.categoryPath)
    ? item.categoryPath.map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  const leaveCategory = (fallback) => {
    if (item.category && !/^general$/i.test(String(item.category))) return item.category;
    if (path.length) return path[path.length - 1];
    return fallback;
  };

  if (businessKind === 'food_menu') {
    const category = leaveCategory('Menu');
    return {
      ...item,
      serviceMode: undefined,
      executionAction: 'add_to_cart',
      category,
      ...(path.length ? { categoryPath: path } : category ? { categoryPath: [category] } : {}),
    };
  }
  if (businessKind === 'product_retail') {
    const category = leaveCategory('Products');
    return {
      ...item,
      executionAction: 'add_to_cart',
      category,
      ...(path.length ? { categoryPath: path } : category ? { categoryPath: [category] } : {}),
    };
  }

  const mode =
    businessKind === 'service_quote_required'
      ? QUOTE_RE.test(`${item.name} ${item.category ?? ''}`)
        ? 'quote_required'
        : inferServiceMode(item, { businessType: businessKind, businessName: corpus }) ?? 'quote_required'
      : inferServiceMode(item, { businessType: businessKind, businessName: corpus }) ?? 'fixed_booking';

  const executionAction = mode === 'quote_required' ? 'request_quote' : 'book';
  const category = leaveCategory('Services');
  return {
    ...item,
    serviceMode: mode,
    executionAction,
    category,
    ...(path.length ? { categoryPath: path } : category ? { categoryPath: [category] } : {}),
    needsOwnerReview: item.needsOwnerReview || item.price == null,
  };
}

function parsePrice(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value);
  const m = s.match(PRICE_RE);
  if (!m) {
    const n = Number(s.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) ? n : null;
}

function parseDuration(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const m = String(value ?? '').match(DURATION_RE);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return /hr|hour/i.test(String(value)) ? n * 60 : n;
}

function cleanName(value) {
  const s = String(value ?? '').trim();
  return s.length >= 2 ? s : null;
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const name = String(item.name ?? '').toLowerCase().trim();
    if (!name) continue;
    const path = Array.isArray(item.categoryPath) && item.categoryPath.length
      ? item.categoryPath.map((p) => String(p ?? '').toLowerCase().trim()).filter(Boolean).join('>')
      : String(item.category ?? '').toLowerCase().trim();
    const key = `${path}::${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export { classifyBusinessKind };
