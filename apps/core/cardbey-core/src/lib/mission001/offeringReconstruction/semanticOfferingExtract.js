/**
 * Mission 001 — Gate B/C: extract evidence-supported offerings from commercial page HTML.
 * Prefer recall of real commercial concepts over inventing SKUs.
 */

import { extractOffersFromSchemaBlocks, extractServiceCategoryLinksFromHtml } from '../../storeCreationResearch/websiteMenuHtmlExtract.js';
import { extractJsonLd } from '../../social-import/scrapeUtils.js';
import { PAGE_TYPES } from './semanticPageDiscovery.js';
import { evaluateOfferingLabel, NON_OFFERING_SOFT_RE } from './offeringLabelQuality.js';

const REJECT_NAME_RE = NON_OFFERING_SOFT_RE;

const COMMERCIAL_CONTEXT_RE =
  /\b(buy|shop|order|book|enquire|inquire|request quote|get a quote|our services|services|products|solutions|treatments|menu|packages|collections|capabilities|advice|installation|delivery|pricing|range|offerings?|what we (do|offer)|practice areas?)\b/i;

const OFFERING_TYPES = Object.freeze({
  PRODUCT: 'PRODUCT',
  PRODUCT_FAMILY: 'PRODUCT_FAMILY',
  SERVICE: 'SERVICE',
  SERVICE_FAMILY: 'SERVICE_FAMILY',
  BOOKING: 'BOOKING',
  MENU_ITEM: 'MENU_ITEM',
  EXPERIENCE: 'EXPERIENCE',
  SOLUTION: 'SOLUTION',
  CAPABILITY: 'CAPABILITY',
  ENGAGEMENT: 'ENGAGEMENT',
  OTHER: 'OTHER',
});

/**
 * @param {object} params
 * @param {string} params.html
 * @param {string} params.pageUrl
 * @param {string} params.pageType
 * @param {string} [params.businessName]
 * @param {string} [params.vertical]
 */
export function extractOfferingsFromPageHtml(params) {
  const { html, pageUrl, pageType, businessName = '', vertical = '' } = params;
  if (!html || typeof html !== 'string') {
    return { offerings: [], rejected: [], pagesInspected: 1 };
  }

  /** @type {object[]} */
  const candidates = [];
  /** @type {object[]} */
  const rejected = [];

  // 1) schema.org
  try {
    const blocks = extractJsonLd(html) ?? [];
    for (const offer of extractOffersFromSchemaBlocks(blocks)) {
      candidates.push(
        toCandidate(offer.name, {
          pageUrl,
          pageType,
          description: offer.description,
          price: offer.price,
          sourceMethod: 'schema_org',
          offeringType: inferType(pageType, vertical, offer.name),
          confidence: 0.88,
        }),
      );
    }
  } catch {
    /* ignore */
  }

  // 1b) Title / meta description capability phrases (SPA shells with little body HTML)
  for (const meta of extractMetaCapabilityPhrases(html)) {
    candidates.push(
      toCandidate(meta, {
        pageUrl,
        pageType,
        sourceMethod: 'meta_capability',
        offeringType: inferType(pageType, vertical, meta),
        confidence: 0.74,
      }),
    );
  }

  // 2) Existing category-link extractor (nav service/product families)
  for (const cat of extractServiceCategoryLinksFromHtml(html)) {
    candidates.push(
      toCandidate(cat.name, {
        pageUrl,
        pageType,
        description: cat.description,
        price: null,
        sourceMethod: 'nav_category',
        offeringType: inferType(pageType, vertical, cat.name),
        confidence: 0.72,
      }),
    );
  }

  // 3) Headings under commercial pages
  const headings = extractHeadings(html);
  for (const h of headings) {
    candidates.push(
      toCandidate(h.text, {
        pageUrl,
        pageType,
        description: '',
        price: null,
        sourceMethod: `heading_h${h.level}`,
        offeringType: inferType(pageType, vertical, h.text),
        confidence: h.level <= 2 ? 0.7 : 0.62,
        evidenceSnippet: h.text,
      }),
    );
  }

  // 4) Card / list titles (common CMS patterns)
  for (const card of extractCardTitles(html)) {
    candidates.push(
      toCandidate(card, {
        pageUrl,
        pageType,
        sourceMethod: 'card_title',
        offeringType: inferType(pageType, vertical, card),
        confidence: 0.68,
      }),
    );
  }

  const accepted = [];
  const seen = new Set();
  for (const c of candidates) {
    const decision = evaluateCandidate(c, { businessName, pageType, html });
    if (!decision.accept) {
      rejected.push({ name: c.name, reason: decision.reason, pageUrl });
      continue;
    }
    const key = normalizeKey(c.name);
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push({
      ...c,
      confidence: decision.confidence,
      confidenceBand: decision.band,
    });
  }

  return { offerings: accepted, rejected, pagesInspected: 1 };
}

