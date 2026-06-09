/**
 * Pexels video source adapter.
 *
 * Reference adapter for the VideoSearchService. New adapters (Pixabay, Coverr,
 * Mixkit) follow this same structure:
 *   - `source`        : provider key string
 *   - `isConfigured()`: whether required env credentials are present
 *   - `search(query)` : returns Promise<VideoResult[]> (normalised)
 *
 * API: https://api.pexels.com/videos/search   (requires PEXELS_API_KEY)
 *
 * NOTE: This does not modify the legacy GET /api/assets/videos proxy in
 * routes/assets.js — it reuses the same selectPexelsVideoFile helper so video
 * file selection stays consistent across both paths.
 */
import { selectPexelsVideoFile } from '../../utils/pexelsVideoSelect.js';
import {
  VideoSourceNotConfiguredError,
  normalizeVideoResult,
  resolutionFromWidth,
  isValidVideoResult,
} from './VideoResult.js';

export const source = 'pexels';

const PEXELS_VIDEOS_SEARCH_URL = 'https://api.pexels.com/videos/search';

export function isConfigured() {
  return Boolean(process.env.PEXELS_API_KEY && process.env.PEXELS_API_KEY.trim());
}

/** @param {object} video Raw Pexels video object */
function mapVideo(video) {
  const selected = selectPexelsVideoFile(video?.video_files, { preferPortrait: true });
  if (!selected?.url) return null;
  const width = video?.width ?? selected.width;
  return normalizeVideoResult({
    id: String(video?.id ?? ''),
    source,
    title: video?.user?.name ? `Video by ${video.user.name}` : `Pexels video ${video?.id ?? ''}`,
    thumbnail_url: video?.image ?? '',
    video_url: selected.url,
    duration: video?.duration,
    resolution: resolutionFromWidth(width),
    license: 'Pexels License',
    attribution_required: false,
    tags: [],
  });
}

/**
 * @param {string} query
 * @param {{ perPage?: number }} [opts]
 * @returns {Promise<Array<ReturnType<typeof normalizeVideoResult>>>}
 */
export async function search(query, opts = {}) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new VideoSourceNotConfiguredError(source);
  }

  const perPage = Math.min(30, Math.max(1, Number(opts.perPage) || 12));
  const params = new URLSearchParams({
    query: String(query || '').slice(0, 200),
    per_page: String(perPage),
  });

  const res = await fetch(`${PEXELS_VIDEOS_SEARCH_URL}?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: apiKey.trim() },
  });

  if (!res.ok) {
    throw new Error(`Pexels videos API error ${res.status}`);
  }

  const data = await res.json();
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  return videos.map(mapVideo).filter(isValidVideoResult);
}

export default { source, isConfigured, search };
