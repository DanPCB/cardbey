/**
 * Permitted discovery sources.
 *
 * ETHICS / SAFETY:
 * - Google data ONLY via the official Places API (used when GOOGLE_PLACES_API_KEY is set).
 *   We never scrape Google web pages.
 * - Website / schema.org extraction ONLY runs against URLs the user explicitly supplies.
 * - Manual / social inputs come straight from the user.
 *
 * Each source returns normalized facts + an attribution so the caller can build candidates.
 */

import { createAttribution } from './businessSourceAttribution.js';
import { cleanString, normalizeWebsite } from './businessDataNormalizer.js';
import type {
  DiscoverySource,
  SourceAttribution,
} from './businessDiscoveryTypes.js';

export interface RawDiscoveryResult {
  raw: Record<string, unknown>;
  source: DiscoverySource;
  attribution: SourceAttribution;
}

const FETCH_TIMEOUT_MS = 8000;

function getFetch(): typeof fetch | null {
  return typeof fetch === 'function' ? fetch : null;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
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

// ---------------------------------------------------------------------------
// Google Places (official API only)
// ---------------------------------------------------------------------------

export function isGooglePlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACES_API_KEY.trim());
}

/**
 * Text search via the official Places API. Returns [] when not configured or on error
 * (never throws — discovery must degrade gracefully).
 */
export async function searchGooglePlaces(
  query: string,
  location?: string | null,
): Promise<RawDiscoveryResult[]> {
  if (!isGooglePlacesConfigured()) return [];
  const key = String(process.env.GOOGLE_PLACES_API_KEY);
  const q = [query, location].filter(Boolean).join(' ').trim();
  if (!q) return [];

  const url =
    'https://maps.googleapis.com/maps/api/place/textsearch/json' +
    `?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;

  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return [];
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    return [];
  }
  const results: any[] = Array.isArray(json?.results) ? json.results : [];

  return results.slice(0, 10).map((r) => {
    const placeId = cleanString(r.place_id);
    const sourceUrl = placeId
      ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
      : null;
    return {
      source: 'google_places' as const,
      attribution: createAttribution({
        source: 'google_places',
        sourceUrl,
        sourceId: placeId,
      }),
      raw: {
        name: cleanString(r.name),
        category: Array.isArray(r.types) ? cleanString(r.types[0]?.replace(/_/g, ' ')) : null,
        address: cleanString(r.formatted_address) ?? cleanString(r.vicinity),
        rating: typeof r.rating === 'number' ? r.rating : null,
        reviewCount: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
        lat: r.geometry?.location?.lat ?? null,
        lng: r.geometry?.location?.lng ?? null,
        location: cleanString(r.formatted_address),
        openingHours: r.opening_hours?.weekday_text
          ? { weekday_text: r.opening_hours.weekday_text }
          : null,
        sourceId: placeId,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Website / schema.org extraction (user-supplied URL only)
// ---------------------------------------------------------------------------

function extractJsonLdBlocks(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
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

function pickLocalBusinessNode(blocks: any[]): any | null {
  const isBiz = (t: unknown): boolean => {
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
      const node = b['@graph'].find((n: any) => n && isBiz(n['@type']));
      if (node) return node;
    }
  }
  return null;
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(html);
  return m ? cleanString(m[1]) : null;
}

function titleTag(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? cleanString(m[1]) : null;
}

function flattenAddress(addr: any): string | null {
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
export async function extractFromWebsite(websiteUrl: string): Promise<RawDiscoveryResult[]> {
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

  if (node) {
    const phone = cleanString(node.telephone);
    const sameAs = Array.isArray(node.sameAs)
      ? node.sameAs.map((s: unknown) => cleanString(s)).filter(Boolean)
      : [];
    const socialLinks: Record<string, string> = {};
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
        },
      },
    ];
  }

  // Fallback: OpenGraph / title meta — weak, but better than nothing.
  const ogName = metaContent(html, 'og:site_name') ?? metaContent(html, 'og:title') ?? titleTag(html);
  if (!ogName) return [];
  return [
    {
      source: 'website',
      attribution: createAttribution({ source: 'website', sourceUrl: normalized }),
      raw: {
        name: ogName,
        category: null,
        website: normalized,
        location: metaContent(html, 'og:locality'),
        photos: metaContent(html, 'og:image') ? [metaContent(html, 'og:image')] : [],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Manual / user-supplied facts
// ---------------------------------------------------------------------------

export function fromManualInput(
  fields: Record<string, unknown>,
  source: DiscoverySource = 'manual',
  sourceUrl: string | null = null,
): RawDiscoveryResult {
  return {
    source,
    attribution: createAttribution({ source, sourceUrl }),
    raw: { ...fields },
  };
}
