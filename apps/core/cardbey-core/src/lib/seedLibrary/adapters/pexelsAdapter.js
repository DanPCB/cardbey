/**
 * Pexels API adapter for Seed Library ingestion.
 * API: https://www.pexels.com/api/documentation/
 * Requires PEXELS_API_KEY in env.
 */

const PEXELS_API_BASE = 'https://api.pexels.com';

/**
 * @param {string} query
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<{ photos: import('./providerAdapter.js').NormalizedPhoto[], totalResults?: number, page?: number }>}
 */
export async function searchPhotos(query, page = 1, perPage = 20) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('PEXELS_API_KEY is required');
  }

  const url = new URL('/v1/search', PEXELS_API_BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(Math.min(perPage, 80)));

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey.trim() },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pexels API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const photos = (data.photos || []).map((p) => normalizePhoto(p));

  return {
    photos,
    totalResults: data.total_results,
    page: data.page,
  };
}

function normalizePhoto(p) {
  const photographerName = p.photographer || p.alt || 'Unknown';
  const sourcePageUrl = p.url || null;
  const licenseUrl = 'https://www.pexels.com/license/';
  const attributionText = `Photo by ${photographerName} from Pexels`;

  return {
    id: String(p.id),
    url: p.src?.original || p.src?.large2x || p.src?.large || p.src?.medium || '',
    width: p.width ?? null,
    height: p.height ?? null,
    photographerName: p.photographer || null,
    photographerUrl: p.photographer_url || null,
    sourcePageUrl,
    licenseUrl,
    attributionText,
    alt: p.alt || null,
    src: p.src ? { original: p.src.original, large: p.src.large, medium: p.src.medium, small: p.src.small } : undefined,
  };
}
