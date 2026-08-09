import { describe, expect, it, vi } from 'vitest';
import { wikimediaCommonsAdapter } from '../adapters/wikimediaCommonsAdapter.js';

describe('wikimediaCommonsAdapter', () => {
  it('maps MediaWiki search pages into provider-neutral hits', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        query: {
          pages: {
            '1': {
              pageid: 1,
              title: 'File:Bakery example.jpg',
              fullurl: 'https://commons.wikimedia.org/wiki/File:Bakery_example.jpg',
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/example.jpg',
                  thumburl: 'https://upload.wikimedia.org/example-thumb.jpg',
                  mime: 'image/jpeg',
                  width: 800,
                  height: 600,
                  extmetadata: {
                    LicenseShortName: { value: 'CC BY-SA 4.0' },
                    Artist: { value: 'Example Author' },
                    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                  },
                },
              ],
            },
          },
        },
      }),
    }));
    const prev = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const result = await wikimediaCommonsAdapter.search({ query: 'bakery', limit: 5 });
      expect(result.ok).toBe(true);
      expect(result.hits[0].provider).toBe('wikimedia');
      expect(result.hits[0].previewUrl).toContain('upload.wikimedia.org');
      expect(result.hits[0].license).toMatch(/CC BY-SA/i);
    } finally {
      globalThis.fetch = prev;
    }
  });
});
