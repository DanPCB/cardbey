/**
 * Discover Australian beauty/service venues on Bookwell when no website is supplied.
 * Bookwell listing pages are public and link to venue pages with scrapeable service menus.
 */

import { extractMenuLinesFromHtml } from './websiteMenuHtmlExtract.js';

const BOOKWELL_ORIGIN = 'https://www.bookwell.com.au';
const FETCH_TIMEOUT_MS = 8000;

const BEAUTY_CATEGORY_RE =
  /\b(beauty|salon|spa|nail|manicure|pedicure|lash|brow|wax|hair|barber|massage|facial|cosmetic)\b/i;

/** Listing paths likely to contain beauty venues (path segment after /book/). */
const BOOKWELL_BEAUTY_LISTING_PATHS = [
  'nails/shellac',
  'nails/manicure',
  'nails/pedicure',
  'eye/eyelash-extensions',
  'beauty/waxing',
  'beauty/facials',
  'hair/haircut',
];

const VENUE_URL_RE =
  /(?:https:\/\/www\.bookwell\.com\.au)?\/venue\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d{4})/gi;

/**
 * @param {string} [category]
 * @param {string} [businessName]
 */
export function isBeautyBookingCategory(category, businessName) {
  const corpus = [category, businessName].filter(Boolean).join(' ');
  return BEAUTY_CATEGORY_RE.test(corpus);
}

/**
 * @param {string} name
 */
export function slugifyBusinessName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * @param {string} [location]
 */
export function bookwellLocationSlug(location) {
  const raw = String(location ?? '').trim().toLowerCase();
  if (!raw) return 'melbourne';
  const city = raw.split(',')[0]?.trim() ?? raw;
  return city
    .replace(/\b(vic|nsw|qld|sa|wa|tas|nt|act)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'melbourne';
}

/**
 * @param {string} businessName
 * @param {string} venueSlug
 */
export function venueSlugMatchesName(businessName, venueSlug) {
  const expected = slugifyBusinessName(businessName);
  if (!expected || !venueSlug) return false;
  if (expected === venueSlug) return true;
  const nameTokens = expected.split('-').filter((t) => t.length > 2);
  const slugTokens = String(venueSlug).split('-').filter((t) => t.length > 2);
  if (!nameTokens.length) return false;
  const overlap = nameTokens.filter((t) => slugTokens.includes(t));
  return overlap.length >= Math.min(2, nameTokens.length);
}

/**
 * Find a Bookwell venue URL in a category listing HTML page.
 * @param {string} html
 * @param {string} businessName
 * @returns {string|null}
 */
export function findBookwellVenueInListingHtml(html, businessName) {
  if (!html || !businessName) return null;
  const nameLower = String(businessName).toLowerCase();
  const slug = slugifyBusinessName(businessName);

  VENUE_URL_RE.lastIndex = 0;
  let match;
  while ((match = VENUE_URL_RE.exec(html)) !== null) {
    const [, venueSlug, suburb, postcode] = match;
    if (venueSlugMatchesName(businessName, venueSlug)) {
      return `${BOOKWELL_ORIGIN}/venue/${venueSlug}/${suburb}/${postcode}`;
    }
  }

  // Heading match: "## Glamshell Beauty" near a venue link in raw HTML
  if (html.toLowerCase().includes(nameLower) || html.toLowerCase().includes(slug.replace(/-/g, ' '))) {
    const idx = html.toLowerCase().indexOf(slug.replace(/-/g, ' '));
    const searchAt = idx >= 0 ? idx : html.toLowerCase().indexOf(nameLower);
    if (searchAt >= 0) {
      const window = html.slice(Math.max(0, searchAt - 800), searchAt + 800);
      const near = window.match(/\/venue\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d{4})/i);
      if (near && venueSlugMatchesName(businessName, near[1])) {
        return `${BOOKWELL_ORIGIN}/venue/${near[1]}/${near[2]}/${near[3]}`;
      }
    }
  }

  return null;
}

/**
 * Parse Bookwell venue page service blocks (h3 title + duration + price).
 * @param {string} html
 * @returns {Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>}
 */
export function extractOffersFromBookwellHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const offers = [];
  const seen = new Set();

  const h3Parts = html.split(/<h3[^>]*>/i).slice(1);
  for (const part of h3Parts) {
    const closeIdx = part.search(/<\/h3>/i);
    const titleRaw = closeIdx >= 0 ? part.slice(0, closeIdx) : part.slice(0, 120);
    const bodyRaw = closeIdx >= 0 ? part.slice(closeIdx) : '';
    const name = stripTags(titleRaw).replace(/\s+/g, ' ').trim();
    if (!name || name.length < 3 || name.length > 80) continue;
    if (/^(popular services|service menu|book online|opening hours)/i.test(name)) continue;

    const bodyText = stripTags(bodyRaw);
    const priceMatch = bodyText.match(/\$\s*(\d+(?:\.\d{2})?)/);
    const durMinMatch = bodyText.match(/(\d+)\s*(?:min|mins|minutes)/i);
    const durHourMatch = bodyText.match(/(\d+)\s*(?:hr|hour|hours)/i);
    const price = priceMatch ? Number(priceMatch[1]) : null;
    let durationMinutes = durMinMatch ? Number(durMinMatch[1]) : null;
    if (!Number.isFinite(durationMinutes) && durHourMatch) {
      durationMinutes = Number(durHourMatch[1]) * 60;
    }

    if (!Number.isFinite(price) || price <= 0) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      name,
      price,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
      description: '',
    });
    if (offers.length >= 48) break;
  }

  if (offers.length) return offers;

  return extractMenuLinesFromHtml(html);
}

function stripTags(fragment) {
  return String(fragment ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url) {
  if (typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CardbeyDiscoveryBot/1.0 (+https://cardbey.com)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} businessName
 * @param {string} [location]
 * @returns {Promise<string|null>}
 */
export async function discoverBookwellVenueUrl(businessName, location) {
  if (!businessName) return null;
  const locSlug = bookwellLocationSlug(location);

  for (const path of BOOKWELL_BEAUTY_LISTING_PATHS) {
    const listingUrl = `${BOOKWELL_ORIGIN}/book/${path}/${locSlug}`;
    const html = await fetchHtml(listingUrl);
    if (!html) continue;
    const venueUrl = findBookwellVenueInListingHtml(html, businessName);
    if (venueUrl) return venueUrl;
  }

  return null;
}

/**
 * @param {string} businessName
 * @param {string} [location]
 * @param {string} [category]
 * @returns {Promise<import('./types.js').DiscoveredSource|null>}
 */
export async function discoverBookwellVenueSource(businessName, location, category) {
  if (!isBeautyBookingCategory(category, businessName)) return null;

  const venueUrl = await discoverBookwellVenueUrl(businessName, location);
  if (!venueUrl) return null;

  const html = await fetchHtml(venueUrl);
  if (!html) return null;

  const offers = extractOffersFromBookwellHtml(html);
  if (!offers.length) return null;

  const addressMatch = stripTags(html).match(
    /\d+[^,\n]{3,60},\s*[A-Za-z][A-Za-z\s]+(?:\s+\d{4})?/,
  );

  return {
    sourceType: 'booking_platform',
    sourceUrl: venueUrl,
    raw: {
      name: businessName,
      businessName,
      website: venueUrl,
      location: addressMatch?.[0]?.trim() ?? location ?? null,
      address: addressMatch?.[0]?.trim() ?? null,
      offers,
      discoveryVia: 'bookwell_listing',
    },
    priority: 0,
  };
}
