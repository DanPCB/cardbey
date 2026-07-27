/**
 * Registry of open audio sources for Cardbey Audio Library.
 */

/** @typedef {'pixabay' | 'openverse' | 'freesound' | 'jamendo' | 'ccmixter' | 'local'} AudioSourceId */

/**
 * @type {Record<string, {
 *   id: AudioSourceId;
 *   name: string;
 *   type: 'api' | 'local';
 *   apiUrl?: string;
 *   envKey?: string;
 *   openverseSource?: string;
 *   license: string;
 *   path?: string;
 * }>}
 */
export const AUDIO_SOURCES = {
  pixabay: {
    id: 'pixabay',
    name: 'Pixabay Audio',
    type: 'api',
    apiUrl: 'https://pixabay.com/api/',
    envKey: 'PIXABAY_API_KEY',
    license: 'Pixabay License (free for commercial use, no attribution)',
  },
  openverse: {
    id: 'openverse',
    name: 'Openverse',
    type: 'api',
    apiUrl: 'https://api.openverse.org/v1/audio/',
    license: 'Creative Commons (Jamendo, Freesound, and more)',
  },
  freesound: {
    id: 'freesound',
    name: 'Freesound',
    type: 'api',
    apiUrl: 'https://freesound.org/apiv2/',
    envKey: 'FREESOUND_API_KEY',
    openverseSource: 'freesound',
    license: 'Various Creative Commons (CC0, CC-BY, CC-BY-NC)',
  },
  jamendo: {
    id: 'jamendo',
    name: 'Jamendo Music',
    type: 'api',
    apiUrl: 'https://api.jamendo.com/v3.0/',
    envKey: 'JAMENDO_CLIENT_ID',
    openverseSource: 'jamendo',
    license: 'Various Creative Commons',
  },
  ccmixter: {
    id: 'ccmixter',
    name: 'ccMixter',
    type: 'api',
    apiUrl: 'https://ccmixter.org/api/',
    openverseSource: 'ccmixter',
    license: 'Creative Commons',
  },
  local: {
    id: 'local',
    name: 'Cardbey Library',
    type: 'local',
    path: '/audio/library/',
    license: 'Various (CC0, CC-BY, custom)',
  },
};

/** @param {string | null | undefined} sourceId */
export function isAudioSourceEnabled(sourceId) {
  const key = String(sourceId ?? '').trim().toLowerCase();
  if (!key || key === 'all' || key === 'local') return true;
  const cfg = AUDIO_SOURCES[key];
  if (!cfg) return false;
  if (cfg.type === 'local') return true;
  if (key === 'openverse') return true;
  if (key === 'pixabay') {
    const flag = String(process.env.ENABLE_PIXABAY_MUSIC ?? '').trim().toLowerCase();
    if (flag === 'false' || flag === '0') return false;
    return Boolean(process.env.PIXABAY_API_KEY?.trim());
  }
  if (cfg.envKey) {
    return Boolean(process.env[cfg.envKey]?.trim());
  }
  // ccmixter / sources without keys — Openverse fallback
  return true;
}

/** @returns {Array<{ id: string; name: string; enabled: boolean; type: string; license: string }>} */
export function listAudioSourcesForApi() {
  return Object.values(AUDIO_SOURCES).map((src) => ({
    id: src.id,
    name: src.name,
    enabled: isAudioSourceEnabled(src.id),
    type: src.type,
    license: src.license,
  }));
}
