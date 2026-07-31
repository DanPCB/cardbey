/**
 * Runtime JS sibling for Node without TS remapping.
 * Keep behavior aligned with businessDiscoverySources.ts.
 *
 * ETHICS / SAFETY:
 * - Google data ONLY via the official Places API (used when GOOGLE_PLACES_API_KEY is set).
 * - Website / schema.org extraction ONLY runs against URLs the user explicitly supplies.
 */

import { createAttribution } from './businessSourceAttribution.runtime.js';
import { cleanString, normalizeWebsite } from './businessDataNormalizer.runtime.js';
import {
  extractMenuLinesFromHtml,
  extractOffersFromSchemaBlocks,
} from '../storeCreationResearch/websiteMenuHtmlExtract.js';

const FETCH_TIMEOUT_MS = 8000;

const GOOGLE_PLACES_NEW_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PLACES_NEW_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.location',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.nationalPhoneNumber',
].join(',');

const GOOGLE_PLACES_NEW_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'websiteUri',
  'nationalPhoneNumber',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
  'googleMapsUri',
].join(',');

/** @type {'new' | 'legacy' | 'disabled' | null} */
let lastGooglePlacesApiMode = null;

/** Last non-fatal Google Places API status for debugger / logs. */
let lastGooglePlacesApiStatus = null;

export function getGooglePlacesApiMode() {
  if (!isGooglePlacesConfigured()) return 'disabled';
  return lastGooglePlacesApiMode ?? 'new';
}

export function getGooglePlacesApiStatus() {
  return lastGooglePlacesApiStatus;
}

function getGooglePlacesApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !String(key).trim()) return null;
  return String(key).trim();
}

function displayNameText(value) {
  if (!value || typeof value !== 'object') return null;
  const text = value.text;
  return cleanString(typeof text === 'string' ? text : null);
}

function mapNewPlaceRow(place) {
  const placeId = cleanString(place.id);
  const sourceUrl =
    cleanString(place.googleMapsUri) ??
    (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null);
  const types = Array.isArray(place.types) ? place.types : [];
  return {
    source: 'google_places',
    attribution: createAttribution({
      source: 'google_places',
      sourceUrl,
      sourceId: placeId,
    }),
    raw: {
      name: displayNameText(place.displayName),
      businessName: displayNameText(place.displayName),
      category: types.length ? cleanString(String(types[0]).replace(/_/g, ' ')) : null,
      address: cleanString(place.formattedAddress),
      location: cleanString(place.formattedAddress),
      phone: cleanString(place.nationalPhoneNumber),
      website: normalizeWebsite(place.websiteUri),
      rating: typeof place.rating === 'number' ? place.rating : null,
      reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
      lat:
        typeof place.location?.latitude === 'number' ? place.location.latitude : null,
      lng:
        typeof place.location?.longitude === 'number' ? place.location.longitude : null,
      openingHours: Array.isArray(place.regularOpeningHours?.weekdayDescriptions)
        ? { weekday_text: place.regularOpeningHours.weekdayDescriptions }
        : null,
      sourceId: placeId,
      placeId,
      googleMapsUri: cleanString(place.googleMapsUri),
      discoveryVia: 'google_places_new',
    },
  };
}

function mapLegacyPlaceRow(r) {
  const placeId = cleanString(r.place_id);
  const sourceUrl = placeId
    ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
    : null;
  const geometry = r.geometry;
  const openingHours = r.opening_hours;
  return {
    source: 'google_places',
    attribution: createAttribution({
      source: 'google_places',
      sourceUrl,
      sourceId: placeId,
    }),
    raw: {
      name: cleanString(r.name),
      category: Array.isArray(r.types) ? cleanString(String(r.types[0]).replace(/_/g, ' ')) : null,
      address: cleanString(r.formatted_address) ?? cleanString(r.vicinity),
      rating: typeof r.rating === 'number' ? r.rating : null,
      reviewCount: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      lat: geometry?.location?.lat ?? null,
      lng: geometry?.location?.lng ?? null,
      location: cleanString(r.formatted_address),
      openingHours: openingHours?.weekday_text ? { weekday_text: openingHours.weekday_text } : null,
      sourceId: placeId,
      placeId,
      discoveryVia: 'google_places_legacy',
    },
  };
}

