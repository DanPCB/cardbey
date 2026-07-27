import { describe, it, expect } from 'vitest';
import { publishedBusinessArtifactToPublicStore } from './publishedBusinessArtifactToPublicStore.js';

describe('publishedBusinessArtifactToPublicStore hero video', () => {
  it('maps projection video hero to public store heroVideoUrl and heroMediaType', () => {
    const store = publishedBusinessArtifactToPublicStore({
      artifactVersion: 1,
      businessId: 'biz-1',
      storeId: 'biz-1',
      slug: 'cafe',
      name: 'Cafe',
      category: 'cafe',
      status: 'published',
      publishedAt: new Date().toISOString(),
      content: { tagline: 'Hi', description: 'Desc' },
      brand: { logoUrl: null, colors: {} },
      hero: {
        type: 'video',
        videoUrl: 'https://cdn.example.com/hero.mp4',
        posterUrl: 'https://cdn.example.com/poster.jpg',
        imageUrl: null,
      },
      website: { sections: [{ type: 'hero', content: { type: 'video' } }] },
      commerce: { products: [] },
      diagnostics: { source: 'test' },
    });

    expect(store.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(store.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(store.heroMediaType).toBe('video');
    expect(store.heroUrl).toBe('https://cdn.example.com/hero.mp4');
  });

  it('image-only projection still maps heroMediaType image', () => {
    const store = publishedBusinessArtifactToPublicStore({
      artifactVersion: 1,
      businessId: 'biz-2',
      storeId: 'biz-2',
      slug: 'shop',
      name: 'Shop',
      category: 'shop',
      status: 'published',
      publishedAt: new Date().toISOString(),
      content: {},
      brand: { logoUrl: null, colors: {} },
      hero: {
        type: 'image',
        imageUrl: 'https://cdn.example.com/hero.jpg',
        videoUrl: null,
      },
      website: { sections: [] },
      commerce: { products: [] },
      diagnostics: {},
    });

    expect(store.heroMediaType).toBe('image');
    expect(store.heroVideoUrl).toBeNull();
    expect(store.heroVideo).toBeNull();
    expect(store.heroUrl).toBe('https://cdn.example.com/hero.jpg');
  });
});
