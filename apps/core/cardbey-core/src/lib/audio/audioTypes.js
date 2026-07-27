/**
 * Normalized audio track shape for Cardbey Audio Library.
 */

/**
 * @typedef {'pixabay' | 'openverse' | 'freesound' | 'jamendo' | 'ccmixter' | 'local'} AudioSourceId
 */

/**
 * @typedef {Object} NormalizedAudioTrack
 * @property {string} id
 * @property {AudioSourceId} source
 * @property {string} providerTrackId
 * @property {string} title
 * @property {number | null} duration
 * @property {string | null} genre
 * @property {string | null} mood
 * @property {string[]} tags
 * @property {string} previewUrl
 * @property {string} downloadUrl
 * @property {string} attribution
 * @property {string} license
 * @property {string} sourceUrl
 * @property {string | null} thumbnailUrl
 * @property {Record<string, unknown>} metadata
 * @property {string | null} [libraryItemId]
 * @property {string | null} [storageUrl]
 */

/**
 * @param {AudioSourceId} source
 * @param {string} providerTrackId
 */
export function buildAudioExternalId(source, providerTrackId) {
  return `${source}_${String(providerTrackId ?? '').trim()}`;
}

/**
 * @param {import('../music/musicLicensePolicy.js').NormalizedMusicTrack} track
 * @param {AudioSourceId} [sourceOverride]
 * @returns {NormalizedAudioTrack}
 */
export function musicTrackToAudioTrack(track, sourceOverride) {
  const upstream =
    sourceOverride ||
    (track.metadata?.openverse &&
    typeof track.metadata.openverse === 'object' &&
    typeof /** @type {{ provider?: string }} */ (track.metadata.openverse).provider === 'string'
      ? mapOpenverseProviderToSource(
          /** @type {{ provider?: string }} */ (track.metadata.openverse).provider,
        )
      : track.provider === 'openverse'
        ? 'openverse'
        : 'pixabay');

  return {
    id: buildAudioExternalId(upstream, track.providerTrackId),
    source: upstream,
    providerTrackId: track.providerTrackId,
    title: track.title,
    duration: track.duration,
    genre: track.genre,
    mood: track.mood,
    tags: track.tags ?? [],
    previewUrl: track.previewUrl,
    downloadUrl: track.downloadUrl,
    attribution: track.attribution,
    license: track.license,
    sourceUrl: track.sourceUrl,
    thumbnailUrl: track.thumbnailUrl,
    metadata: track.metadata ?? {},
  };
}

/** @param {string | null | undefined} provider */
export function mapOpenverseProviderToSource(provider) {
  const p = String(provider ?? '').trim().toLowerCase();
  if (p.includes('jamendo')) return 'jamendo';
  if (p.includes('freesound')) return 'freesound';
  if (p.includes('ccmixter') || p.includes('ccmixter')) return 'ccmixter';
  return 'openverse';
}

/**
 * @param {Partial<NormalizedAudioTrack> | null | undefined} track
 */
export function isAllowedAudioTrack(track) {
  if (!track) return false;
  if (!track.source?.trim()) return false;
  if (!track.providerTrackId?.trim()) return false;
  if (!track.license?.trim()) return false;
  if (!track.previewUrl?.trim() && !track.downloadUrl?.trim()) return false;
  return true;
}

/**
 * @param {NormalizedAudioTrack} track
 * @returns {NormalizedAudioTrack}
 */
export function attachAudioAttestation(track) {
  return {
    ...track,
    attribution:
      track.attribution ||
      `"${track.title}" — ${AUDIO_SOURCE_LABELS[track.source] || track.source}`,
    metadata: {
      ...track.metadata,
      cardbeyAudioPolicy: {
        ownershipClaim: false,
        providerAttributionRequired: true,
        allowedUse: ['draft_preview', 'generated_promo', 'playlist_background', 'show_video_mix'],
      },
    },
  };
}

/** @type {Record<AudioSourceId, string>} */
export const AUDIO_SOURCE_LABELS = {
  pixabay: 'Pixabay',
  openverse: 'Openverse',
  freesound: 'Freesound',
  jamendo: 'Jamendo',
  ccmixter: 'ccMixter',
  local: 'Cardbey Library',
};
