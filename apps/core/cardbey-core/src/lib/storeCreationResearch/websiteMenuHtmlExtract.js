/**
 * Extract service/menu rows from website HTML (fallback when schema.org offers are absent).
 */

import { evaluateOfferingLabel } from '../mission001/offeringReconstruction/offeringLabelQuality.js';

const PRICE_LINE_RE =
  /^(.{3,72}?)(?:\s+[-–—.:·]{1,4}\s+|\s{2,})(?:from\s+)?(?:\$|AUD\s*|USD\s*)?(\d+(?:\.\d{2})?)\s*$/i;
const TRAILING_PRICE_RE = /^(.{3,72}?)\s+(\d{1,4}(?:\.\d{2})?)\s*$/;
const INLINE_PRICE_RE =
  /(.{3,60}?)\s+(?:from\s+)?(?:\$|AUD\s*|USD\s*)(\d+(?:\.\d{2})?)/i;
const DURATION_RE = /(\d+)\s*(?:min|mins|minutes|hr|hours)/i;

const SKIP_LINE_RE =
  /^(home|about|contact|gallery|blog|book now|book online|services|menu|pricing|faq|privacy|terms|copyright|follow us|opening hours|hours|phone|email|address|instagram|facebook)/i;

/** Exact nav chrome labels — not service categories. */
const SKIP_NAV_LABEL_RE =
  /^(home|about|about us|contact|contact us|gallery|blog|book now|book online|services|products|product categories|menu|pricing|faq|privacy|privacy policy|terms|warranty|login|sign in|search|cart|checkout|follow us|instagram|facebook|youtube|linkedin|hotline|see all|view all|shop all|shop by category|why choose us|testimonials?|who we are|overview|our people|my account|continue shopping|new in|journal)$/i;

const COMMERCIAL_HREF_RE =
  /\/(products?|shop|store|collections?|services?|solutions?|treatments?|menu|capabilities?|industries?|sectors?|practice|range|catalogue|catalog|what-we-do|our-services|our-products|advisory|consulting)(?:\/|$|\?)/i;

function stripHtmlToText(fragment) {
  return String(fragment ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} html
 * @returns {Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>}
 */
export function extractMenuLinesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const candidateLines = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRe.exec(html)) !== null) {
    const line = stripHtmlToText(liMatch[1]);
    if (line) candidateLines.push(line);
  }

  if (!candidateLines.length) {
    const text = stripHtmlToText(html);
    candidateLines.push(
      ...text
        .split(/\n+/)
        .flatMap((chunk) => chunk.split(/\s{2,}/))
        .map((l) => l.trim())
        .filter((l) => l.length >= 4 && l.length <= 90),
    );
  }

  const out = [];
  const seen = new Set();

  for (const line of candidateLines) {
    if (SKIP_LINE_RE.test(line)) continue;
    if (!/[a-z]/i.test(line)) continue;

    let name = null;
    let price = null;
    let durationMinutes = null;

    const strict = line.match(PRICE_LINE_RE);
    if (strict) {
      name = strict[1].trim();
      price = Number(strict[2]);
    } else {
      const trailing = line.match(TRAILING_PRICE_RE);
      if (trailing) {
        name = trailing[1].trim();
        price = Number(trailing[2]);
      } else {
        const inline = line.match(INLINE_PRICE_RE);
        if (inline) {
          name = inline[1].trim();
          price = Number(inline[2]);
        }
      }
    }

    if (!name || name.length < 3) continue;
    if (!Number.isFinite(price) || price <= 0 || price > 50000) continue;

    const dur = line.match(DURATION_RE);
    if (dur) durationMinutes = Number(dur[1]);

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      name,
      price,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
      description: '',
    });
    if (out.length >= 48) break;
  }

  return out;
}

/**
 * Extract service/product category labels from navigation / category menus
 * without requiring price markup (quote-based service businesses).
 *
 * @param {string} html
 * @returns {Array<{ name: string; price: null; description?: string; type: 'service_category'; contentOrigin: 'sourced' }>}
 */
export function extractServiceCategoryLinksFromHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const labels = [];
  const pushLabel = (raw, href = '') => {
    const name = stripHtmlToText(raw)
      .replace(/\s+/g, ' ')
      .trim();
    if (!name || name.length < 3 || name.length > 72) return;
    if (SKIP_NAV_LABEL_RE.test(name)) return;
    if (!evaluateOfferingLabel(name).ok) return;
    if (!/[a-z]/i.test(name)) return;
    if (/^\d+$/.test(name)) return;
    labels.push({ name, href: String(href || '') });
  };

  // Prefer explicit category menus / dropdowns / sidebars.
  const sectionRes = [
    /product\s*categor(?:y|ies)[\s\S]{0,4000}?(<\/(?:ul|nav|div)>)/gi,
    /<(?:nav|ul)[^>]*(?:dropdown|menu|categor)[^>]*>[\s\S]*?<\/(?:nav|ul)>/gi,
    /<(?:ul|nav)[^>]*>[\s\S]*?<\/(?:ul|nav)>/gi,
  ];
  for (const re of sectionRes) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const chunk = m[0];
      const aRe = /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let a;
      while ((a = aRe.exec(chunk)) !== null) pushLabel(a[2], a[1]);
      const aBare = /<a\b(?![^>]*href=)[^>]*>([\s\S]*?)<\/a>/gi;
      let ab;
      while ((ab = aBare.exec(chunk)) !== null) pushLabel(ab[1]);
      const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let li;
      while ((li = liRe.exec(chunk)) !== null) {
        if (!/<a\b/i.test(li[1])) pushLabel(li[1]);
      }
    }
  }

  // Fallback: only anchors whose href looks commercial (avoid dumping whole-site chrome).
  if (labels.length < 3) {
    const aRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let a;
    while ((a = aRe.exec(html)) !== null) {
      const href = String(a[1] || '');
      if (/^(mailto:|tel:|#|javascript:)/i.test(href)) continue;
      if (!COMMERCIAL_HREF_RE.test(href)) continue;
      pushLabel(a[2], href);
    }
  }

  const out = [];
  const seen = new Set();
  for (const row of labels) {
    const name = typeof row === 'string' ? row : row.name;
    const key = String(name ?? '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      price: null,
      description: '',
      type: 'service_category',
      contentOrigin: 'sourced',
      priceWasNotExplicitlyProvided: true,
    });
    if (out.length >= 24) break;
  }
  return out;
}

/**
 * Pull Offer / Service nodes from schema.org JSON-LD blocks.
 * @param {unknown[]} blocks
 */
export function extractOffersFromSchemaBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const offers = [];

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }

    const typeRaw = node['@type'];
    const types = Array.isArray(typeRaw) ? typeRaw : [typeRaw];
    const isOffer = types.some(
      (t) => typeof t === 'string' && /(Offer|Service|Product|MenuItem)/i.test(t),
    );

    if (isOffer && (node.name || node.itemOffered?.name)) {
      const item = node.itemOffered && typeof node.itemOffered === 'object' ? node.itemOffered : node;
      const name = String(item.name ?? node.name ?? '').trim();
      if (name) {
        offers.push({
          name,
          description: String(item.description ?? node.description ?? '').trim() || undefined,
          price: parseOfferPrice(item.price ?? node.price ?? item.offers?.price ?? node.offers?.price),
        });
      }
    }

    if (node.hasOfferCatalog?.itemListElement) {
      visit(node.hasOfferCatalog.itemListElement);
    }
    if (node.itemListElement) visit(node.itemListElement);
    if (node.offers) visit(node.offers);
    if (node.makesOffer) visit(node.makesOffer);
    if (node['@graph']) visit(node['@graph']);
  };

  for (const block of blocks) visit(block);
  return dedupeOffers(offers);
}

function parseOfferPrice(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.match(/(\d+(?:\.\d{2})?)/);
    return m ? Number(m[1]) : null;
  }
  if (raw && typeof raw === 'object') {
    return parseOfferPrice(raw.price ?? raw.value ?? raw.minPrice);
  }
  return null;
}

function dedupeOffers(offers) {
  const seen = new Set();
  const out = [];
  for (const o of offers) {
    const key = String(o.name ?? '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}
