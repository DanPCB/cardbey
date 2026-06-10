/**
 * ProductPageCrawler — discover product/category pages and extract product cards from HTML.
 */

import { fetchHtml, decodeHtmlEntities } from './scrapeUtils.js';

const PRODUCT_PATH_PATTERNS = [
  /\/products?(?:\.html|[/]|$)/i,
  /\/shop(?:\.html|[/]|$)/i,
  /\/store(?:\.html|[/]|$)/i,
  /\/catalog(?:ue)?(?:\.html|[/]|$)/i,
  /\/services(?:\.html|[/]|$)/i,
  /\/category(?:\.html|[/]|$)/i,
  /\/categories(?:\.html|[/]|$)/i,
  /\/menu(?:\.html|[/]|$)/i,
  /\/our-work(?:\.html|[/]|$)/i,
  /\/portfolio(?:\.html|[/]|$)/i,
  /\/gallery(?:\.html|[/]|$)/i,
  /\/collections?(?:\.html|[/]|$)/i,
];

const SKIP_IMG_RE =
  /logo|banner|hero|icon|avatar|sprite|background|bg-|header|footer|favicon|placeholder/i;

const PRICE_RE = /(?:AUD?\s*[\d,]+(?:\.\d{2})?|\$[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*AUD)/gi;

const HEADING_RE = /<h[1-4][^>]*>([^<]+)<\/h[1-4]>/gi;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostnameMatches(baseHost, candidateHost) {
  const stripWww = (host) => String(host || '').replace(/^www\./i, '').toLowerCase();
  return stripWww(baseHost) === stripWww(candidateHost);
}

function pathnameMatchesProductPath(pathname) {
  return PRODUCT_PATH_PATTERNS.some((re) => re.test(pathname));
}

/**
 * @param {string} html
 * @param {string} baseUrl
 * @param {{ maxLinks?: number }} [options]
 * @returns {Promise<string[]>}
 */
export async function crawlProductLinks(html, baseUrl, options = {}) {
  const maxLinks = Math.max(1, Number(options.maxLinks) || 5);
  console.log('[ProductCrawler] scanning for product links in:', baseUrl);
  if (typeof html !== 'string' || !html.trim() || !baseUrl) return [];

  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const baseOrigin = base.origin;
  const baseNormalized = base.href.replace(/\/$/, '');
  const seen = new Set();
  const out = [];

  const anchorRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi;
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(match[1]).trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

    let absolute;
    try {
      absolute = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    let parsed;
    try {
      parsed = new URL(absolute);
    } catch {
      continue;
    }

    if (!hostnameMatches(base.hostname, parsed.hostname)) continue;
    const normalized = parsed.href.replace(/\/$/, '');
    if (normalized === baseNormalized) continue;
    if (!pathnameMatchesProductPath(parsed.pathname)) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    out.push(parsed.href);
    if (out.length >= maxLinks) break;
  }

  console.log('[ProductCrawler] links found:', out.length, out);
  return out;
}

/**
 * @param {string} tag
 * @returns {string|null}
 */
function imageUrlFromImgTag(tag, baseUrl) {
  const srcMatch =
    tag.match(/\bdata-src=["']([^"']+)["']/i) || tag.match(/\bsrc=["']([^"']+)["']/i);
  const rawSrc = srcMatch?.[1] ? decodeHtmlEntities(srcMatch[1]).trim() : '';
  if (!rawSrc || SKIP_IMG_RE.test(tag) || SKIP_IMG_RE.test(rawSrc)) return null;
  try {
    const imageUrl = new URL(rawSrc, baseUrl).href;
    return /^https?:\/\//i.test(imageUrl) ? imageUrl : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} html
 * @param {string} baseUrl
 * @returns {Promise<Array<{ name: string, description: string|null, price: number|null, imageUrl: string|null, category: string|null }>>}
 */
export async function extractProductsFromPage(html, baseUrl) {
  if (typeof html !== 'string' || !html.trim()) return [];

  const sectionCategory = findSectionCategory(html);
  const imgTagRe = /<img\b[^>]*>/gi;
  const products = [];
  const seenNames = new Set();
  let imgMatch;
  let imgTags = 0;

  while ((imgMatch = imgTagRe.exec(html)) !== null) {
    imgTags += 1;
    const tag = imgMatch[0];
    const pos = imgMatch.index;

    const imageUrl = imageUrlFromImgTag(tag, baseUrl);
    if (!imageUrl) continue;

    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const alt = altMatch?.[1] ? stripTags(decodeHtmlEntities(altMatch[1])).trim() : '';

    let name = findNearestHeading(html, pos) || alt;
    if (!name || name.length < 2) {
      name = findCmsProductTitle(html, pos) || '';
    }
    if (!name || name.length < 2 || isJunkProductName(name)) continue;

    const key = name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    const price = parsePriceNear(html.slice(pos, pos + 300));

    products.push({
      name,
      description: null,
      price,
      imageUrl,
      category: sectionCategory,
    });

    if (products.length >= 20) break;
  }

  if (products.length === 0) {
    for (const candidate of extractCmsProductCards(html)) {
      if (isJunkProductName(candidate.name)) continue;
      const key = candidate.name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      products.push({
        name: candidate.name,
        description: null,
        price: candidate.price,
        imageUrl: candidate.imageUrl,
        category: sectionCategory,
      });
      if (products.length >= 20) break;
    }
  }

  console.log('[ProductCrawler] extracting from:', baseUrl, 'imgs found:', imgTags, 'products:', products.length);
  return products;
}

/**
 * @param {string} homepageHtml
 * @param {string} baseUrl
 * @param {{ maxProductPages?: number, maxProducts?: number }} [options]
 * @returns {Promise<Array<{ name: string, description: string|null, price: number|null, imageUrl: string|null, category: string|null }>>}
 */
export async function deepCrawlProducts(homepageHtml, baseUrl, options = {}) {
  const maxPages = Math.max(1, Number(options.maxProductPages) || 3);
  const maxProducts = Math.max(1, Number(options.maxProducts) || 20);

  let links = await crawlProductLinks(homepageHtml, baseUrl, { maxLinks: maxPages });

  if (links.length === 0) {
    const probePaths = [
      '/products',
      '/products/',
      '/products.html',
      '/shop',
      '/shop/',
      '/shop.html',
      '/services',
      '/services/',
      '/our-products',
      '/catalogue',
    ];
    for (const path of probePaths) {
      try {
        const probeUrl = new URL(path, baseUrl).href;
        const probeHtml = await fetchHtml(probeUrl, { timeoutMs: 8000 });
        if (probeHtml && probeHtml.length > 1000) {
          console.log('[ProductCrawler] probe hit:', probeUrl);
          links = [probeUrl];
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (links.length === 0) {
    console.log('[ProductCrawler] no product pages found for:', baseUrl);
    return [];
  }

  const all = [];
  const seenNames = new Set();

  for (const link of links) {
    const html = link === baseUrl ? homepageHtml : await fetchHtml(link, { timeoutMs: 8000 });
    if (!html) continue;

    const pageProducts = await extractProductsFromPage(html, link);
    for (const product of pageProducts) {
      const key = product.name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      all.push(product);
      if (all.length >= maxProducts) break;
    }

    if (all.length >= maxProducts) break;
    await sleep(1000);
  }

  return all.slice(0, maxProducts);
}

function findCmsProductTitle(html, nearPos) {
  const windowStart = Math.max(0, nearPos - 400);
  const windowEnd = Math.min(html.length, nearPos + 400);
  const fragment = html.slice(windowStart, windowEnd);

  const h3Re =
    /<h3[^>]*class="[^"]*(?:product|item|card)[^"]*"[^>]*>([^<]+)<\/h3>/gi;
  let m = h3Re.exec(fragment);
  if (m?.[1]) return stripTags(decodeHtmlEntities(m[1])).trim();

  const divRe =
    /<div[^>]*class="[^"]*(?:product-title|item-name|card-title)[^"]*"[^>]*>([^<]+)<\/div>/gi;
  m = divRe.exec(fragment);
  if (m?.[1]) return stripTags(decodeHtmlEntities(m[1])).trim();

  return '';
}

function extractCmsProductCards(html) {
  const out = [];
  const altRe = /\balt="([^"]{5,80})"/gi;
  let m;
  while ((m = altRe.exec(html)) !== null) {
    const name = stripTags(decodeHtmlEntities(m[1])).trim();
    if (!name || SKIP_IMG_RE.test(name)) continue;
    out.push({ name, price: null, imageUrl: null });
    if (out.length >= 20) break;
  }
  return out;
}

function findSectionCategory(html) {
  const headings = [];
  let m;
  const re = new RegExp(HEADING_RE.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(decodeHtmlEntities(m[1])).trim();
    if (text) headings.push(text);
  }
  return headings[0] || null;
}

function findNearestHeading(html, imgPos) {
  const before = html.slice(Math.max(0, imgPos - 200), imgPos);
  const headingMatches = [...before.matchAll(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/gi)];
  if (headingMatches.length > 0) {
    const last = headingMatches[headingMatches.length - 1][1];
    const text = stripTags(decodeHtmlEntities(last)).trim();
    if (text) return text;
  }

  const after = html.slice(imgPos, imgPos + 200);
  const afterMatch = after.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/i);
  if (afterMatch?.[1]) {
    const text = stripTags(decodeHtmlEntities(afterMatch[1])).trim();
    if (text) return text;
  }

  const titleMatch = after.match(/class=["'][^"']*title[^"']*["'][^>]*>([^<]+)</i);
  if (titleMatch?.[1]) {
    return stripTags(decodeHtmlEntities(titleMatch[1])).trim();
  }

  return '';
}

function parsePriceNear(fragment) {
  const matches = fragment.match(PRICE_RE);
  if (!matches || matches.length === 0) return null;
  const raw = matches[0].replace(/AUD/gi, '').replace(/\$/g, '').replace(/,/g, '').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isJunkProductName(name) {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === 'menu' || n === 'home' || n === 'logo' || n === 'search';
}

export default { crawlProductLinks, extractProductsFromPage, deepCrawlProducts };
