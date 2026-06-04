/**
 * Pixabay video source adapter.
 *
 * API: GET https://pixabay.com/api/videos/
 *   ?key=<PIXABAY_API_KEY>&q=<query>&video_type=film&per_page=12
 * Docs: https://pixabay.com/api/docs/#api_search_videos
 *
 * Env: PIXABAY_API_KEY (required)
 */
import {
  VideoSourceNotConfiguredError,
  normalizeVideoResult,
  isValidVideoResult,
} from './VideoResult.js';

export const source = 'pixabay';

const PIXABAY_VIDEOS_URL = 'https://pixabay.com/api/videos/';

export function isConfigured() {
  return Boolean(process.env.PIXABAY_API_KEY && process.env.PIXABAY_API_KEY.trim());
}

/** @param {object} hit Raw Pixabay video hit */
function mapHit(hit) {
  const medium = hit?.videos?.medium ?? {};
  const large = hit?.videos?.large ?? {};
  const largeWidth = Number(large.width) || 0;
  return normalizeVideoResult({
    id: String(hit?.id ?? ''),
    source,
    title: hit?.tags || `Pixabay video ${hit?.id ?? ''}`,
    thumbnail_url: medium.thumbnail || '',
    video_url: medium.url || '',
    duration: hit?.duration,
    resolution: largeWidth >= 1920 ? '4K or HD' : 'HD',
    license: 'Pixabay License',
    attribution_required: true,
    tags: typeof hit?.tags === 'string'
      ? hit.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [],
  });
}

/**
 * @param {string} query
 * @param {{ perPage?: number }} [opts]
 * @returns {Promise<Array<ReturnType<typeof normalizeVideoResult>>>}
 */
export async function search(query, opts = {}) {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new VideoSourceNotConfiguredError(source);
  }

  const perPage = Math.min(200, Math.max(3, Number(opts.perPage) || 12));
  const params = new URLSearchParams({
    key: apiKey.trim(),
    q: String(query || '').slice(0, 100),
    video_type: 'film',
    per_page: String(perPage),
  });

  const res = await fetch(`${PIXABAY_VIDEOS_URL}?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Pixabay videos API error ${res.status}`);
  }

  const data = await res.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return hits.map(mapHit).filter(isValidVideoResult);
}

export default { source, isConfigured, search };
