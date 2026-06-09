import { describe, it, expect } from 'vitest';
import { publishedBusinessArtifactToPublicStore } from './publishedBusinessArtifactToPublicStore.js';

const BASE_PROJECTION = {
  artifactVersion: 'v1',
  businessId: 'biz-mf',
  storeId: 'biz-mf',
  slug: 'melbourne-flooring',
  name: 'Melbourne Flooring',
  category: 'retail',
  status: 'published',
  publishedAt: new Date().toISOString(),
  content: { tagline: 'Transform your space', description: 'Flooring experts' },
  brand: { logoUrl: null, colors: {} },
  hero: { type: 'video', videoUrl: '/uploads/hero.mp4', imageUrl: null },
  website: {
    sections: [
      {
        type: 'featured',
        content: {
          heading: 'Featured picks',
          productIds: ['item_draft_0', 'item_draft_1'],
        },
      },
    ],
  },
  commerce: {
    products: [
      {
        id: 'item_draft_0',
        name: 'Featured Item',
        description: null,
        price: 24.95,
        imageUrl: 'https://cdn.example.com/a.jpg',
        category: 'cat_retail_0',
      },
      {
        id: 'item_draft_1',
        name: 'Popular Pick',
        description: null,
        price: 34.95,
        imageUrl: 'https://cdn.example.com/b.jpg',
        category: 'cat_retail_1',
      },
    ],
  },
  diagnostics: { source: 'mini_website_modal' },
};

describe('publishedBusinessArtifactToPublicStore products', () => {
  it('falls back to projection commerce when business.products is an empty array', () => {
    const store = publishedBusinessArtifactToPublicStore(BASE_PROJECTION, {
      business: { products: [], type: 'retail', transactionMode: 'order' },
    });

    expect(store.products).toHaveLength(2);
    expect(store.products[0]).toMatchObject({
      id: 'item_draft_0',
      name: 'Featured Item',
      imageUrl: 'https://cdn.example.com/a.jpg',
      category: 'cat_retail_0',
    });
  });

  it('prefers non-empty DB products over projection commerce', () => {
    const store = publishedBusinessArtifactToPublicStore(BASE_PROJECTION, {
      business: {
        products: [
          {
            id: 'db-prod-1',
            name: 'DB Product',
            description: null,
            category: 'Flooring',
            price: 99,
            currency: 'AUD',
            imageUrl: 'https://cdn.example.com/db.jpg',
          },
        ],
        type: 'retail',
        transactionMode: 'order',
      },
    });

    expect(store.products).toHaveLength(1);
    expect(store.products[0].id).toBe('db-prod-1');
  });
});
