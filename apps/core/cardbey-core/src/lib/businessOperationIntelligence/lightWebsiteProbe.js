/**
 * Fast homepage probe for Phase B free snapshot.
 * Reuses fetchHtml + offering extractors. Does not invent offerings.
 */

import { fetchHtml, extractJsonLd } from '../social-import/scrapeUtils.js';
import { extractOfferingsFromPageHtml } from '../mission001/offeringReconstruction/semanticOfferingExtract.js';
import {
  extractMenuLinesFromHtml,
  extractOffersFromSchemaBlocks,
  extractServiceCategoryLinksFromHtml,
} from '../storeCreationResearch/websiteMenuHtmlExtract.js';
import { evaluateOfferingLabel } from '../mission001/offeringReconstruction/offeringLabelQuality.js';
import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import Mission001Flags from '../mission001/mission001Flags.js';

const HOMEPAGE_TIMEOUT_MS = Number(process.env.BUSINESS_SNAPSHOT_WEBSITE_TIMEOUT_MS || 5000);
const DEEP_OFFERINGS_TIMEOUT_MS = Number(process.env.BUSINESS_SNAPSHOT_DEEP_OFFERINGS_TIMEOUT_MS || 12000);

const SOCIAL_PATTERNS = [
  { id: 'facebook', re: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi },
  { id: 'instagram', re: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi },
  { id: 'linkedin', re: /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi },
  { id: 'youtube', re: /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>]+/gi },
  { id: 'tiktok', re: /https?:\/\/(?:www\.)?tiktok\.com\/[^\s"'<>]+/gi },
];

/**
 * @param {string | null | undefined} websiteUrl
 * @param {{
 *   businessName?: string,
 *   vertical?: string,
 *   fetchHtml?: typeof fetchHtml,
 *   reconstructOfferingsFromWebsite?: Function,
 *   allowDeepOfferings?: boolean,
 * }} [deps]
 */
export async function probeWebsiteForSnapshot(websiteUrl, deps = {}) {
  const url = normalizeUrl(websiteUrl);
  const started = Date.now();

  if (!url) {
    return {
      ok: false,
      reason: 'website_not_found',
      message: "We couldn't verify a website yet.",
      ms: Date.now() - started,
      offerings: [],
      social: [],
      description: null,
      websiteReachable: false,
    };
  }

  const fetchFn = deps.fetchHtml || fetchHtml;
  let html = '';
  try {
    html = await fetchFn(url, { timeoutMs: HOMEPAGE_TIMEOUT_MS });
  } catch {
    html = '';
  }

  if (!html) {
    return {
      ok: false,
      reason: 'website_fetch_failed',
      message: "We couldn't verify a website yet.",
      ms: Date.now() - started,
      offerings: [],
      social: [],
      description: null,
      websiteReachable: false,
      websiteUrl: url,
    };
  }

  const social = extractSocialLinks(html);
  const description = extractMetaDescription(html);
  let offerings = collectHomepageOfferings(html, url, deps.businessName, deps.vertical);

  let deepUsed = false;
  let deepFailed = null;
  const allowDeep =
    deps.allowDeepOfferings === true ||
    String(process.env.ENABLE_BUSINESS_SNAPSHOT_DEEP_OFFERINGS || '').toLowerCase() === 'true';

  if (allowDeep && Mission001Flags.offeringReconstruction && offerings.length === 0) {
    try {
      const reconstruct =
        deps.reconstructOfferingsFromWebsite ||
        (await import('../mission001/offeringReconstruction/semanticOfferingReconstruction.js'))
          .reconstructOfferingsFromWebsite;
      const deep = await withTimeout(
        reconstruct({
          websiteUrl: url,
          businessName: deps.businessName,
          vertical: deps.vertical,
        }),
        DEEP_OFFERINGS_TIMEOUT_MS,
      );
      deepUsed = true;
      const deepItems = Array.isArray(deep?.offerings)
        ? deep.offerings
        : Array.isArray(deep?.items)
          ? deep.items
          : [];
      offerings = deepItems
        .map((o) => normalizeOffering(o, 'offering_reconstruction'))
        .filter(Boolean);
    } catch (err) {
      deepFailed = err?.message === 'timeout' ? 'timeout' : 'provider_failure';
    }
  }

  return {
    ok: true,
    reason: null,
    message: null,
    ms: Date.now() - started,
    offerings,
    social,
    description,
    websiteReachable: true,
    websiteUrl: url,
    deepUsed,
    deepFailed,
  };
}

/**
 * @param {string} html
 * @param {string} pageUrl
 * @param {string} [businessName]
 * @param {string} [vertical]
 */
function collectHomepageOfferings(html, pageUrl, businessName, vertical) {
  /** @type {Array<{ name: string, type?: string|null, price?: number|null, knowledgeState: string, source: string, confidence?: number }>} */
  const out = [];
  const seen = new Set();

  const push = (raw, source) => {
    const item = normalizeOffering(raw, source);
    if (!item) return;
    const key = item.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  try {
    const semantic = extractOfferingsFromPageHtml({
      html,
      pageUrl,
      pageType: 'HOME',
      businessName: businessName || '',
      vertical: vertical || '',
    });
    for (const o of semantic.offerings || []) push(o, 'website_homepage_semantic');
  } catch {
    /* extractor best-effort */
  }

  try {
    const blocks = extractJsonLd(html) || [];
    for (const o of extractOffersFromSchemaBlocks(blocks) || []) {
      push(o, 'website_schema');
    }
  } catch {
    /* ignore */
  }

  if (out.length < 3) {
    try {
      for (const o of extractMenuLinesFromHtml(html) || []) {
        push(o, 'website_menu_lines');
      }
    } catch {
      /* ignore */
    }
  }

  if (out.length < 3) {
    try {
      for (const o of extractServiceCategoryLinksFromHtml(html) || []) {
        push({ ...o, type: o.type || 'SERVICE_FAMILY' }, 'website_service_categories');
      }
    } catch {
      /* ignore */
    }
  }

  return out.slice(0, 24);
}

function normalizeOffering(raw, source) {
  if (!raw) return null;
  const name = String(raw.name || raw.title || raw.label || '').trim();
  if (!name || name.length < 3) return null;
  const quality = evaluateOfferingLabel(name);
  if (!quality?.ok) return null;
  const price =
    typeof raw.price === 'number' && Number.isFinite(raw.price)
      ? raw.price
      : raw.price != null && Number.isFinite(Number(raw.price))
        ? Number(raw.price)
        : null;
  return {
    name,
    type: raw.type || raw.offeringType || null,
    price,
    knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
    source,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.7,
  };
}

function extractSocialLinks(html) {
  const found = [];
  const seen = new Set();
  for (const pattern of SOCIAL_PATTERNS) {
    const matches = html.match(pattern.re) || [];
    for (const m of matches) {
      const url = m.replace(/[)'">].*$/, '');
      if (seen.has(url)) continue;
      seen.add(url);
      found.push({
        network: pattern.id,
        url,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        source: 'website_homepage',
      });
      if (found.length >= 8) return found;
    }
  }
  return found;
}

function extractMetaDescription(html) {
  const og = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  );
  if (og?.[1]) return og[1].trim().slice(0, 280);
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (meta?.[1]) return meta[1].trim().slice(0, 280);
  return null;
}

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    if (!u.hostname.includes('.')) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
