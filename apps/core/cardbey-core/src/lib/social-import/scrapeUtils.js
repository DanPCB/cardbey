/**
 * Shared scraping helpers for the social-import adapters.
 *
 * Strategy (resilient, lowest-risk first):
 *   1. Plain HTTP fetch of the public page → parse <meta>/OpenGraph + JSON-LD.
 *      This is fast, dependency-free, and works for most public business pages
 *      that expose OpenGraph/structured data.
 *   2. Optional headless render via Puppeteer (already a project dependency) when
 *      SOCIAL_IMPORT_PUPPETEER=true AND the HTTP fetch returned nothing useful.
 *      Puppeteer is lazy-loaded with graceful fallback so a missing Chromium
 *      binary (e.g. on some hosts) never breaks the request.
 *
 * NOTE: The original spec referenced Playwright; this project already ships
 * Puppeteer (^23) and no Playwright. We reuse Puppeteer to avoid adding a heavy
 * new dependency. The adapter interface is browser-agnostic.
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.SOCIAL_IMPORT_FETCH_TIMEOUT_MS || 12_000);
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Fetch raw HTML for a URL over plain HTTP. Never throws — returns '' on failure.
 * @param {string} url
 * @param {{ timeoutMs?: number, userAgent?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function fetchHtml(url, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const userAgent = typeof opts.userAgent === 'string' && opts.userAgent.trim() ? opts.userAgent : DEFAULT_UA;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchFn = await resolveFetch();
    if (!fetchFn) return '';
    const res = await fetchFn(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res || !res.ok) return '';
    const text = await res.text();
    return typeof text === 'string' ? text : '';
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[social-import] fetchHtml failed:', url, err?.message || err);
    }
    return '';
  } finally {
    clearTimeout(timer);
  }
}

let cachedFetch;
async function resolveFetch() {
  if (cachedFetch !== undefined) return cachedFetch;
  if (typeof fetch === 'function') {
    cachedFetch = fetch;
    return cachedFetch;
  }
  try {
    const mod = await import('node-fetch');
    cachedFetch = mod.default ?? mod;
  } catch {
    cachedFetch = null;
  }
  return cachedFetch;
}

/**
 * Optionally render a page with headless Puppeteer to capture client-rendered
 * content. Returns '' (never throws) when disabled or unavailable.
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function renderHtmlWithBrowser(url, opts = {}) {
  if (String(process.env.SOCIAL_IMPORT_PUPPETEER || '').toLowerCase() !== 'true') {
    return '';
  }
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  let browser = null;
  try {
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_UA);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });
    const html = await page.content();
    return typeof html === 'string' ? html : '';
  } catch (err) {
    console.warn('[social-import] puppeteer render skipped:', err?.message || err);
    return '';
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* non-fatal */
      }
    }
  }
}

/** Decode common HTML entities in extracted text. */
export function decodeHtmlEntities(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .trim();
}

/**
 * Extract a single <meta property|name="key" content="..."> value.
 * @param {string} html
 * @param {string} key e.g. 'og:title'
 * @returns {string}
 */
export function extractMetaContent(html, key) {
  if (typeof html !== 'string' || !key) return '';
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeHtmlEntities(m[1]);
  }
  return '';
}

/** Extract the <title> tag text. */
export function extractTitle(html) {
  if (typeof html !== 'string') return '';
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m && m[1] ? decodeHtmlEntities(m[1]) : '';
}

/**
 * Parse all <script type="application/ld+json"> blocks into JS objects.
 * Returns a flat array (handles @graph and arrays). Never throws.
 * @param {string} html
 * @returns {object[]}
 */
export function extractJsonLd(html) {
  if (typeof html !== 'string') return [];
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      collectJsonLdNodes(parsed, out);
    } catch {
      /* malformed JSON-LD — skip */
    }
  }
  return out;
}

function collectJsonLdNodes(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectJsonLdNodes(n, out);
    return;
  }
  if (Array.isArray(node['@graph'])) {
    for (const n of node['@graph']) collectJsonLdNodes(n, out);
  }
  out.push(node);
}

/** Normalize a JSON-LD @type (string or array) to a lowercase string set test. */
export function jsonLdTypeIncludes(node, typeName) {
  if (!node || typeof node !== 'object') return false;
  const t = node['@type'];
  const wanted = String(typeName).toLowerCase();
  if (typeof t === 'string') return t.toLowerCase() === wanted;
  if (Array.isArray(t)) return t.some((x) => String(x).toLowerCase() === wanted);
  return false;
}
