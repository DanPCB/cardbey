/**
 * Allowed hosts for server-side provider video fetch proxy.
 */

const PEXELS_VIDEO_HOSTS = [
  'videos.pexels.com',
  'player.vimeo.com',
];

const COVERR_VIDEO_HOSTS = [
  'coverr.co',
  'cdn.coverr.co',
  'assets.coverr.co',
  'storage.coverr.co',
];

const PIXABAY_VIDEO_HOSTS = [
  'pixabay.com',
  'cdn.pixabay.com',
];

const MIXKIT_VIDEO_HOSTS = [
  'assets.mixkit.co',
  'cdn.mixkit.co',
];

/** @type {Record<string, string[]>} */
export const PROVIDER_VIDEO_HOSTS = {
  pexels: PEXELS_VIDEO_HOSTS,
  coverr: COVERR_VIDEO_HOSTS,
  pixabay: PIXABAY_VIDEO_HOSTS,
  mixkit: MIXKIT_VIDEO_HOSTS,
};

/**
 * @param {string} url
 * @param {string} [provider]
 */
export function isAllowedVideoFetchUrl(url, provider) {
  if (!url || typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  const key = provider ? String(provider).toLowerCase().trim() : '';
  if (key && PROVIDER_VIDEO_HOSTS[key]) {
    return PROVIDER_VIDEO_HOSTS[key].some((h) => host === h || host.endsWith(`.${h}`));
  }
  const all = Object.values(PROVIDER_VIDEO_HOSTS).flat();
  return all.some((h) => host === h || host.endsWith(`.${h}`));
}
