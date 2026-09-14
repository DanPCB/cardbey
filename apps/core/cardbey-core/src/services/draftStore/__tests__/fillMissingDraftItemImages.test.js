import { describe, it, expect, vi } from 'vitest';
import { fillMissingDraftItemImages } from '../fillMissingDraftItemImages.js';

vi.mock('../../menuVisualAgent/menuVisualAgent.ts', () => ({
  generateImageForDraftItem: vi.fn(),
}));

describe('fillMissingDraftItemImages', () => {
  it('uses item-name fallback query when primary query returns no image', async () => {
    const { generateImageForDraftItem } = await import('../../menuVisualAgent/menuVisualAgent.ts');
    generateImageForDraftItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ url: 'https://pexels.example/rose.jpg', source: 'pexels', query: 'fallback', confidence: 0.8 });

    const items = [
      {
        id: 'item_0',
        name: 'Classic Rose Bouquet',
        description: 'A dozen premium roses wrapped and ribboned.',
        imageQueryHint: 'red rose bouquet florist',
      },
    ];

    const result = await fillMissingDraftItemImages({
      items,
      storeName: 'My Flowers',
      storeType: 'product_retail',
      generationProfile: { verticalSlug: 'retail.flower', verticalGroup: 'retail' },
      maxItems: 30,
    });

    expect(result.patched).toBe(1);
    expect(items[0].imageUrl).toBe('https://pexels.example/rose.jpg');
    expect(generateImageForDraftItem).toHaveBeenCalledTimes(2);

    const primaryCall = generateImageForDraftItem.mock.calls[0];
    const fallbackCall = generateImageForDraftItem.mock.calls[1];

    expect(primaryCall[0]).toBe('Classic Rose Bouquet');
    expect(primaryCall[3].imageQueryHint).toMatch(/red rose bouquet florist/i);
    expect(fallbackCall[0]).toBe('Classic Rose Bouquet');
    expect(fallbackCall[3].imageQueryHint).toMatch(/classic rose bouquet florist/i);
  });

  it('does not fallback when primary query succeeds', async () => {
    const { generateImageForDraftItem } = await import('../../menuVisualAgent/menuVisualAgent.ts');
    generateImageForDraftItem.mockReset();
    generateImageForDraftItem.mockResolvedValue({
      url: 'https://pexels.example/rose.jpg',
      source: 'pexels',
      query: 'primary',
      confidence: 0.8,
    });

    const items = [{ id: 'item_0', name: 'Classic Rose Bouquet', imageQueryHint: 'red rose bouquet florist' }];

    const result = await fillMissingDraftItemImages({
      items,
      storeName: 'My Flowers',
      storeType: 'product_retail',
      generationProfile: { verticalSlug: 'retail.flower', verticalGroup: 'retail' },
      maxItems: 30,
    });

    expect(result.patched).toBe(1);
    expect(generateImageForDraftItem).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-transient generation errors beyond fallback', async () => {
    const { generateImageForDraftItem } = await import('../../menuVisualAgent/menuVisualAgent.ts');
    generateImageForDraftItem.mockReset();
    generateImageForDraftItem.mockResolvedValue(null);

    const items = [{ id: 'item_0', name: 'Classic Rose Bouquet' }];

    const result = await fillMissingDraftItemImages({
      items,
      storeName: 'My Flowers',
      storeType: 'product_retail',
      generationProfile: { verticalSlug: 'retail.flower', verticalGroup: 'retail' },
      maxItems: 30,
    });

    expect(result.patched).toBe(0);
    // primary attempt + one fallback attempt only
    expect(generateImageForDraftItem).toHaveBeenCalledTimes(2);
  });
});