async function searchGooglePlacesNew(query, location) {
  const key = getGooglePlacesApiKey();
  if (!key) return [];

  const textQuery = [query, location, 'Australia'].filter(Boolean).join(' ').trim();
  const res = await fetchWithTimeout(GOOGLE_PLACES_NEW_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': GOOGLE_PLACES_NEW_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      regionCode: 'AU',
      pageSize: 10,
    }),
  });
  if (!res || !res.ok) {
    lastGooglePlacesApiStatus = res ? `http_${res.status}` : 'network_error';
    return [];
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    lastGooglePlacesApiStatus = 'invalid_json';
    return [];
  }
  if (json?.error && typeof json.error === 'object') {
    const message = json.error.message;
    lastGooglePlacesApiStatus = cleanString(message) ?? 'api_error';
    return [];
  }
  const places = Array.isArray(json?.places) ? json.places : [];
  lastGooglePlacesApiStatus = places.length ? 'OK' : 'ZERO_RESULTS';
  lastGooglePlacesApiMode = 'new';
  return places
    .filter((row) => Boolean(row && typeof row === 'object'))
    .slice(0, 10)
    .map((row) => mapNewPlaceRow(row));
}

async function searchGooglePlacesLegacy(query, location) {
  const key = getGooglePlacesApiKey();
  if (!key) return [];
  const q = [query, location].filter(Boolean).join(' ').trim();
  if (!q) return [];

  const url =
    'https://maps.googleapis.com/maps/api/place/textsearch/json' +
    `?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;

  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) {
    lastGooglePlacesApiStatus = res ? `legacy_http_${res.status}` : 'legacy_network_error';
    return [];
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    lastGooglePlacesApiStatus = 'legacy_invalid_json';
    return [];
  }
  const status = cleanString(json?.status);
  if (status && status !== 'OK' && status !== 'ZERO_RESULTS') {
    lastGooglePlacesApiStatus = status;
    if (process.env.NODE_ENV !== 'production' && status === 'REQUEST_DENIED') {
      console.warn(
        '[GooglePlaces] Legacy Places API denied. Enable "Places API (New)" in Google Cloud Console.',
      );
    }
    return [];
  }
  const results = Array.isArray(json?.results) ? json.results : [];
  lastGooglePlacesApiStatus = results.length ? 'OK' : 'ZERO_RESULTS';
  lastGooglePlacesApiMode = 'legacy';
  return results
    .filter((row) => Boolean(row && typeof row === 'object'))
    .slice(0, 10)
    .map((row) => mapLegacyPlaceRow(row));
}

function getFetch() {
  return typeof fetch === 'function' ? fetch : null;
}

async function fetchWithTimeout(url, init) {
  const f = getFetch();
  if (!f) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await f(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function isGooglePlacesConfigured() {
  return Boolean(getGooglePlacesApiKey());
}

/**
 * Text search via Places API (New), with legacy fallback.
 * Returns [] when not configured or on error (never throws).
 */
export async function searchGooglePlaces(query, location) {
  if (!isGooglePlacesConfigured()) {
    lastGooglePlacesApiMode = 'disabled';
    lastGooglePlacesApiStatus = 'not_configured';
    return [];
  }

  const fromNew = await searchGooglePlacesNew(query, location);
  if (fromNew.length) return fromNew;
  if (lastGooglePlacesApiStatus === 'ZERO_RESULTS') return [];

  return searchGooglePlacesLegacy(query, location);
}

async function fetchGooglePlaceDetailsNew(placeId) {
  const key = getGooglePlacesApiKey();
  if (!key) return null;
  const id = cleanString(placeId);
  if (!id) return null;

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': GOOGLE_PLACES_NEW_DETAILS_FIELD_MASK,
    },
  });
  if (!res || !res.ok) return null;
  let place = null;
  try {
    place = await res.json();
  } catch {
    return null;
  }
  if (!place || typeof place !== 'object') return null;
  if (place.error) return null;

  const weekdayDescriptions = place.regularOpeningHours?.weekdayDescriptions;

  return {
    name: displayNameText(place.displayName),
    businessName: displayNameText(place.displayName),
    website: normalizeWebsite(place.websiteUri),
    phone: cleanString(place.nationalPhoneNumber),
    address: cleanString(place.formattedAddress),
    location: cleanString(place.formattedAddress),
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    openingHours: Array.isArray(weekdayDescriptions) ? { weekday_text: weekdayDescriptions } : null,
    sourceId: id,
    placeId: id,
    googleMapsUri: cleanString(place.googleMapsUri),
    discoveryVia: 'google_places_new',
  };
}

async function fetchGooglePlaceDetailsLegacy(placeId) {
  const key = getGooglePlacesApiKey();
  if (!key) return null;
  const id = cleanString(placeId);
  if (!id) return null;
  const url =
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(id)}` +
    '&fields=name,website,formatted_phone_number,opening_hours,rating,user_ratings_total,formatted_address,url' +
    `&key=${encodeURIComponent(key)}`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  let json = null;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const r = json?.result;
  if (!r || typeof r !== 'object') return null;
  const openingHours = r.opening_hours;
  return {
    name: cleanString(r.name),
    website: normalizeWebsite(r.website),
    phone: cleanString(r.formatted_phone_number),
    address: cleanString(r.formatted_address),
    location: cleanString(r.formatted_address),
    rating: typeof r.rating === 'number' ? r.rating : null,
    reviewCount: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
    openingHours: openingHours?.weekday_text ? { weekday_text: openingHours.weekday_text } : null,
    sourceId: id,
    placeId: id,
    discoveryVia: 'google_places_legacy',
  };
}

