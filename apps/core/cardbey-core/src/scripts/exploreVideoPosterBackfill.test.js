import { describe, expect, it } from 'vitest';

/** Mirrors backfill-explore-video-posters.mjs selection logic. */
function recordsNeedingPoster(rows) {
  return rows.filter((r) => !r.thumbnailUrl?.trim());
}

describe('explore video poster backfill selection', () => {
  it('is idempotent — skips records that already have posters', () => {
    const rows = [
      { id: 'a', thumbnailUrl: '/uploads/media/stores/p1.jpg', videoUrl: '/uploads/v.mp4' },
      { id: 'b', thumbnailUrl: '  ', videoUrl: '/uploads/v2.mp4' },
      { id: 'c', thumbnailUrl: null, videoUrl: '/uploads/v3.mp4' },
    ];
    expect(recordsNeedingPoster(rows).map((r) => r.id)).toEqual(['b', 'c']);
    expect(recordsNeedingPoster([rows[0]])).toEqual([]);
  });
});
