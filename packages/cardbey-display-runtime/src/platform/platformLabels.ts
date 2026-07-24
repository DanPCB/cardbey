/**
 * Canonical platform presentation for Cardbey Display surfaces.
 * Never default unknown platforms to "Android TV".
 */

const PLATFORM_LABELS: Record<string, string> = {
  webos_tv: 'LG webOS TV',
  android_tv: 'Android TV',
  android: 'Android',
  tizen_tv: 'Samsung Tizen TV',
  fire_tv: 'Fire TV',
  browser: 'Browser',
  web: 'Web Player',
};

const GENERIC_DEVICE_NAMES = new Set([
  '',
  'android tv',
  'unnamed device',
  'unnamed',
  'device',
  'new device',
]);

export function normalizePlatformKey(platform?: string | null): string {
  return String(platform || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Human-readable platform label for UI / claim defaults. */
export function platformDisplayLabel(platform?: string | null): string {
  const key = normalizePlatformKey(platform);
  if (PLATFORM_LABELS[key]) return PLATFORM_LABELS[key];
  if (!key) return 'Display';
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isGenericDeviceDisplayName(name?: string | null): boolean {
  return GENERIC_DEVICE_NAMES.has(String(name || '').trim().toLowerCase());
}

/**
 * Prefer a real device nickname; otherwise use the platform label.
 * Prevents webOS TVs from showing a hard-coded "Android TV" claim default.
 */
export function resolveDevicePresentationName(input: {
  displayName?: string | null;
  platform?: string | null;
}): string {
  const name = String(input.displayName || '').trim();
  if (name && !isGenericDeviceDisplayName(name)) return name;
  return platformDisplayLabel(input.platform);
}

/** Map Device V2 playlist/full `state` to operator-visible codes. */
export type ManifestContentCode =
  | 'MANIFEST_READY'
  | 'NOT_ASSIGNED'
  | 'PLAYLIST_NOT_PUBLISHED'
  | 'EMPTY_PLAYLIST'
  | 'NO_SCHEDULED_ITEMS'
  | 'MEDIA_INVALID'
  | 'STORE_NOT_ASSIGNED'
  | 'MANIFEST_UNAUTHORIZED'
  | 'MANIFEST_ERROR'
  | 'DEVICE_IDENTITY_MISMATCH'
  | 'DEVICE_NOT_FOUND'
  | 'UNKNOWN';

export function mapPlaylistFullStateToContentCode(
  state?: string | null,
  opts?: { httpStatus?: number; itemCount?: number },
): ManifestContentCode {
  if (opts?.httpStatus === 404) return 'DEVICE_NOT_FOUND';
  if (opts?.httpStatus === 401 || opts?.httpStatus === 403) return 'MANIFEST_UNAUTHORIZED';
  if (opts?.itemCount && opts.itemCount > 0) return 'MANIFEST_READY';

  const s = String(state || '')
    .trim()
    .toLowerCase();
  if (!s || s === 'no_binding') return 'NOT_ASSIGNED';
  if (s === 'pending_binding' || s === 'pending') return 'PLAYLIST_NOT_PUBLISHED';
  if (s === 'assigned_empty_playlist' || s === 'empty') return 'EMPTY_PLAYLIST';
  if (s === 'outside_schedule' || s === 'no_scheduled_items') return 'NO_SCHEDULED_ITEMS';
  if (s === 'ready' || s === 'has_active_binding') {
    return opts?.itemCount === 0 ? 'EMPTY_PLAYLIST' : 'MANIFEST_READY';
  }
  if (s.includes('mismatch')) return 'DEVICE_IDENTITY_MISMATCH';
  if (s.includes('error') || s.includes('fail')) return 'MANIFEST_ERROR';
  return 'UNKNOWN';
}

export function contentCodeUserMessage(code: ManifestContentCode): string {
  switch (code) {
    case 'NOT_ASSIGNED':
      return 'This screen is connected. Assign a playlist from Cardbey.';
    case 'PLAYLIST_NOT_PUBLISHED':
      return 'Playlist assigned, but it is not ready for playback yet.';
    case 'EMPTY_PLAYLIST':
      return 'Playlist assigned, but it contains no playable content.';
    case 'NO_SCHEDULED_ITEMS':
      return 'Playlist connected. No content is scheduled for the current time.';
    case 'MEDIA_INVALID':
      return 'Content assigned, but media URLs are invalid.';
    case 'STORE_NOT_ASSIGNED':
      return 'This screen is not linked to a store yet.';
    case 'MANIFEST_UNAUTHORIZED':
      return 'Connected, but this screen is not authorized for content.';
    case 'DEVICE_IDENTITY_MISMATCH':
      return 'Connected, but device identity does not match the assigned screen.';
    case 'DEVICE_NOT_FOUND':
      return 'Connected, but the content service cannot find this screen.';
    case 'MANIFEST_ERROR':
      return 'Connected, but content could not be loaded.';
    case 'MANIFEST_READY':
      return 'Playlist ready.';
    default:
      return 'This screen is connected. Waiting for content from Cardbey.';
  }
}
