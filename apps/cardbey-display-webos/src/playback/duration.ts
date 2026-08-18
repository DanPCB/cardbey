import { isHlsPlaybackUrl, type DisplayManifest, type DisplayManifestItem } from '@cardbey/display-runtime';

export const MIN_IMAGE_DURATION_MS = 1_000;
export const MAX_IMAGE_DURATION_MS = 24 * 60 * 60 * 1_000;
export const SHELL_DEFAULT_IMAGE_DURATION_MS = 8_000;
export const HLS_LIVE_CARD_FALLBACK_DURATION_MS = 15_000;

export function isTimedCardItem(item: DisplayManifestItem): boolean {
  return item.type === 'IMAGE' || item.type === 'LIVE_CARD';
}

/** HLS live overlay can fall back to the timed QR card when the stream fails. */
export function canFallbackHlsToLiveCard(item: DisplayManifestItem): boolean {
  if (item.type !== 'VIDEO') return false;
  if (!item.qrValue) return false;
  return isHlsPlaybackUrl(item.url, item.mimeType);
}

export function resolveImageDurationMs(
  item: DisplayManifestItem,
  manifest: DisplayManifest,
  shellDefaultMs = SHELL_DEFAULT_IMAGE_DURATION_MS,
): number {
  const raw =
    (typeof item.durationMs === 'number' && item.durationMs > 0
      ? item.durationMs
      : undefined) ??
    (typeof manifest.playlist.defaultDurationMs === 'number' &&
    manifest.playlist.defaultDurationMs > 0
      ? manifest.playlist.defaultDurationMs
      : undefined) ??
    shellDefaultMs;

  return Math.min(MAX_IMAGE_DURATION_MS, Math.max(MIN_IMAGE_DURATION_MS, Math.floor(raw)));
}

/**
 * Video normally plays until `ended`.
 * Explicit positive durationMs is treated as a maximum display cap only.
 */
export function resolveVideoMaxDurationMs(item: DisplayManifestItem): number | undefined {
  // durationMs <= 0 means "play until ended" (no display cap).
  if (typeof item.durationMs === 'number' && item.durationMs > 0) {
    return Math.min(MAX_IMAGE_DURATION_MS, Math.max(MIN_IMAGE_DURATION_MS, Math.floor(item.durationMs)));
  }
  return undefined;
}
