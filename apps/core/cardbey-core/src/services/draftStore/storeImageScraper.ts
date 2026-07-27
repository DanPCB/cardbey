/**
 * Best-effort store image discovery from public HTML (no browser, no DOM libs).
 * Failures are contained per-source; callers should treat all errors as empty results.
 */

export interface ScrapedImage {
  url: string;
  source: 'facebook' | 'website' | 'google_places';
  alt?: string;
  confidence: number;
}

export interface ScrapeResult {
  images: ScrapedImage[];
  overallConfidence: number;
  scrapeStatus: 'found' | 'partial' | 'blocked' | 'not_found' | 'error';
  sourcesAttempted: string[];
  sourcesSucceeded: string[];
}

export interface ScrapeInput {
  businessName: string;
  businessType: string;
  suburb?: string | null;
  websiteUrl?: string | null;
  facebookHandle?: string | null;
  instagramHandle?: string | null;
}

const SCRAPE_TIMEOUT_MS = 6000;
const MAX_IMAGES_PER_SOURCE = 6;
const MIN_IMAGE_DIMENSION = 200;

const SKIP_DOMAINS = [
  'facebook.com/rsrc',
  'fbsbx.com',
  'fbcdn.net/v/t1.18169',
  'google-analytics',
  'googletagmanager',
  'doubleclick',
  'cloudflare',
  'gravatar',
  'placeholder',
];

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)(\?|$)/i;

export async function scrapeStoreImages(input: ScrapeInput): Promise<ScrapeResult> {
  try {
    return await scrapeStoreImagesInner(input);
  } catch {
    return {
      images: [],
      overallConfidence: 0,
      scrapeStatus: 'error',
      sourcesAttempted: [],
      sourcesSucceeded: [],
    };
  }
}

async function scrapeStoreImagesInner(input: ScrapeInput): Promise<ScrapeResult> {
  const sourcesAttempted: string[] = [];
  const sourcesSucceeded: string[] = [];
  const allImages: ScrapedImage[] = [];

  if (input.websiteUrl) {
    sourcesAttempted.push('website');
    const result = await scrapeWebsite(normaliseUrl(String(input.websiteUrl)));
    if (result.length > 0) {
      allImages.push(...result);
      sourcesSucceeded.push('website');
    }
  }

  const fbFromInput = input.facebookHandle?.trim().replace(/^@/, '') ?? '';
  const slug = slugify(input.businessName);
  const fbHandle = fbFromInput.length > 0 ? fbFromInput : slug;
  sourcesAttempted.push('facebook');
  if (fbHandle.length >= 2) {
    const fbImages = await scrapeFacebookPage(fbHandle);
    if (fbImages.length > 0) {
      allImages.push(...fbImages);
      sourcesSucceeded.push('facebook');
    }
  }

  if (allImages.length < 3) {
    sourcesAttempted.push('google_images');
    const query = [input.businessName, input.suburb, input.businessType].filter(Boolean).join(' ');
    if (query.trim()) {
      const googleImages = await scrapeGoogleImages(query);
      if (googleImages.length > 0) {
        allImages.push(...googleImages);
        sourcesSucceeded.push('google_images');
      }
    }
  }

  const seen = new Set<string>();
  const filtered = allImages.filter((img) => {
    if (!img.url || seen.has(img.url)) return false;
    if (SKIP_DOMAINS.some((d) => img.url.includes(d))) return false;
    seen.add(img.url);
    return true;
  });

  const overallConfidence = filtered.length > 0 ? Math.max(...filtered.map((i) => i.confidence)) : 0;

  return {
    images: filtered.slice(0, 12),
    overallConfidence,
    scrapeStatus:
      filtered.length >= 4 ? 'found' : filtered.length > 0 ? 'partial' : 'not_found',
    sourcesAttempted,
    sourcesSucceeded,
  };
}

async function scrapeWebsite(url: string): Promise<ScrapedImage[]> {
  try {
    const html = await fetchWithTimeout(url, SCRAPE_TIMEOUT_MS);
    return extractImagesFromHtml(html, url, 'website', 0.85);
  } catch {
    return [];
  }
}

