import { describe, it, expect, vi } from 'vitest';

vi.mock('../../engines/menu/extractMenu.js', () => {
  return {
    extractMenu: vi.fn(async () => ({
      ok: true,
      data: {
        itemsConfigured: 0,
        categories: ['Coffee'],
        items: [
          {
            name: 'Latte',
            category: 'Coffee',
            price: 5.5,
            currency: 'AUD',
            description: null,
            tags: [],
            imageUrl: null,
          },
        ],
      },
    })),
  };
});

import { extractMenu } from '../../engines/menu/extractMenu.js';
import { extractMenuFromFile } from './extractMenuFromFile.js';

describe('extractMenuFromFile (image path)', () => {
  it('uses existing menu engine for images (no Anthropic)', async () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xdb]); // jpeg-ish header bytes
    const res = await extractMenuFromFile({
      fileType: 'image',
      fileBuffer: buf,
      mimeType: 'image/jpeg',
      businessName: 'Test Cafe',
      businessType: 'Cafe',
      language: 'en',
    });

    expect(extractMenu).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0].name).toBe('Latte');
  });
});

