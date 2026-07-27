import type { DisplayManifest, DisplayManifestItem } from './displayManifest.js';

export type PlaylistSequencerState = {
  manifestRevision: string | number;
  playlistId: string;
  itemIds: string[];
  index: number;
  loop: boolean;
  exhausted: boolean;
};

export type PlaylistSequencer = {
  getState(): PlaylistSequencerState;
  current(): DisplayManifestItem | null;
  next(): DisplayManifestItem | null;
  previous(): DisplayManifestItem | null;
  skip(): DisplayManifestItem | null;
  skipFailure(): DisplayManifestItem | null;
  restart(): DisplayManifestItem | null;
  replaceManifest(manifest: DisplayManifest): DisplayManifestItem | null;
};

export function createPlaylistSequencer(manifest: DisplayManifest): PlaylistSequencer {
  let items = [...manifest.playlist.items];
  let index = items.length > 0 ? 0 : -1;
  let loop = manifest.playlist.loop !== false;
  let exhausted = items.length === 0;
  let revision = manifest.revision;
  let playlistId = manifest.playlist.id;

  const snapshot = (): PlaylistSequencerState => ({
    manifestRevision: revision,
    playlistId,
    itemIds: items.map((i) => i.id),
    index,
    loop,
    exhausted,
  });

  const at = (): DisplayManifestItem | null => {
    if (index < 0 || index >= items.length) return null;
    return items[index] ?? null;
  };

  return {
    getState: snapshot,
    current: at,
    next() {
      if (items.length === 0) {
        exhausted = true;
        return null;
      }
      if (index + 1 < items.length) {
        index += 1;
        exhausted = false;
        return at();
      }
      if (loop) {
        index = 0;
        exhausted = false;
        return at();
      }
      exhausted = true;
      return null;
    },
    previous() {
      if (items.length === 0) return null;
      if (index > 0) {
        index -= 1;
        exhausted = false;
        return at();
      }
      if (loop) {
        index = items.length - 1;
        exhausted = false;
        return at();
      }
      return at();
    },
    skip() {
      return this.next();
    },
    skipFailure() {
      return this.next();
    },
    restart() {
      if (items.length === 0) {
        index = -1;
        exhausted = true;
        return null;
      }
      index = 0;
      exhausted = false;
      return at();
    },
    replaceManifest(nextManifest: DisplayManifest) {
      const previousId = at()?.id;
      items = [...nextManifest.playlist.items];
      loop = nextManifest.playlist.loop !== false;
      revision = nextManifest.revision;
      playlistId = nextManifest.playlist.id;

      if (items.length === 0) {
        index = -1;
        exhausted = true;
        return null;
      }

      if (previousId) {
        const found = items.findIndex((i) => i.id === previousId);
        if (found >= 0) {
          index = found;
          exhausted = false;
          return at();
        }
      }
      index = 0;
      exhausted = false;
      return at();
    },
  };
}
