/**
 * ProductPageCrawler — discover product/category pages and extract product cards from HTML.
 */

import { fetchHtml, decodeHtmlEntities } from './scrapeUtils.js';

const PRODUCT_PATH_RE =
  /\/(?:product|products|shop|store|catalog|catalogue|services|category|categories|menu|our-work|portfolio|gallery)(?:\/|$)/i;

const SKIP_IMG_RE =
  /logo|banner|hero|icon|avatar|sprite|background|bg-|header|footer|favicon|placeholder/i;

const PRICE_RE = /(?:AUD?\s*[\d,]+(?:\.\d{2})?|\$[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*AUD)/gi;

const HEADING_RE = /<h[1-4][^>]*>([^<]+)<\/h[1-4]>/gi;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} html
 * @param {string} baseUrl
 * @param {{ maxLinks?: number }} [options]
 * @returns {Promise<string[]>}
 */
export async function crawlProductLinks(html, baseUrl, options = {}) {
  const maxLinks = Math.max(1, Number(options.maxLinks) || 5);
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

    if (parsed.origin !== baseOrigin) continue;
    const normalized = parsed.href.replace(/\/$/, '');
    if (normalized === baseNormalized) continue;
    if (!PRODUCT_PATH_RE.test(parsed.pathname)) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    out.push(parsed.href);
    if (out.length >= maxLinks) break;
  }

  return out;
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

  while ((imgMatch = imgTagRe.exec(html)) !== null) {
    const tag = imgMatch[0];
    const pos = imgMatch.index;

    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
    const rawSrc = srcMatch?.[1] ? decodeHtmlEntities(srcMatch[1]).trim() : '';
    if (!rawSrc || SKIP_IMG_RE.test(tag) || SKIP_IMG_RE.test(rawSrc)) continue;

    let imageUrl = null;
    try {
      imageUrl = new URL(rawSrc, baseUrl).href;
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(imageUrl)) continue;

    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const alt = altMatch?.[1] ? stripTags(decodeHtmlEntities(altMatch[1])).trim() : '';

    const name = findNearestHeading(html, pos) || alt;
    if (!name || name.length < 2) continue;

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

  const links = await crawlProductLinks(homepageHtml, baseUrl, { maxLinks: maxPages });
  if (links.length === 0) return [];

  const all = [];
  const seenNames = new Set();

  for (const link of links) {
    const html = await fetchHtml(link, { timeoutMs: 8000 });
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

export default { crawlProductLinks, extractProductsFromPage, deepCrawlProducts };
