import { describe, expect, it } from 'vitest';
import { FakeClock } from '../src/platform/clock.js';
import type { DisplayManifest } from '../src/playlist/displayManifest.js';
import { filterManifestBySchedule, isItemActiveAt } from '../src/playlist/scheduleFilter.js';
import { createPlaylistSequencer } from '../src/playlist/sequencePlaylist.js';

const baseManifest: DisplayManifest = {
  id: 'p1',
  revision: 1,
  playlist: {
    id: 'p1',
    loop: true,
    defaultDurationMs: 8000,
    items: [
      {
        id: 'a',
        type: 'IMAGE',
        url: 'https://cdn.example.com/a.jpg',
        durationMs: 1000,
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'b',
        type: 'IMAGE',
        url: 'https://cdn.example.com/b.jpg',
        durationMs: 1000,
      },
    ],
  },
  settings: {
    muted: true,
    transition: 'NONE',
    transitionDurationMs: 0,
    fit: 'COVER',
  },
};

describe('scheduleFilter', () => {
  it('applies inclusive boundaries with injected clock', () => {
    const item = baseManifest.playlist.items[0];
    expect(isItemActiveAt(item, new Date('2025-12-31T23:59:59.000Z'))).toBe(false);
    expect(isItemActiveAt(item, new Date('2026-01-01T00:00:00.000Z'))).toBe(true);
    expect(isItemActiveAt(item, new Date('2026-01-01T12:00:00.000Z'))).toBe(true);
    expect(isItemActiveAt(item, new Date('2026-01-02T00:00:00.000Z'))).toBe(true);
    expect(isItemActiveAt(item, new Date('2026-01-02T00:00:01.000Z'))).toBe(false);
  });

  it('excludes malformed dates and does not mutate original', () => {
    const clock = new FakeClock('2026-01-01T12:00:00.000Z');
    const withBad = {
      ...baseManifest,
      playlist: {
        ...baseManifest.playlist,
        items: [
          ...baseManifest.playlist.items,
          {
            id: 'bad',
            type: 'IMAGE' as const,
            url: 'https://cdn.example.com/c.jpg',
            durationMs: 1000,
            validFrom: 'not-a-date',
          },
        ],
      },
    };
    const filtered = filterManifestBySchedule(withBad, clock);
    expect(filtered.playlist.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(withBad.playlist.items).toHaveLength(3);
  });
});

describe('playlist sequencer', () => {
  it('sequences, loops, skips, and preserves item across revision', () => {
    const seq = createPlaylistSequencer(baseManifest);
    expect(seq.current()?.id).toBe('a');
    expect(seq.next()?.id).toBe('b');
    expect(seq.next()?.id).toBe('a'); // loop
    expect(seq.skipFailure()?.id).toBe('b');

    const revised: DisplayManifest = {
      ...baseManifest,
      revision: 2,
      playlist: {
        ...baseManifest.playlist,
        items: [
          baseManifest.playlist.items[1],
          {
            id: 'c',
            type: 'IMAGE',
            url: 'https://cdn.example.com/c.jpg',
            durationMs: 1000,
          },
        ],
      },
    };
    expect(seq.replaceManifest(revised)?.id).toBe('b');
  });

  it('resets when current item removed; supports no-loop exhaustion', () => {
    const noLoop: DisplayManifest = {
      ...baseManifest,
      playlist: { ...baseManifest.playlist, loop: false, items: [baseManifest.playlist.items[0]] },
    };
    const seq = createPlaylistSequencer(noLoop);
    expect(seq.current()?.id).toBe('a');
    expect(seq.next()).toBeNull();
    expect(seq.getState().exhausted).toBe(true);

    const replaced = seq.replaceManifest({
      ...noLoop,
      revision: 3,
      playlist: {
        ...noLoop.playlist,
        items: [
          {
            id: 'z',
            type: 'IMAGE',
            url: 'https://cdn.example.com/z.jpg',
            durationMs: 1000,
          },
        ],
      },
    });
    expect(replaced?.id).toBe('z');
  });
});
