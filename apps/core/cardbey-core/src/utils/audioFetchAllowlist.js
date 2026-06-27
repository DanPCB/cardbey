/**
 * Allowed hosts for server-side licensed-audio import (Show video mix).
 */

const JAMENDO_AUDIO_HOSTS = [
  'jamendo.com',
  'www.jamendo.com',
  'storage.jamendo.com',
  'prod-1.storage.jamendo.com',
  'mp3l.jamendo.com',
];

const OPENVERSE_AUDIO_HOSTS = [
  'api.openverse.org',
];

const PIXABAY_AUDIO_HOSTS = ['cdn.pixabay.com', 'pixabay.com'];

const FREESOUND_AUDIO_HOSTS = ['cdn.freesound.org', 'freesound.org', 'www.freesound.org'];

const CCMIXTER_AUDIO_HOSTS = ['ccmixter.org', 'www.ccmixter.org', 'ccmedia.ccmixter.org'];

/** @type {string[]} */
export const AUDIO_IMPORT_HOSTS = [
  ...JAMENDO_AUDIO_HOSTS,
  ...OPENVERSE_AUDIO_HOSTS,
  ...PIXABAY_AUDIO_HOSTS,
  ...FREESOUND_AUDIO_HOSTS,
  ...CCMIXTER_AUDIO_HOSTS,
];

/** @returns {number} */
export function audioFetchMaxImportBytes() {
  const mb = Number(process.env.AUDIO_FETCH_MAX_MB ?? '25');
  if (Number.isFinite(mb) && mb > 0) return Math.round(mb * 1024 * 1024);
  return 25 * 1024 * 1024;
}

/**
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isAllowedAudioImportUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const host = new URL(rawUrl.trim()).hostname.toLowerCase();
    return AUDIO_IMPORT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}
