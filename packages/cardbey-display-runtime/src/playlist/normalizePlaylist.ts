import { displayError } from '../errors/displayError.js';
import { normalizeMediaUrl } from '../media/normalizeMediaUrl.js';
import type { RawPlaylistFullResponse, RawPlaylistItem } from '../api/deviceApiContracts.js';
import type {
  DisplayItemType,
  DisplayManifest,
  DisplayManifestItem,
  DisplayOrientation,
  NormalizePlaylistResult,
} from './displayManifest.js';

export type NormalizePlaylistOptions = {
  apiBaseUrl: string;
  allowInsecureLocalHttp?: boolean;
  defaultImageDurationMs?: number;
};

function resolveItems(raw: RawPlaylistFullResponse): RawPlaylistItem[] {
  if (Array.isArray(raw.items) && raw.items.length > 0) return raw.items;
  if (Array.isArray(raw.playlist?.items)) return raw.playlist!.items!;
  return [];
}

function resolveItemUrl(item: RawPlaylistItem): string | null {
  const mediaUrl = item.mediaUrl?.trim();
  if (mediaUrl) return mediaUrl;
  const url = item.url?.trim();
  if (url) return url;
  const assetUrl = item.asset?.url?.trim();
  if (assetUrl) return assetUrl;
  return null;
}

function inferType(url: string, declared?: string): DisplayItemType {
  const d = (declared || '').toLowerCase().replace(/-/g, '_');
  if (d === 'live_card') return 'LIVE_CARD';
  if (d === 'live_hls' || d === 'hls' || d === 'video') {
    return 'VIDEO';
  }
  if (d === 'image') return 'IMAGE';
  if (isHlsPlaybackUrl(url)) return 'VIDEO';
  const lower = url.toLowerCase();
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower)) return 'VIDEO';
  return 'IMAGE';
}

export function isHlsPlaybackUrl(url: string, mimeType?: string): boolean {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('mpegurl') || mime.includes('x-mpegurl')) return true;
  const lower = String(url || '').toLowerCase();
  return /\.m3u8(\?|$)/i.test(lower) || lower.includes('/manifest/video.m3u8');
}

function computeRevision(raw: RawPlaylistFullResponse): string | number {
  const p = raw.playlist;
  if (p && typeof p.rev === 'number') return p.rev;
  if (typeof raw.rev === 'number') return raw.rev;
  if (p?.version != null && p.version !== '') return p.version;
  if (raw.version != null && raw.version !== '') return raw.version;
  if (p?.updatedAt != null) return String(p.updatedAt);
  if (raw.updatedAt != null) return String(raw.updatedAt);
  return Date.now();
}

function mapOrientation(raw?: string): DisplayOrientation | undefined {
  const v = (raw || '').toLowerCase();
  if (v === 'vertical' || v === 'portrait') return 'PORTRAIT';
  if (v === 'horizontal' || v === 'landscape') return 'LANDSCAPE';
  return undefined;
}

function itemId(item: RawPlaylistItem, index: number, url: string): string {
  if (item.id && item.id.trim()) return item.id.trim();
  if (item.asset?.id && item.asset.id.trim()) return item.asset.id.trim();
  return `item_${index}_${hashShort(url)}`;
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/**
 * Normalise Device V2 playlist/full into DisplayManifest.
 * Distinguishes valid-empty from structurally invalid.
 */
export function normalizePlaylist(
  raw: RawPlaylistFullResponse,
  options: NormalizePlaylistOptions,
): NormalizePlaylistResult {
  if (!raw || typeof raw !== 'object') {
    throw displayError('DISPLAY_PLAYLIST_INVALID', 'Playlist response is not an object', {
      retryable: false,
    });
  }

  if (raw.ok === false && resolveItems(raw).length === 0) {
    throw displayError(
      'DISPLAY_PLAYLIST_INVALID',
      raw.message || raw.error || 'Playlist response ok=false',
      { retryable: false, context: { error: raw.error } },
    );
  }

  const defaultDuration = options.defaultImageDurationMs ?? 8_000;
  const rawItems = resolveItems(raw);
  const orientation = mapOrientation(raw.orientation);

  if (rawItems.length === 0) {
    return {
      kind: 'empty',
      deviceId: raw.deviceId,
      state: raw.state,
      orientation,
    };
  }

  const items: DisplayManifestItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const rawUrl = resolveItemUrl(item);
    if (!rawUrl) continue;

    let url: string;
    try {
      url = normalizeMediaUrl(rawUrl, {
        apiBaseUrl: options.apiBaseUrl,
        allowInsecureLocalHttp: options.allowInsecureLocalHttp,
      });
    } catch {
      // Skip invalid media URLs rather than failing the whole playlist
      continue;
    }

    const durationMs =
      (typeof item.durationMs === 'number' && item.durationMs > 0 && item.durationMs) ||
      (typeof item.duration === 'number' && item.duration > 0 && item.duration) ||
      defaultDuration;

    items.push({
      id: itemId(item, i, url),
      type: inferType(url, item.type),
      url,
      mimeType: item.mimeType,
      durationMs,
      validFrom: item.validFrom,
      validUntil: item.validUntil,
      checksum: item.checksum,
      muted: item.muted,
      order: typeof item.order === 'number' ? item.order : i,
      fit: 'COVER',
      qrValue: item.qrValue,
      overlayTitle: item.overlayTitle,
      overlayBadge: item.overlayBadge,
      overlayHint: item.overlayHint,
    });
  }

  if (items.length === 0) {
    return {
      kind: 'empty',
      deviceId: raw.deviceId,
      state: raw.state || 'assigned_empty_playlist',
      orientation,
    };
  }

  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const playlistId =
    raw.playlist?.id?.trim() ||
    raw.playlistId?.trim() ||
    raw.deviceId ||
    'unknown-playlist';

  const manifest: DisplayManifest = {
    id: playlistId,
    revision: computeRevision(raw),
    generatedAt: new Date().toISOString(),
    deviceId: raw.deviceId,
    state: raw.state,
    bindingStatus: raw.bindingStatus,
    playlist: {
      id: playlistId,
      name: raw.playlist?.name,
      loop: true,
      defaultDurationMs: defaultDuration,
      items,
    },
    settings: {
      orientation,
      muted: true,
      transition: 'NONE',
      transitionDurationMs: 0,
      fit: 'COVER',
    },
  };

  return { kind: 'manifest', manifest };
}
