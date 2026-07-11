/**
 * Discover Australian beauty/service venues on Bookwell when no website is supplied.
 * Bookwell listing pages are public and link to venue pages with scrapeable service menus.
 */

import { discoverFreshaVenueOffers } from './freshaVenueDiscovery.js';
import { extractMenuLinesFromHtml } from './websiteMenuHtmlExtract.js';

const BOOKWELL_ORIGIN = 'https://www.bookwell.com.au';
const FETCH_TIMEOUT_MS = 8000;
const MAX_OFFERS = 120;
const SPARSE_MENU_THRESHOLD = 8;

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

/** Nearby suburb probes when a matched venue exposes only a stub menu. */
const BOOKWELL_SIBLING_SUBURBS = [
  ['south-yarra', '3141'],
  ['melbourne', '3000'],
  ['prahran', '3181'],
  ['richmond', '3121'],
  ['heidelberg', '3084'],
  ['fitzroy', '3065'],
  ['brunswick', '3056'],
  ['st-kilda', '3182'],
  ['hawthorn', '3122'],
  ['williamstown', '3016'],
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
 * @param {string} businessName
 * @param {string} venueSlug
 */
export function bookwellVenueBrandSlug(businessName, venueSlug) {
  const fromName = slugifyBusinessName(businessName);
  if (!venueSlug) return fromName;
  if (venueSlug === fromName) return fromName;

  const parts = String(venueSlug).split('-');
  let best = fromName;
  for (let len = parts.length - 1; len >= 1; len -= 1) {
    const candidate = parts.slice(0, len).join('-');
    if (!venueSlugMatchesName(businessName, candidate)) continue;
    if (candidate.length > best.length) best = candidate;
    break;
  }

  return best;
}

/**
 * Find a Bookwell venue URL in a category listing HTML page.
 * @param {string} html
 * @param {string} businessName
 * @returns {string|null}
 */
export function findBookwellVenueInListingHtml(html, businessName) {
  const urls = findAllBookwellVenuesInListingHtml(html, businessName);
  return urls[0] ?? null;
}

/**
 * @param {string} html
 * @param {string} businessName
 * @returns {string[]}
 */
export function findAllBookwellVenuesInListingHtml(html, businessName) {
  if (!html || !businessName) return [];

  const urls = new Set();
  const nameLower = String(businessName).toLowerCase();
  const slug = slugifyBusinessName(businessName);

  VENUE_URL_RE.lastIndex = 0;
  let match;
  while ((match = VENUE_URL_RE.exec(html)) !== null) {
    const [, venueSlug, suburb, postcode] = match;
    if (venueSlugMatchesName(businessName, venueSlug)) {
      urls.add(`${BOOKWELL_ORIGIN}/venue/${venueSlug}/${suburb}/${postcode}`);
    }
  }

  if (html.toLowerCase().includes(nameLower) || html.toLowerCase().includes(slug.replace(/-/g, ' '))) {
    const idx = html.toLowerCase().indexOf(slug.replace(/-/g, ' '));
    const searchAt = idx >= 0 ? idx : html.toLowerCase().indexOf(nameLower);
    if (searchAt >= 0) {
      const window = html.slice(Math.max(0, searchAt - 800), searchAt + 800);
      const near = window.match(/\/venue\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d{4})/i);
      if (near && venueSlugMatchesName(businessName, near[1])) {
        urls.add(`${BOOKWELL_ORIGIN}/venue/${near[1]}/${near[2]}/${near[3]}`);
      }
    }
  }

  return [...urls];
}

/**
 * @param {string} html
 * @returns {object|null}
 */
export function extractBookwellVenueFromNextData(html) {
  const next = parseBookwellNextData(html);
  if (!next?.props?.graphqlCache) return null;

  for (const entry of Object.values(next.props.graphqlCache)) {
    if (entry?.data?.venue) return entry.data.venue;
  }

  return null;
}

/**
 * @param {string} html
 * @returns {Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>}
 */
export function extractOffersFromBookwellNextData(html) {
  const venue = extractBookwellVenueFromNextData(html);
  if (!venue || !Array.isArray(venue.headings)) return [];

  const offers = [];
  const seen = new Set();

  for (const heading of venue.headings) {
    for (const service of heading.services ?? []) {
      const offer = mapBookwellServiceToOffer(service);
      if (!offer) continue;
      const key = offer.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(offer);
      if (offers.length >= MAX_OFFERS) return offers;
    }
  }

  return offers;
}

