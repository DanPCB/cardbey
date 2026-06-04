/**
 * Coverr video source adapter.
 *
 * API: GET https://api.coverr.co/videos
 * Docs: https://api.coverr.co/docs/videos/
 *
 * Live-verified field mapping (task spec approximations → real Coverr API):
 *   keywords=<query>     → query=<query>
 *   token=<key>          → api_key=<key>  (or Authorization: Bearer)
 *   hit.coverr_url       → hit.urls.mp4   (requires urls=true on list endpoint)
 *   hit.preview_image_url→ hit.thumbnail  (poster also available)
 *   hit.description      → hit.title || hit.description
 *
 * Run `node scripts/verify-video-sources.mjs` after setting COVERR_API_TOKEN
 * to dump a live raw hit + mapped VideoResult for confirmation.
 *   {
 *     page, pages, page_size, total,
 *     hits: [{
 *       id, title, description, thumbnail, poster,
 *       duration (float seconds), max_width, max_height, aspect_ratio,
 *       tags: [...],
 *       urls: { mp4, mp4_preview, mp4_download }   // only when urls=true
 *     }]
 *   }
 *
 * Auth: pass COVERR_API_TOKEN as the `api_key` query parameter only.
 * Note: `urls=true` is required for the list endpoint to include playable mp4 URLs.
 *
 * Env: COVERR_API_TOKEN (required)
 */
import {
  VideoSourceNotConfiguredError,
  normalizeVideoResult,
  resolutionFromWidth,
  isValidVideoResult,
} from './VideoResult.js';

export const source = 'coverr';

const COVERR_VIDEOS_URL = 'https://api.coverr.co/videos';

export function isConfigured() {
  return Boolean(process.env.COVERR_API_TOKEN && process.env.COVERR_API_TOKEN.trim());
}

/** @param {object} hit Raw Coverr video hit */
function mapHit(hit) {
  const urls = hit?.urls ?? {};
  return normalizeVideoResult({
    id: String(hit?.id ?? ''),
    source,
    title: hit?.title || hit?.description || String(hit?.id ?? ''),
    thumbnail_url: hit?.thumbnail || hit?.poster || '',
    video_url: urls.mp4 || urls.mp4_preview || urls.mp4_download || '',
    duration: hit?.duration,
    resolution: resolutionFromWidth(hit?.max_width),
    license: 'Coverr Free License',
    attribution_required: false,
    tags: Array.isArray(hit?.tags) ? hit.tags : [],
  });
}

/**
 * @param {string} query
 * @param {{ perPage?: number }} [opts]
 * @returns {Promise<Array<ReturnType<typeof normalizeVideoResult>>>}
 */
export async function search(query, opts = {}) {
  const token = process.env.COVERR_API_TOKEN;
  if (!token || !token.trim()) {
    throw new VideoSourceNotConfiguredError(source);
  }

  const pageSize = Math.min(100, Math.max(1, Number(opts.perPage) || 12));
  const params = new URLSearchParams({
    query: String(query || '').slice(0, 200),
    urls: 'true',
    page_size: String(pageSize),
    api_key: token.trim(),
  });

  const res = await fetch(`${COVERR_VIDEOS_URL}?${params.toString()}`, {
    method: 'GET',
  });

  if (!res.ok) {
    throw new Error(`Coverr videos API error ${res.status}`);
  }

  const data = await res.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return hits.map(mapHit).filter(isValidVideoResult);
}

export default { source, isConfigured, search };
