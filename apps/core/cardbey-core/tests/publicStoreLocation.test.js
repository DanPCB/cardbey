/**
 * Store location label parity: feed/public DTO and published projection share one helper.
 */
import { describe, it, expect } from 'vitest';
import { toPublicStore } from '../src/utils/publicStoreMapper.js';
import { buildPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/buildPublishedBusinessArtifact.js';
import { publishedBusinessArtifactToPublicStore } from '../src/services/publishedArtifactProjection/publishedBusinessArtifactToPublicStore.js';

const BUSINESS_WITH_ADDRESS = {
  id: 'biz-braybrook',
  userId: 'user-1',
  name: 'BrayBrook Bakery',
  slug: 'braybrook-bakery',
  type: 'bakery',
  isActive: true,
  publishedAt: new Date('2026-01-01'),
  address: '12 Main Rd',
  suburb: 'Braybrook',
  state: 'VIC',
  postcode: '3019',
  country: 'Australia',
  stylePreferences: { miniWebsite: { sections: [{ type: 'hero', content: { type: 'image' } }] } },
  createdAt: new Date('2026-01-01'),
};

describe('public store location', () => {
  it('feed/public DTO exposes canonical locationLabel from Business address', () => {
    const pub = toPublicStore(BUSINESS_WITH_ADDRESS);
    expect(pub.locationLabel).toBe('Braybrook, VIC');
    expect(pub.city).toBe('Braybrook, VIC');
    expect(pub.suburb).toBe('Braybrook');
  });

  it('published artifact and public projection carry the same locationLabel', () => {
    const projection = buildPublishedBusinessArtifact({ business: BUSINESS_WITH_ADDRESS });
    expect(projection.location.displayLabel).toBe('Braybrook, VIC');

    const fromProjection = publishedBusinessArtifactToPublicStore(projection, {
      business: BUSINESS_WITH_ADDRESS,
    });
    expect(fromProjection.locationLabel).toBe('Braybrook, VIC');
    expect(fromProjection.locationLabel).toBe(toPublicStore(BUSINESS_WITH_ADDRESS).locationLabel);
  });

  it('store without address has no locationLabel', () => {
    const bare = {
      ...BUSINESS_WITH_ADDRESS,
      address: null,
      suburb: null,
      state: null,
      country: null,
      postcode: null,
    };
    const pub = toPublicStore(bare);
    expect(pub.locationLabel).toBeNull();
    expect(pub.city).toBeNull();
  });
});