/**
 * Deduplicate semantically similar offerings; keep strongest evidence.
 * @param {object[]} offerings
 */
export function dedupeOfferings(offerings) {
  const sorted = [...(offerings ?? [])].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const kept = [];
  for (const item of sorted) {
    const key = normalizeKey(item.name);
    const duplicate = kept.find((k) => {
      const kk = normalizeKey(k.name);
      return kk === key || kk.includes(key) || key.includes(kk);
    });
    if (duplicate) {
      // Prefer longer, more specific name if confidence similar
      if ((item.confidence ?? 0) > (duplicate.confidence ?? 0) + 0.05) {
        Object.assign(duplicate, item);
      } else if (
        Math.abs((item.confidence ?? 0) - (duplicate.confidence ?? 0)) < 0.05 &&
        String(item.name).length > String(duplicate.name).length + 4
      ) {
        Object.assign(duplicate, item);
      }
      continue;
    }
    kept.push({ ...item });
  }
  return kept;
}

/**
 * Map internal offerings → ExtractedCatalogItem shape used by research agent.
 * @param {object[]} offerings
 * @param {{ businessKind?: string }} [opts]
 */
export function offeringsToExtractedCatalogItems(offerings, opts = {}) {
  return (offerings ?? [])
    .filter((o) => (o.confidenceBand === 'HIGH' || o.confidenceBand === 'MEDIUM') && o.name)
    .map((o) => ({
      name: o.name,
      description: o.description || undefined,
      price: o.price == null ? null : o.price,
      category: o.category || mapTypeToCategory(o.offeringType),
      sourceUrl: o.url || o.pageUrl || null,
      sourceType: 'official_website',
      confidence: o.confidence,
      needsOwnerReview: o.confidenceBand !== 'HIGH',
      contentOrigin: 'sourced',
      priceWasNotExplicitlyProvided: o.price == null,
      offeringType: o.offeringType,
      evidence: o.evidence ?? [],
      researchMeta: {
        sourceUrl: o.url || o.pageUrl || null,
        sourceType: 'official_website',
        confidence: o.confidence,
        extractionMethod: o.sourceMethod,
        pageType: o.pageType,
        needsOwnerReview: o.confidenceBand !== 'HIGH',
      },
      businessKindHint: opts.businessKind,
    }));
}