/**
 * Place Details — resolves website + phone for a place_id (New API first).
 */
export async function fetchGooglePlaceDetails(placeId) {
  if (!isGooglePlacesConfigured()) return null;
  const fromNew = await fetchGooglePlaceDetailsNew(placeId);
  if (fromNew) return fromNew;
  return fetchGooglePlaceDetailsLegacy(placeId);
}

function extractJsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[1]?.trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore malformed blocks
    }
  }
  return out;
}

function pickLocalBusinessNode(blocks) {
  const isBiz = (t) => {
    const types = Array.isArray(t) ? t : [t];
    return types.some(
      (x) =>
        typeof x === 'string' &&
        /(LocalBusiness|Restaurant|Store|Organization|FoodEstablishment|Cafe|BarOrPub|BeautySalon|HairSalon)/i.test(
          x,
        ),
    );
  };
  for (const b of blocks) {
    if (b && isBiz(b['@type'])) return b;
    if (Array.isArray(b?.['@graph'])) {
      const node = b['@graph'].find((n) => n && isBiz(n['@type']));
      if (node) return node;
    }
  }
  return null;
}

function metaContent(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(html);
  return m ? cleanString(m[1]) : null;
}

function titleTag(html) {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? cleanString(m[1]) : null;
}

function flattenAddress(addr) {
  if (!addr) return null;
  if (typeof addr === 'string') return cleanString(addr);
  const parts = [
    addr.streetAddress,
    addr.addressLocality,
    addr.addressRegion,
    addr.postalCode,
    addr.addressCountry,
  ]
    .map((p) => cleanString(p))
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Fetch a user-supplied URL and extract business facts from schema.org JSON-LD
 * (preferred) or OpenGraph/title meta (fallback). Returns [] on failure.
 */
export async function extractFromWebsite(websiteUrl) {
  const normalized = normalizeWebsite(websiteUrl);
  if (!normalized) return [];

  const res = await fetchWithTimeout(normalized, {
    headers: { 'User-Agent': 'CardbeyDiscoveryBot/1.0 (+https://cardbey.com)' },
  });
  if (!res || !res.ok) return [];
  let html = '';
  try {
    html = await res.text();
  } catch {
    return [];
  }
  if (!html) return [];

  const blocks = extractJsonLdBlocks(html);
  const node = pickLocalBusinessNode(blocks);
  const schemaOffers = extractOffersFromSchemaBlocks(blocks);
  const htmlMenuLines = extractMenuLinesFromHtml(html);
  const mergedOffers = [
    ...schemaOffers,
    ...htmlMenuLines.map((line) => ({
      name: line.name,
      price: line.price,
      description: line.description,
      durationMinutes: line.durationMinutes,
    })),
  ];

  if (node) {
    const phone = cleanString(node.telephone);
    const sameAs = Array.isArray(node.sameAs)
      ? node.sameAs.map((s) => cleanString(s)).filter(Boolean)
      : [];
    const socialLinks = {};
    for (const link of sameAs) {
      if (!link) continue;
      if (/instagram\.com/i.test(link)) socialLinks.instagram = link;
      else if (/facebook\.com/i.test(link)) socialLinks.facebook = link;
      else if (/tiktok\.com/i.test(link)) socialLinks.tiktok = link;
      else if (/(twitter|x)\.com/i.test(link)) socialLinks.x = link;
      else if (/youtube\.com/i.test(link)) socialLinks.youtube = link;
      else if (/linkedin\.com/i.test(link)) socialLinks.linkedin = link;
    }
    const geo = node.geo || {};
    return [
      {
        source: 'schema_org',
        attribution: createAttribution({ source: 'schema_org', sourceUrl: normalized }),
        raw: {
          name: cleanString(node.name),
          category: Array.isArray(node['@type'])
            ? cleanString(node['@type'][0])
            : cleanString(node['@type']),
          address: flattenAddress(node.address),
          location: flattenAddress(node.address),
          phone,
          website: normalizeWebsite(node.url) ?? normalized,
          rating:
            typeof node.aggregateRating?.ratingValue === 'string'
              ? Number(node.aggregateRating.ratingValue) || null
              : node.aggregateRating?.ratingValue ?? null,
          reviewCount:
            typeof node.aggregateRating?.reviewCount === 'string'
              ? Number(node.aggregateRating.reviewCount) || null
              : node.aggregateRating?.reviewCount ?? null,
          lat: typeof geo.latitude === 'number' ? geo.latitude : Number(geo.latitude) || null,
          lng: typeof geo.longitude === 'number' ? geo.longitude : Number(geo.longitude) || null,
          openingHours: node.openingHours
            ? { lines: Array.isArray(node.openingHours) ? node.openingHours : [node.openingHours] }
            : null,
          photos: node.image
            ? (Array.isArray(node.image) ? node.image : [node.image]).filter(Boolean)
            : [],
          socialLinks: Object.keys(socialLinks).length ? socialLinks : undefined,
          ...(mergedOffers.length ? { offers: mergedOffers } : {}),
        },
      },
    ];
  }

  const ogName = metaContent(html, 'og:site_name') ?? metaContent(html, 'og:title') ?? titleTag(html);
  if (!ogName && !mergedOffers.length) return [];
  return [
    {
      source: 'website',
      attribution: createAttribution({ source: 'website', sourceUrl: normalized }),
      raw: {
        name: ogName ?? null,
        category: null,
        website: normalized,
        location: metaContent(html, 'og:locality'),
        photos: metaContent(html, 'og:image') ? [metaContent(html, 'og:image')] : [],
        ...(mergedOffers.length ? { offers: mergedOffers } : {}),
      },
    },
  ];
}

export function fromManualInput(fields, source = 'manual', sourceUrl = null) {
  return {
    source,
    attribution: createAttribution({ source, sourceUrl }),
    raw: { ...fields },
  };
}
