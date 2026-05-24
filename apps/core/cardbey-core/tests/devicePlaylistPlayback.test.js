import { describe, expect, it } from 'vitest';

/**
 * Mirrors playlist/full empty-state rules (unit-level, no HTTP).
 */
function resolvePlaybackState({ bindingStatus, rawItemCount, playableItemCount }) {
  let state =
    String(bindingStatus || '').trim().toLowerCase() === 'pending'
      ? 'pending_binding'
      : 'ready';

  if (rawItemCount >= 0 && playableItemCount === 0) {
    return {
      state: 'assigned_empty_playlist',
      message: 'Playlist assigned but contains no playable items',
      playlist: null,
    };
  }

  if (playableItemCount > 0 && String(bindingStatus || '').trim().toLowerCase() === 'pending') {
    state = 'ready';
  }

  return {
    state,
    message: state === 'ready' ? 'Playlist ready for playback' : state,
    playlist: playableItemCount > 0 ? { items: playableItemCount } : null,
  };
}

describe('device playlist/full playback state', () => {
  it('uses assigned_empty_playlist when bound playlist has no playable items', () => {
    const out = resolvePlaybackState({
      bindingStatus: 'pending',
      rawItemCount: 0,
      playableItemCount: 0,
    });
    expect(out.state).toBe('assigned_empty_playlist');
    expect(out.playlist).toBeNull();
  });

  it('returns items while binding is pending when playable items exist', () => {
    const out = resolvePlaybackState({
      bindingStatus: 'pending',
      rawItemCount: 1,
      playableItemCount: 1,
    });
    expect(out.state).toBe('ready');
    expect(out.playlist).not.toBeNull();
  });
});
