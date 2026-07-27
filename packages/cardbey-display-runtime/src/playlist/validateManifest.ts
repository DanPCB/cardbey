import { displayError } from '../errors/displayError.js';
import type { DisplayManifest } from './displayManifest.js';

export function validateManifest(manifest: DisplayManifest): DisplayManifest {
  if (!manifest?.playlist?.id) {
    throw displayError('DISPLAY_PLAYLIST_INVALID', 'Manifest missing playlist.id', {
      retryable: false,
    });
  }
  if (!Array.isArray(manifest.playlist.items)) {
    throw displayError('DISPLAY_PLAYLIST_INVALID', 'Manifest items must be an array', {
      retryable: false,
    });
  }
  if (manifest.playlist.items.length === 0) {
    throw displayError('DISPLAY_PLAYLIST_EMPTY', 'Manifest has no playable items', {
      retryable: false,
    });
  }
  for (const item of manifest.playlist.items) {
    if (!item.id || !item.url || !item.type) {
      throw displayError('DISPLAY_PLAYLIST_INVALID', 'Manifest item missing id/url/type', {
        retryable: false,
        context: { itemId: item?.id },
      });
    }
    if (item.durationMs <= 0) {
      throw displayError('DISPLAY_PLAYLIST_INVALID', 'Manifest item has invalid durationMs', {
        retryable: false,
        context: { itemId: item.id },
      });
    }
  }
  return manifest;
}
