/**
 * Mission 001 — Gate A: classify commercially relevant pages from a website.
 */

export const PAGE_TYPES = Object.freeze({
  PRODUCT: 'PRODUCT',
  PRODUCT_COLLECTION: 'PRODUCT_COLLECTION',
  SERVICE: 'SERVICE',
  SERVICE_COLLECTION: 'SERVICE_COLLECTION',
  MENU: 'MENU',
  BOOKING: 'BOOKING',
  SOLUTION: 'SOLUTION',
  PRACTICE_AREA: 'PRACTICE_AREA',
  CAPABILITY: 'CAPABILITY',
  INDUSTRY_SOLUTION: 'INDUSTRY_SOLUTION',
  ABOUT: 'ABOUT',
  CONTACT: 'CONTACT',
  BLOG: 'BLOG',
  NEWS: 'NEWS',
  CAREERS: 'CAREERS',
  LEGAL: 'LEGAL',
  OTHER: 'OTHER',
});

const NON_COMMERCIAL = new Set([
  PAGE_TYPES.ABOUT,
  PAGE_TYPES.CONTACT,
  PAGE_TYPES.BLOG,
  PAGE_TYPES.NEWS,
  PAGE_TYPES.CAREERS,
  PAGE_TYPES.LEGAL,
  PAGE_TYPES.OTHER,
]);