/**
 * Parse Bookwell venue page services from embedded Next.js data and HTML blocks.
 * @param {string} html
 * @returns {Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>}
 */
export function extractOffersFromBookwellHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const fromNext = extractOffersFromBookwellNextData(html);
  const fromHtml = extractOffersFromBookwellHtmlBlocks(html);
  return mergeBookwellOffers(fromNext, fromHtml);
}

/**
 * @param {string} html
 * @returns {Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>}
 */
function extractOffersFromBookwellHtmlBlocks(html) {
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
    if (offers.length >= MAX_OFFERS) break;
  }

  if (offers.length) return offers;
  return extractMenuLinesFromHtml(html);
}

/**
 * @param {unknown} service
 */
function mapBookwellServiceToOffer(service) {
  const name = stripTags(service?.name).replace(/\s+/g, ' ').trim();
  if (!name || name.length < 3 || name.length > 100) return null;

  const format = service?.pricing?.priceTotal?.price?.format;
  const priceMatch = String(format ?? '').match(/\$?\s*(\d+(?:\.\d{2})?)/);
  const price = priceMatch ? Number(priceMatch[1]) : null;
  if (!Number.isFinite(price) || price <= 0) return null;

  const duration = Number(service?.duration);
  const description = stripTags(service?.description).replace(/\s+/g, ' ').trim();

  return {
    name,
    price,
    durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : null,
    description: description || '',
  };
}

/**
 * @param {Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>} primary
 * @param {Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>} secondary
 */