function evaluateCandidate(candidate, ctx) {
  const name = String(candidate.name ?? '').trim();
  const labelGate = evaluateOfferingLabel(name);
  if (!labelGate.ok) return { accept: false, reason: labelGate.reason || 'non_commercial_label' };
  if (looksLikePersonName(name, ctx.pageType)) return { accept: false, reason: 'person_name' };
  if (looksLikeLocationOnly(name)) return { accept: false, reason: 'location' };
  if (ctx.businessName && normalizeKey(name) === normalizeKey(ctx.businessName)) {
    return { accept: false, reason: 'business_name_echo' };
  }

  // Require commercial context on homepage-ish OTHER pages for heading-only candidates
  const method = String(candidate.sourceMethod ?? '');
  if (method.startsWith('heading') && (ctx.pageType === PAGE_TYPES.OTHER || ctx.pageType === PAGE_TYPES.ABOUT)) {
    if (!COMMERCIAL_CONTEXT_RE.test(ctx.html?.slice(0, 8000) ?? '')) {
      return { accept: false, reason: 'no_commercial_context' };
    }
  }
  // On OTHER/ABOUT pages, require a commercial ontology signal for non-schema/meta sources
  if (
    (ctx.pageType === PAGE_TYPES.OTHER || ctx.pageType === PAGE_TYPES.ABOUT) &&
    method !== 'schema_org' &&
    method !== 'meta_capability'
  ) {
    if (
      !COMMERCIAL_CONTEXT_RE.test(name) &&
      !/\b(door|doors|coffee|investment|audit|tax|advice|support|workers?|disability|aged\s+care|milk|cotton|beauty|makeup|fragrance|ndis)\b/i.test(
        name,
      )
    ) {
      return { accept: false, reason: 'homepage_heading_weak' };
    }
  }

  let confidence = Number(candidate.confidence) || 0.55;
  if (method === 'schema_org') confidence = Math.max(confidence, 0.85);
  if (COMMERCIAL_CONTEXT_RE.test(name)) confidence = Math.min(1, confidence + 0.05);

  let band = 'LOW';
  if (confidence >= 0.78) band = 'HIGH';
  else if (confidence >= 0.6) band = 'MEDIUM';
  else return { accept: false, reason: 'low_confidence', confidence, band };

  return { accept: true, confidence, band };
}

function toCandidate(name, meta) {
  return {
    name: String(name ?? '').replace(/\s+/g, ' ').trim(),
    description: meta.description ?? '',
    price: meta.price ?? null,
    url: meta.pageUrl,
    pageUrl: meta.pageUrl,
    pageType: meta.pageType,
    sourceMethod: meta.sourceMethod,
    offeringType: meta.offeringType ?? OFFERING_TYPES.OTHER,
    confidence: meta.confidence ?? 0.6,
    evidence: [
      {
        sourceUrl: meta.pageUrl,
        pageHeading: meta.evidenceSnippet ?? name,
        extractionMethod: meta.sourceMethod,
        confidence: meta.confidence ?? 0.6,
      },
    ],
  };
}

function inferType(pageType, vertical, name) {
  const v = String(vertical ?? '').toLowerCase();
  const n = String(name ?? '').toLowerCase();
  if (pageType === PAGE_TYPES.MENU || /\b(menu|dish|latte|coffee|pho)\b/.test(n)) return OFFERING_TYPES.MENU_ITEM;
  if (pageType === PAGE_TYPES.BOOKING) return OFFERING_TYPES.BOOKING;
  if (pageType === PAGE_TYPES.SOLUTION || pageType === PAGE_TYPES.CAPABILITY) return OFFERING_TYPES.SOLUTION;
  if (pageType === PAGE_TYPES.PRACTICE_AREA || pageType === PAGE_TYPES.INDUSTRY_SOLUTION) {
    return OFFERING_TYPES.CAPABILITY;
  }
  if (pageType === PAGE_TYPES.SERVICE || pageType === PAGE_TYPES.SERVICE_COLLECTION) {
    return /\b(package|collection|range)\b/.test(n) ? OFFERING_TYPES.SERVICE_FAMILY : OFFERING_TYPES.SERVICE;
  }
  if (pageType === PAGE_TYPES.PRODUCT || pageType === PAGE_TYPES.PRODUCT_COLLECTION) {
    return /\b(range|collection|family|series)\b/.test(n) ? OFFERING_TYPES.PRODUCT_FAMILY : OFFERING_TYPES.PRODUCT;
  }
  if (/\b(financial|consulting|professional|service)\b/.test(v)) return OFFERING_TYPES.CAPABILITY;
  if (/\b(retail|florist|manufacturing|security)\b/.test(v)) return OFFERING_TYPES.PRODUCT_FAMILY;
  if (/\b(beauty|trades|cafe|restaurant)\b/.test(v)) return OFFERING_TYPES.SERVICE;
  return OFFERING_TYPES.OTHER;
}

