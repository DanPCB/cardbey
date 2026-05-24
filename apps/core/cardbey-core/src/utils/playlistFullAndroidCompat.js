/**
 * Android Device Engine V2 expects top-level `items[]`, `state: "ready"`, and
 * per-item `mediaUrl` / `durationSeconds` (heartbeat format). Web dashboard player
 * normalizes nested `playlist.items` — TV clients often do not.
 */

/** @param {string | null | undefined} status */
export function isActivePlaylistBindingStatus(status) {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'ready' || s === 'pending' || s === 'active' || s === 'assigned';
}

/**
 * @param {Array<{ id?: string, type?: string, url?: string, durationMs?: number, order?: number, [key: string]: unknown }>} items
 */
export function formatApkPlaylistItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const durationMs = Number(item.durationMs) > 0 ? Number(item.durationMs) : 8000;
    const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
    const url = String(item.url || item.mediaUrl || '').trim();
    const typeRaw = String(item.type || 'image').toLowerCase();
    const type = typeRaw === 'video' || typeRaw === 'html' ? typeRaw : 'image';
    return {
      ...item,
      id: item.id || `item_${index}`,
      type,
      url,
      mediaUrl: url,
      durationMs,
      durationSeconds,
      order: typeof item.order === 'number' ? item.order : index,
    };
  });
}

/**
 * Mutates response in place for Android TV / Falcon clients.
 * @param {Record<string, unknown>} response
 */
export function applyAndroidPlaylistFullCompat(response) {
  const nested = response.playlist && typeof response.playlist === 'object'
    ? /** @type {{ items?: unknown[] }} */ (response.playlist).items
    : null;
  const sourceItems = Array.isArray(nested) ? nested : [];
  const apkItems = formatApkPlaylistItems(sourceItems);

  response.items = apkItems;

  if (response.playlist && typeof response.playlist === 'object') {
    /** @type {Record<string, unknown>} */ (response.playlist).items = apkItems;
  }

  if (apkItems.length > 0) {
    response.state = 'ready';
    response.message = 'Playlist ready for playback';
    response.hasPlaylist = true;
    response.itemCount = apkItems.length;
    if (response.playlist && typeof response.playlist === 'object') {
      const pl = /** @type {Record<string, unknown>} */ (response.playlist);
      response.playlistId = pl.id ?? response.playlistId;
      response.playlistName = pl.name ?? response.playlistName;
    }
  } else if (!Array.isArray(response.items)) {
    response.items = [];
  }

  return response;
}