function mergeBookwellOffers(primary, secondary) {
  const merged = [];
  const seen = new Set();

  for (const offer of [...primary, ...secondary]) {
    const key = offer.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(offer);
    if (merged.length >= MAX_OFFERS) break;
  }

  return merged;
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

/**
 * @param {string} html
 */
function parseBookwellNextData(html) {
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nextMatch) return null;
  try {
    return JSON.parse(nextMatch[1]);
  } catch {
    return null;
  }
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
 * @returns {Promise<string[]>}
 */
export async function discoverBookwellVenueUrls(businessName, location) {
  if (!businessName) return [];

  const locSlug = bookwellLocationSlug(location);
  const listingLocations = new Set([locSlug, 'melbourne', 'south-yarra']);
  const urls = new Set();

  for (const listingLocation of listingLocations) {
    for (const path of BOOKWELL_BEAUTY_LISTING_PATHS) {
      const listingUrl = `${BOOKWELL_ORIGIN}/book/${path}/${listingLocation}`;
      const html = await fetchHtml(listingUrl);
      if (!html) continue;
      for (const venueUrl of findAllBookwellVenuesInListingHtml(html, businessName)) {
        urls.add(venueUrl);
      }
    }
  }

  return [...urls];
}

/**
 * @param {string} businessName
 * @param {string} primaryVenueUrl
 * @returns {string[]}
 */
export function buildBookwellSiblingVenueUrls(businessName, primaryVenueUrl) {
  const match = String(primaryVenueUrl).match(/\/venue\/([a-z0-9-]+)\//i);
  if (!match) return [];

  const brandSlug = bookwellVenueBrandSlug(businessName, match[1]);
  const urls = new Set();

  for (const [suburb, postcode] of BOOKWELL_SIBLING_SUBURBS) {
    urls.add(`${BOOKWELL_ORIGIN}/venue/${brandSlug}-${suburb}/${suburb}/${postcode}`);
  }

  return [...urls];
}

/**
 * @param {string} businessName
 * @param {string} [location]
 * @returns {Promise<string|null>}
 */
export async function discoverBookwellVenueUrl(businessName, location) {
  const urls = await discoverBookwellVenueUrls(businessName, location);
  return urls[0] ?? null;
}

/**
 * @param {string} businessName
 * @param {string} venueUrl
 * @returns {Promise<{ venueUrl: string; html: string; venue: object|null; offers: Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }> }|null>}
 */
async function loadBookwellVenueCandidate(businessName, venueUrl) {
  const html = await fetchHtml(venueUrl);
  if (!html) return null;

  const venue = extractBookwellVenueFromNextData(html);
  const venueSlug = venueUrl.match(/\/venue\/([a-z0-9-]+)\//i)?.[1] ?? null;
  if (!venueSlug || !venueSlugMatchesName(businessName, venueSlug)) return null;
  if (!venue?.name && !html.includes('__NEXT_DATA__')) return null;

  const offers = extractOffersFromBookwellHtml(html);
  if (!offers.length) return null;

  return { venueUrl, html, venue, offers };
}

/**
 * @param {string} businessName
 * @param {string[]} venueUrls
 * @returns {Promise<{ venueUrl: string; html: string; venue: object|null; offers: Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>; discoveryVia: string; menuSourceUrl?: string }|null>}
 */
async function pickRichestBookwellVenue(businessName, venueUrls) {
  let best = null;

  for (const venueUrl of venueUrls) {
    const candidate = await loadBookwellVenueCandidate(businessName, venueUrl);
    if (!candidate) continue;
    if (!best || candidate.offers.length > best.offers.length) {
      best = candidate;
    }
  }

  if (!best) return null;

  const discoveryVia =
    best.venueUrl === venueUrls[0] ? 'bookwell_listing' : 'bookwell_sibling_venue';

  return {
    ...best,
    discoveryVia,
    menuSourceUrl: best.venueUrl,
  };
}

/**
 * @param {{ offers: Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>; venue: object|null; discoveryVia: string; menuSourceUrl?: string }} selected
 */
async function supplementSparseBookwellMenu(selected) {
  if (selected.offers.length >= SPARSE_MENU_THRESHOLD) return selected;

  const freshaUrl = selected.venue?.freshaUrl ?? null;
  if (freshaUrl) {
    const freshaOffers = await discoverFreshaVenueOffers(freshaUrl);
    if (freshaOffers.length > selected.offers.length) {
      return {
        ...selected,
        offers: freshaOffers,
        discoveryVia: 'fresha_supplement',
        menuSourceUrl: freshaUrl,
      };
    }
  }

  return selected;
}

/**
 * @param {string} businessName
 * @param {string} [location]
 * @param {string} [category]
 * @returns {Promise<import('./types.js').DiscoveredSource|null>}
 */
export async function discoverBookwellVenueSource(businessName, location, category) {
  if (!isBeautyBookingCategory(category, businessName)) return null;

  const listingUrls = await discoverBookwellVenueUrls(businessName, location);
  let candidateUrls = [...listingUrls];

  let selected = await pickRichestBookwellVenue(businessName, candidateUrls);
  if (!selected && listingUrls.length) {
    candidateUrls = [
      ...candidateUrls,
      ...buildBookwellSiblingVenueUrls(businessName, listingUrls[0]),
    ];
    selected = await pickRichestBookwellVenue(businessName, [...new Set(candidateUrls)]);
  } else if (selected && selected.offers.length < SPARSE_MENU_THRESHOLD && listingUrls.length) {
    candidateUrls = [
      ...candidateUrls,
      ...buildBookwellSiblingVenueUrls(businessName, listingUrls[0]),
    ];
    selected = await pickRichestBookwellVenue(businessName, [...new Set(candidateUrls)]);
  }

  if (!selected) return null;

  selected = await supplementSparseBookwellMenu(selected);

  const addressMatch = stripTags(selected.html).match(
    /\d+[^,\n]{3,60},\s*[A-Za-z][A-Za-z\s]+(?:\s+\d{4})?/,
  );
  const venueAddress = selected.venue?.displayAddress ?? null;

  return {
    sourceType: 'booking_platform',
    sourceUrl: listingUrls[0] ?? selected.venueUrl,
    raw: {
      name: businessName,
      businessName,
      website: listingUrls[0] ?? selected.venueUrl,
      location: venueAddress ?? addressMatch?.[0]?.trim() ?? location ?? null,
      address: venueAddress ?? addressMatch?.[0]?.trim() ?? null,
      offers: selected.offers,
      discoveryVia: selected.discoveryVia,
      menuSourceUrl: selected.menuSourceUrl ?? selected.venueUrl,
      migratedToFresha: Boolean(selected.venue?.migratedToFresha),
      freshaUrl: selected.venue?.freshaUrl ?? null,
    },
    priority: 0,
  };
}