const PATH_RULES = [
  { type: PAGE_TYPES.LEGAL, re: /\/(privacy|terms|legal|cookie|disclaimer)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.CAREERS, re: /\/(careers?|jobs?|join[-_]?us|vacancies)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.BLOG, re: /\/(blog|articles?|insights?|resources?\/blog)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.NEWS, re: /\/(news|press|media[-_]?centre|media[-_]?center)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.CONTACT, re: /\/(contact|get[-_]?in[-_]?touch|locations?)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.ABOUT, re: /\/(about|our[-_]?story|team|people|leadership)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.MENU, re: /\/(menu|food[-_]?menu|drink[-_]?menu)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.BOOKING, re: /\/(book|booking|appointments?|reserve)(?:\/|$|\.)/i },
  {
    type: PAGE_TYPES.PRODUCT_COLLECTION,
    re: /\/(products?|shop|store|collections?|catalogue|catalog|range|our[-_]?products)(?:\/|$|\.)/i,
  },
  {
    type: PAGE_TYPES.SERVICE_COLLECTION,
    re: /\/(services?|treatments?|what[-_]?we[-_]?do|our[-_]?services)(?:\/|$|\.)/i,
  },
  {
    type: PAGE_TYPES.SOLUTION,
    re: /\/(solutions?|capabilities?|offerings?|expertise)(?:\/|$|\.)/i,
  },
  {
    type: PAGE_TYPES.PRACTICE_AREA,
    re: /\/(practice[-_]?areas?|industries?|sectors?)(?:\/|$|\.)/i,
  },
  { type: PAGE_TYPES.INDUSTRY_SOLUTION, re: /\/(industr(?:y|ies)|sector[-_]?solutions?)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.CAPABILITY, re: /\/(capability|capabilities|advisory|consulting)(?:\/|$|\.)/i },
  { type: PAGE_TYPES.PRODUCT, re: /\/product\//i },
  { type: PAGE_TYPES.SERVICE, re: /\/service\//i },
];

const LABEL_RULES = [
  { type: PAGE_TYPES.MENU, re: /\b(menu|food|dining)\b/i },
  { type: PAGE_TYPES.BOOKING, re: /\b(book|booking|appointment)\b/i },
  { type: PAGE_TYPES.PRODUCT_COLLECTION, re: /\b(products?|shop|collections?|catalogue|range)\b/i },
  { type: PAGE_TYPES.SERVICE_COLLECTION, re: /\b(services?|treatments?|what we do)\b/i },
  { type: PAGE_TYPES.SOLUTION, re: /\b(solutions?|capabilities?|expertise)\b/i },
  { type: PAGE_TYPES.PRACTICE_AREA, re: /\b(practice areas?|industries|sectors)\b/i },
  { type: PAGE_TYPES.CAREERS, re: /\b(careers?|jobs?|join us)\b/i },
  { type: PAGE_TYPES.ABOUT, re: /\b(about|our story|our team)\b/i },
  { type: PAGE_TYPES.CONTACT, re: /\b(contact|get in touch)\b/i },
  { type: PAGE_TYPES.BLOG, re: /\b(blog|insights|articles)\b/i },
  { type: PAGE_TYPES.NEWS, re: /\b(news|press)\b/i },
  { type: PAGE_TYPES.LEGAL, re: /\b(privacy|terms|legal)\b/i },
];

/**
 * @param {string} url
 * @param {string} [label]
 */
export function classifyPageType(url, label = '') {
  const path = safePath(url);
  for (const rule of PATH_RULES) {
    if (rule.re.test(path)) return rule.type;
  }
  const text = String(label ?? '').trim();
  if (text) {
    for (const rule of LABEL_RULES) {
      if (rule.re.test(text)) return rule.type;
    }
  }
  return PAGE_TYPES.OTHER;
}

/**
 * @param {string} pageType
 */
export function isCommercialPageType(pageType) {
  return !NON_COMMERCIAL.has(pageType);
}

/**
 * Discover candidate commercial URLs from homepage HTML.
 * @param {string} html
 * @param {string} baseUrl
 * @param {{ maxPages?: number }} [opts]
 */
export function discoverCommercialPages(html, baseUrl, opts = {}) {
  const maxPages = Math.max(1, Number(opts.maxPages) || 8);
  /** @type {Array<{ url: string, label: string, pageType: string, score: number }>} */
  const candidates = [];
  const seen = new Set();

  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = String(match[1] || '').trim().replace(/&amp;/gi, '&');
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let absolute;
    try {
      absolute = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (absolute.hostname.replace(/^www\./i, '') !== base.hostname.replace(/^www\./i, '')) continue;
    const normalized = absolute.href.replace(/\/$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const label = stripTags(match[2]).replace(/\s+/g, ' ').trim();
    const pageType = classifyPageType(normalized, label);
    if (!isCommercialPageType(pageType)) continue;

    candidates.push({
      url: absolute.href,
      label: label.slice(0, 80),
      pageType,
      score: scoreCommercialCandidate(pageType, label, absolute.pathname),
    });
  }

  // Homepage is fetched separately by the orchestrator — do not consume a commercial page slot.

  // Probe common commercial paths even if not linked.
  const probes = [
    '/products',
    '/shop',
    '/services',
    '/solutions',
    '/collections',
    '/menu',
    '/what-we-do',
    '/our-services',
    '/our-products',
    '/capabilities',
    '/industries',
    '/practice-areas',
  ];
  for (const path of probes) {
    try {
      const u = new URL(path, baseUrl).href;
      const key = u.replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      const pageType = classifyPageType(u, path.slice(1));
      if (!isCommercialPageType(pageType)) continue;
      candidates.push({
        url: u,
        label: path.slice(1),
        pageType,
        score: 35,
        probe: true,
      });
    } catch {
      /* ignore */
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);
}

function scoreCommercialCandidate(pageType, label, pathname) {
  let score = 10;
  const boost = {
    [PAGE_TYPES.PRODUCT_COLLECTION]: 50,
    [PAGE_TYPES.SERVICE_COLLECTION]: 50,
    [PAGE_TYPES.MENU]: 55,
    [PAGE_TYPES.BOOKING]: 45,
    [PAGE_TYPES.SOLUTION]: 45,
    [PAGE_TYPES.PRACTICE_AREA]: 40,
    [PAGE_TYPES.CAPABILITY]: 40,
    [PAGE_TYPES.PRODUCT]: 35,
    [PAGE_TYPES.SERVICE]: 35,
    [PAGE_TYPES.INDUSTRY_SOLUTION]: 35,
  };
  score += boost[pageType] ?? 0;
  if (/\b(shop|buy|book|order|services|products|solutions|menu|treatments)\b/i.test(label)) score += 15;
  if ((pathname.match(/\//g) || []).length <= 2) score += 5;
  return score;
}

function safePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url ?? '');
  }
}

function stripTags(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#?\w+;/g, ' ');
}

export default {
  PAGE_TYPES,
  classifyPageType,
  isCommercialPageType,
  discoverCommercialPages,
};
