/**
 * License guard for third-party music (Pixabay).
 */

export const PIXABAY_MUSIC_LICENSE = 'Pixabay Content License';

export type NormalizedMusicTrack = {
  provider: 'pixabay';
  providerTrackId: string;
  title: string;
  duration: number | null;
  genre: string | null;
  mood: string | null;
  tags: string[];
  previewUrl: string;
  downloadUrl: string;
  attribution: string;
  license: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown>;
};

export function isPixabayMusicEnabled(): boolean {
  const flag = String(process.env.ENABLE_PIXABAY_MUSIC ?? '').trim().toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  if (!process.env.PIXABAY_API_KEY?.trim()) return false;
  if (flag === 'true' || flag === '1') return true;
  return Boolean(process.env.PIXABAY_API_KEY?.trim());
}

export function assertPixabayMusicConfigured(): { ok: true } | { ok: false; code: string; message: string } {
  if (!isPixabayMusicEnabled()) {
    return {
      ok: false,
      code: 'PIXABAY_MUSIC_DISABLED',
      message: 'Pixabay music search is not enabled. Set ENABLE_PIXABAY_MUSIC=true and PIXABAY_API_KEY.',
    };
  }
  if (!process.env.PIXABAY_API_KEY?.trim()) {
    return {
      ok: false,
      code: 'PIXABAY_API_KEY_MISSING',
      message: 'PIXABAY_API_KEY is required for Pixabay music search.',
    };
  }
  return { ok: true };
}

export function isAllowedMusicTrack(track: Partial<NormalizedMusicTrack> | null | undefined): boolean {
  if (!track) return false;
  if (track.provider !== 'pixabay') return false;
  if (!track.providerTrackId?.trim()) return false;
  if (!track.license?.trim()) return false;
  if (!track.previewUrl?.trim() && !track.downloadUrl?.trim()) return false;
  if (!track.sourceUrl?.trim()) return false;
  return true;
}

export function filterAllowedMusicTracks(
  tracks: NormalizedMusicTrack[],
): NormalizedMusicTrack[] {
  return tracks.filter(isAllowedMusicTrack);
}

export function attachMusicAttestation(track: NormalizedMusicTrack): NormalizedMusicTrack {
  return {
    ...track,
    license: track.license || PIXABAY_MUSIC_LICENSE,
    attribution: track.attribution || `Music from Pixabay — ${track.title}`,
    metadata: {
      ...track.metadata,
      cardbeyMusicPolicy: {
        ownershipClaim: false,
        providerAttributionRequired: true,
        allowedUse: ['draft_preview', 'generated_promo', 'playlist_background'],
      },
    },
  };
}