function mapTypeToCategory(offeringType) {
  switch (offeringType) {
    case OFFERING_TYPES.MENU_ITEM:
      return 'Menu';
    case OFFERING_TYPES.PRODUCT:
    case OFFERING_TYPES.PRODUCT_FAMILY:
      return 'Products';
    case OFFERING_TYPES.SOLUTION:
    case OFFERING_TYPES.CAPABILITY:
    case OFFERING_TYPES.ENGAGEMENT:
      return 'Capabilities';
    default:
      return 'Services';
  }
}

function extractHeadings(html) {
  const out = [];
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[2]).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    out.push({ level: Number(m[1]), text });
    if (out.length >= 40) break;
  }
  return out;
}

function extractCardTitles(html) {
  const out = [];
  const patterns = [
    /<(?:div|article|li)[^>]*class=["'][^"']*(?:product|service|card|offering|solution|collection)[^"']*["'][^>]*>[\s\S]{0,600}?<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi,
    /<(?:div|article)[^>]*class=["'][^"']*(?:product|service|card)[^"']*["'][^>]*>[\s\S]{0,400}?<a[^>]*>([\s\S]*?)<\/a>/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const text = stripTags(m[1]).replace(/\s+/g, ' ').trim();
      if (text && text.length >= 3 && text.length <= 80) out.push(text);
      if (out.length >= 30) return out;
    }
  }
  return out;
}

/**
 * Pull customer-obtainable capability phrases from title/meta when body HTML is sparse (SPA).
 * Example: "Find Local Support Workers | Disability & Aged Care Support | Hireup"
 */
function extractMetaCapabilityPhrases(html) {
  const out = [];
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const desc =
    (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1] ||
    (html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) || [])[1] ||
    '';
  const corpus = `${stripTags(title || '')} ${stripTags(desc || '')}`;
  if (!corpus.trim()) return out;

  // Title segments split by | or ·
  for (const part of corpus.split(/[|·•]/).map((p) => p.trim())) {
    if (part.length < 8 || part.length > 70) continue;
    if (/^find\s+/i.test(part)) {
      const rest = part.replace(/^find\s+(local\s+)?/i, '').trim();
      if (rest) out.push(rest);
      continue;
    }
    if (COMMERCIAL_CONTEXT_RE.test(part) || /\b(support|disability|aged\s+care|workers?|ndis)\b/i.test(part)) {
      out.push(part.replace(/\s*\|?\s*hireup\s*$/i, '').trim());
    }
  }

  // Explicit noun phrases from description
  const phraseRes = [
    /\b(disability\s+support)\b/gi,
    /\b(aged\s+care\s+support)\b/gi,
    /\b(support\s+workers?)\b/gi,
    /\b(ndis\s+support)\b/gi,
    /\b(home\s+care)\b/gi,
  ];
  for (const re of phraseRes) {
    let m;
    while ((m = re.exec(corpus)) !== null) {
      out.push(m[1].replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }

  return [...new Set(out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

function looksLikePersonName(name, _pageType) {
  // Title Case two-token labels that look like First Last, without commercial nouns.
  // Product labels ("Face Primers") are excluded via commercial noun list.
  const parts = name.split(/\s+/);
  if (parts.length !== 2) return false;
  if (COMMERCIAL_CONTEXT_RE.test(name)) return false;
  if (
    /\b(door|doors|coffee|security|service|services|product|products|solution|solutions|investment|advisory|installation|repair|package|collection|menu|treatment|treatments|primer|primers|powder|powders|spray|sprays|makeup|skincare|fragrance|haircare|nail|nails|beauty|screen|shutter|shutters|blind|blinds|window|windows|audit|tax|consulting|superannuation|support|workers?|finder|complexion|body|wellness|new|all)\b/i.test(
      name,
    )
  ) {
    return false;
  }
  return parts.every((p) => /^[A-Z][a-z'-]{1,20}$/.test(p));
}

function looksLikeLocationOnly(name) {
  return /\b(street|st|rd|road|avenue|melbourne|sydney|vic|nsw|qld|australia)\b/i.test(name) &&
    !COMMERCIAL_CONTEXT_RE.test(name) &&
    name.split(/\s+/).length <= 5;
}

function normalizeKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#?\w+;/g, ' ');
}

export { OFFERING_TYPES, REJECT_NAME_RE };