async function scrapeFacebookPage(handle: string): Promise<ScrapedImage[]> {
  const url = `https://www.facebook.com/${encodeURIComponent(handle)}`;
  try {
    const html = await fetchWithTimeout(url, SCRAPE_TIMEOUT_MS);
    const ogImages = extractOgImages(html, 'facebook');
    const photoUrls = extractFbcdnPhotos(html);
    return [...ogImages, ...photoUrls].slice(0, MAX_IMAGES_PER_SOURCE);
  } catch {
    return [];
  }
}

async function scrapeGoogleImages(query: string): Promise<ScrapedImage[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encoded}&tbm=isch&num=10`;
  try {
    const html = await fetchWithTimeout(url, SCRAPE_TIMEOUT_MS, {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    });
    return extractGoogleImageThumbnails(html);
  } catch {
    return [];
  }
}

function extractImagesFromHtml(
  html: string,
  baseUrl: string,
  source: ScrapedImage['source'],
  baseConfidence: number,
): ScrapedImage[] {
  const images: ScrapedImage[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(html)) !== null) {
    const tag = match[0];
    const src = extractAttr(tag, 'src') ?? extractAttr(tag, 'data-src') ?? extractAttr(tag, 'data-lazy-src');
    if (!src) continue;

    const alt = extractAttr(tag, 'alt') ?? '';
    const w = parseInt(extractAttr(tag, 'width') ?? '0', 10);
    const h = parseInt(extractAttr(tag, 'height') ?? '0', 10);

    if ((w > 0 && w < MIN_IMAGE_DIMENSION) || (h > 0 && h < MIN_IMAGE_DIMENSION)) continue;

    if (!IMAGE_EXT_RE.test(src) && !src.includes('image')) continue;

    const absUrl = toAbsoluteUrl(src, baseUrl);
    if (!absUrl) continue;

    const altLower = alt.toLowerCase();
    const penalty = /logo|icon|banner|avatar|placeholder/.test(altLower) ? 0.3 : 0;
    const confidence = Math.max(0.1, baseConfidence - penalty);

    images.push({ url: absUrl, source, alt, confidence });
    if (images.length >= MAX_IMAGES_PER_SOURCE) break;
  }
  return images;
}

function extractOgImages(html: string, source: ScrapedImage['source']): ScrapedImage[] {
  const results: ScrapedImage[] = [];
  const re = /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    results.push({ url: m[1], source, confidence: 0.8 });
  }
  const re2 = /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/gi;
  while ((m = re2.exec(html)) !== null) {
    results.push({ url: m[1], source, confidence: 0.8 });
  }
  return results;
}

function extractFbcdnPhotos(html: string): ScrapedImage[] {
  const results: ScrapedImage[] = [];
  const re = /https:\/\/[a-z0-9-]+\.fbcdn\.net\/v\/[^"'\s]+\.(?:jpg|jpeg|png)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[0].replace(/&amp;/g, '&');
    if (url.includes('_s.jpg') || url.includes('p160x160')) continue;
    results.push({ url, source: 'facebook', confidence: 0.75 });
    if (results.length >= MAX_IMAGES_PER_SOURCE) break;
  }
  return results;
}

function extractGoogleImageThumbnails(html: string): ScrapedImage[] {
  const results: ScrapedImage[] = [];
  const re = /"ou":"(https:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
    results.push({
      url,
      source: 'google_places',
      confidence: 0.6,
    });
    if (results.length >= MAX_IMAGES_PER_SOURCE) break;
  }
  return results;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CardbeyBot/1.0 (store image enrichment)',
        Accept: 'text/html,application/xhtml+xml',
        ...extraHeaders,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i');
  return tag.match(re)?.[1] ?? null;
}

function toAbsoluteUrl(src: string, base: string): string | null {
  const s = src.trim();
  if (s.startsWith('http')) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) {
    try {
      const u = new URL(base);
      return `${u.origin}${s}`;
    } catch {
      return null;
    }
  }
  return null;
}

function normaliseUrl(url: string): string {
  const t = url.trim();
  if (t.startsWith('http')) return t;
  return `https://${t}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 50);
}
