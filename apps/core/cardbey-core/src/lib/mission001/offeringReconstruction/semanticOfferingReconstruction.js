/**
 * Mission 001 — Website → Business Offering Reconstruction orchestrator.
 *
 * Cascade: structured catalog empty + website resolved → semantic reconstruction.
 * Never invents offerings; LOW confidence stays rejected.
 */

import { fetchHtml } from '../../social-import/scrapeUtils.js';
import Mission001Flags from '../mission001Flags.js';
import { discoverCommercialPages, classifyPageType } from './semanticPageDiscovery.js';
import {
  extractOfferingsFromPageHtml,
  dedupeOfferings,
  offeringsToExtractedCatalogItems,
} from './semanticOfferingExtract.js';
import { deepCrawlProducts } from '../../social-import/ProductPageCrawler.js';

const MAX_PAGES = 6;
const FETCH_TIMEOUT_MS = 20000;

/**
 * @param {{
 *   websiteUrl: string,
 *   businessName?: string,
 *   vertical?: string,
 *   category?: string,
 *   businessKind?: string,
 * }} input
 */
export async function reconstructOfferingsFromWebsite(input) {
  const websiteUrl = normalizeWebsite(input.websiteUrl);
  const debug = {
    business: input.businessName ?? null,
    website: websiteUrl,
    identityResolved: true,
    pagesInspected: [],
    commercialPagesFound: [],
    candidateOfferings: 0,
    rejectedCandidates: [],
    rejectionReasons: {},
    finalAuthority: 'SPARSE_NO_EVIDENCE',
    finalOutcome: 'sparse',
  };

  if (!Mission001Flags.offeringReconstruction) {
    debug.finalOutcome = 'flag_disabled';
    return { items: [], offerings: [], debug };
  }
  if (!websiteUrl) {
    debug.finalOutcome = 'no_website';
    return { items: [], offerings: [], debug };
  }

  const homepageHtml = await fetchHtmlSafe(websiteUrl);
  if (!homepageHtml) {
    debug.finalOutcome = 'source_fetch_failed';
    debug.finalAuthority = 'SOURCE_BLOCKED';
    return { items: [], offerings: [], debug };
  }

  const pages = discoverCommercialPages(homepageHtml, websiteUrl, { maxPages: MAX_PAGES });
  debug.commercialPagesFound = pages.map((p) => ({ url: p.url, pageType: p.pageType, label: p.label }));

  /** @type {object[]} */
  let allOfferings = [];
  /** @type {object[]} */
  const allRejected = [];

  // Seed from discovered commercial link labels (often stronger than homepage chrome).
  for (const page of pages) {
    if (page.probe) continue;
    const label = String(page.label ?? '').trim();
    if (!label || label.length < 3) continue;
    allOfferings.push({
      name: label,
      description: '',
      price: null,
      url: page.url,
      pageUrl: page.url,
      pageType: page.pageType,
      sourceMethod: 'commercial_nav_label',
      offeringType:
        page.pageType.includes('PRODUCT')
          ? 'PRODUCT_FAMILY'
          : page.pageType.includes('SERVICE') || page.pageType.includes('PRACTICE')
            ? 'SERVICE_FAMILY'
            : 'CAPABILITY',
      confidence: 0.8,
      confidenceBand: 'HIGH',
      evidence: [
        {
          sourceUrl: page.url,
          pageHeading: label,
          extractionMethod: 'commercial_nav_label',
          confidence: 0.8,
        },
      ],
    });
  }

  // Homepage first — keep true page type (usually OTHER). Do not inherit a commercial type
  // from other pages; that caused marketing chrome to be treated as product headings.
  const homeType = classifyPageType(websiteUrl, 'Home');
  const homeExtract = extractOfferingsFromPageHtml({
    html: homepageHtml,
    pageUrl: websiteUrl,
    pageType: homeType,
    businessName: input.businessName,
    vertical: input.vertical ?? input.category,
  });
  debug.pagesInspected.push(websiteUrl);
  allOfferings.push(...homeExtract.offerings);
  allRejected.push(...homeExtract.rejected);

  // Retail-oriented deep product crawl (bounded)
  try {
    const { REJECT_NAME_RE } = await import('./semanticOfferingExtract.js');
    const deep = await deepCrawlProducts(homepageHtml, websiteUrl, {
      maxProductPages: 3,
      maxProducts: 24,
    });
    for (const p of deep) {
      if (!p?.name || REJECT_NAME_RE.test(p.name)) continue;
      if (p.name.length < 3 || p.name.length > 90) continue;
      allOfferings.push({
        name: p.name,
        description: p.description ?? '',
        price: p.price,
        url: websiteUrl,
        pageUrl: websiteUrl,
        pageType: 'PRODUCT_COLLECTION',
        sourceMethod: 'product_page_crawler',
        offeringType: 'PRODUCT',
        confidence: p.price != null ? 0.8 : 0.68,
        confidenceBand: p.price != null ? 'HIGH' : 'MEDIUM',
        evidence: [{ sourceUrl: websiteUrl, extractionMethod: 'product_page_crawler', confidence: 0.7 }],
      });
    }
  } catch {
    /* non-fatal */
  }

  for (const page of pages) {
    if (page.url.replace(/\/$/, '') === websiteUrl.replace(/\/$/, '')) continue;
    if (debug.pagesInspected.length >= MAX_PAGES) break;
    const html = page.probe
      ? await fetchHtmlSafe(page.url)
      : await fetchHtmlSafe(page.url);
    if (!html || html.length < 400) continue;
    debug.pagesInspected.push(page.url);
    const extracted = extractOfferingsFromPageHtml({
      html,
      pageUrl: page.url,
      pageType: page.pageType,
      businessName: input.businessName,
      vertical: input.vertical ?? input.category,
    });
    allOfferings.push(...extracted.offerings);
    allRejected.push(...extracted.rejected);
  }

  allOfferings = dedupeOfferings(allOfferings);
  // Drop seed labels that fail the same quality gate as extracted offerings
  const { evaluateOfferingLabel } = await import('./offeringLabelQuality.js');
  allOfferings = allOfferings.filter((o) => evaluateOfferingLabel(o.name).ok).slice(0, 40);
  debug.candidateOfferings = allOfferings.length;
  debug.rejectedCandidates = allRejected.slice(0, 40);
  for (const r of allRejected) {
    const reason = r.reason || 'unknown';
    debug.rejectionReasons[reason] = (debug.rejectionReasons[reason] || 0) + 1;
  }

  const items = offeringsToExtractedCatalogItems(allOfferings, {
    businessKind: input.businessKind,
  });

  if (items.length) {
    debug.finalAuthority = 'SEMANTIC_WEBSITE_OFFERINGS';
    debug.finalOutcome = 'semantic_offerings';
  } else {
    debug.finalAuthority = 'SPARSE_NO_EVIDENCE';
    debug.finalOutcome = 'sparse';
  }

  return { items, offerings: allOfferings, debug };
}

/**
 * Resolve website URL from research sources / input.
 */
export function resolveWebsiteUrlForReconstruction(normalizedInput, sourcesUsed = [], facts = null) {
  const fromInput = normalizeWebsite(normalizedInput?.website);
  if (fromInput) return fromInput;
  const fromFacts = normalizeWebsite(facts?.website?.value);
  if (fromFacts) return fromFacts;
  for (const match of sourcesUsed ?? []) {
    const t = String(match?.source?.sourceType ?? match?.sourceType ?? '').toLowerCase();
    const url = match?.source?.sourceUrl ?? match?.sourceUrl;
    if ((t.includes('website') || t.includes('official')) && url && !/maps\.google/i.test(url)) {
      return normalizeWebsite(url);
    }
  }
  return null;
}

function normalizeWebsite(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`);
    if (!/^https?:$/i.test(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}

async function fetchHtmlSafe(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const html = await fetchHtml(url, { timeoutMs: FETCH_TIMEOUT_MS });
      if (html && html.length >= 200) return html;
    } catch {
      /* retry */
    }
  }
  return null;
}

export default reconstructOfferingsFromWebsite;
