/**
 * Source-preserving Menu Document.
 *
 * Organizes merged menu-import extraction into the menu's real shape — sections
 * (headings) → offerings, with duration variants, add-ons, inclusions, price
 * text, confidence, and source evidence preserved. This is the "read the menu
 * as it is" model that sits alongside (not instead of) the flat catalog list.
 *
 * Pure + deterministic: no I/O, no mutation of inputs.
 */

const MENU_DOCUMENT_VERSION = 1;

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function toFiniteNumberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function cleanStringOrNull(v) {
  const s = cleanString(v);
  return s || null;
}

/**
 * Section name for an item: top of categoryPath, else category, else "Menu".
 * @param {object} item
 */
function sectionNameForItem(item) {
  const path = Array.isArray(item.categoryPath)
    ? item.categoryPath.map((p) => cleanString(p)).filter(Boolean)
    : [];
  if (path.length) return path[0];
  const category = cleanString(item.category);
  return category || 'Menu';
}

/**
 * Normalize a raw variant/option row into a canonical variant.
 * @param {unknown} raw
 */
function normalizeVariant(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label =
    cleanString(raw.label) ||
    cleanString(raw.name) ||
    (toFiniteNumberOrNull(raw.durationMinutes) != null
      ? `${toFiniteNumberOrNull(raw.durationMinutes)} mins`
      : '');
  const price = toFiniteNumberOrNull(raw.price);
  const durationMinutes = toFiniteNumberOrNull(raw.durationMinutes ?? raw.duration);
  const priceText = cleanStringOrNull(raw.priceText ?? raw.priceDisplay);
  if (!label && price == null && durationMinutes == null) return null;
  return {
    label: label || (price != null ? `$${price}` : 'Option'),
    durationMinutes,
    price,
    priceText,
  };
}

/**
 * Normalize a raw add-on row.
 * @param {unknown} raw
 */
function normalizeAddOn(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanString(raw.name);
  if (!name) return null;
  return {
    name,
    price: toFiniteNumberOrNull(raw.price),
    priceText: cleanStringOrNull(raw.priceText ?? raw.priceDisplay),
  };
}

/**
 * Build a canonical offering from a merged item.
 * @param {object} item
 */
function offeringFromItem(item) {
  const name = cleanString(item.name || item.normalizedName || item.sourceName);
  if (!name) return null;

  const variants = (Array.isArray(item.options) ? item.options : [])
    .map(normalizeVariant)
    .filter(Boolean);
  const addOns = (Array.isArray(item.addOns) ? item.addOns : [])
    .map(normalizeAddOn)
    .filter(Boolean);
  const inclusions = Array.isArray(item.inclusions)
    ? item.inclusions.map((s) => cleanString(s)).filter(Boolean)
    : [];
  const sourceRefs = Array.isArray(item.sourceRefs) ? item.sourceRefs : [];
  const confidence = toFiniteNumberOrNull(item.confidence);

  return {
    name,
    description: cleanString(item.description),
    price: toFiniteNumberOrNull(item.price),
    priceText: cleanStringOrNull(item.priceText ?? item.priceDisplay),
    durationMinutes: toFiniteNumberOrNull(item.durationMinutes ?? item.duration),
    currency: cleanStringOrNull(item.currency),
    inclusions,
    variants,
    addOns,
    confidence: confidence == null ? null : Math.min(1, Math.max(0, confidence)),
    sourceRefs,
  };
}

/**
 * Build the Menu Document from merged extraction output.
 *
 * @param {{
 *   items?: object[],
 *   contact?: object,
 *   openingHours?: unknown[],
 *   notes?: string[],
 * }} merged
 * @param {{ currency?: string | null }} [opts]
 */
export function buildMenuDocument(merged, opts = {}) {
  const items = Array.isArray(merged?.items) ? merged.items : [];

  /** @type {Map<string, { name: string, order: number, offerings: object[] }>} */
  const sectionMap = new Map();
  let order = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const offering = offeringFromItem(item);
    if (!offering) continue;
    const sectionName = sectionNameForItem(item);
    const key = sectionName.toLowerCase();
    let section = sectionMap.get(key);
    if (!section) {
      section = { name: sectionName, order: order++, offerings: [] };
      sectionMap.set(key, section);
    }
    section.offerings.push(offering);
  }

  const sections = Array.from(sectionMap.values()).sort((a, b) => a.order - b.order);

  // Dominant currency: explicit opt → first offering currency → 'AUD'.
  let currency = cleanStringOrNull(opts.currency);
  if (!currency) {
    for (const s of sections) {
      for (const o of s.offerings) {
        if (o.currency) {
          currency = o.currency;
          break;
        }
      }
      if (currency) break;
    }
  }
  currency = currency || 'AUD';

  const stats = summarizeCounts(sections);

  return {
    version: MENU_DOCUMENT_VERSION,
    currency,
    sections,
    ...(merged?.contact && typeof merged.contact === 'object' ? { contact: merged.contact } : {}),
    ...(Array.isArray(merged?.openingHours) && merged.openingHours.length
      ? { openingHours: merged.openingHours }
      : {}),
    ...(Array.isArray(merged?.notes) && merged.notes.length ? { notes: merged.notes } : {}),
    stats,
  };
}

/**
 * @param {Array<{ offerings: object[] }>} sections
 */
function summarizeCounts(sections) {
  let offeringCount = 0;
  let variantCount = 0;
  let addOnCount = 0;
  let inclusionCount = 0;
  let lowConfidenceCount = 0;
  for (const s of sections) {
    for (const o of s.offerings) {
      offeringCount += 1;
      variantCount += Array.isArray(o.variants) ? o.variants.length : 0;
      addOnCount += Array.isArray(o.addOns) ? o.addOns.length : 0;
      inclusionCount += Array.isArray(o.inclusions) ? o.inclusions.length : 0;
      if (o.confidence != null && o.confidence < 0.7) lowConfidenceCount += 1;
    }
  }
  return {
    sectionCount: sections.length,
    offeringCount,
    variantCount,
    addOnCount,
    inclusionCount,
    lowConfidenceCount,
  };
}

/**
 * Agent-first summary line for a Menu Document.
 * @param {{ stats?: object } | null} doc
 */
export function summarizeMenuDocument(doc) {
  const stats = doc?.stats;
  if (!stats || !stats.offeringCount) return 'No menu structure detected';
  const parts = [
    plural(stats.sectionCount, 'section'),
    plural(stats.offeringCount, 'service'),
  ];
  if (stats.variantCount) parts.push(plural(stats.variantCount, 'duration option'));
  if (stats.addOnCount) parts.push(plural(stats.addOnCount, 'add-on'));
  if (stats.lowConfidenceCount) parts.push(`${stats.lowConfidenceCount} need review`);
  const layout = doc?.layout;
  if (layout?.layoutPattern && layout.layoutPattern !== 'unknown') {
    parts.push(`layout ${String(layout.layoutPattern).replace(/_/g, ' ')}`);
  }
  return parts.join(' · ');
}

/**
 * @param {number} n
 * @param {string} word
 */
function plural(n, word) {
  const count = Number(n) || 0;
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export { MENU_DOCUMENT_VERSION };
