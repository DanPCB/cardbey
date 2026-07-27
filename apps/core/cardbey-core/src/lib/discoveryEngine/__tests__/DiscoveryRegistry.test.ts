import { describe, expect, it } from 'vitest';
import { DiscoveryRegistry } from '../registry/DiscoveryRegistry.js';
import type { BusinessCandidate, DiscoveryProvider } from '../types/index.js';

const stubProvider: DiscoveryProvider = {
  providerId: 'manual',
  async discover() {
    return [
      {
        providerId: 'manual',
        externalId: 'stub-1',
        businessName: 'Stub Cafe',
        category: 'food',
        address: null,
        city: 'Melbourne',
        state: null,
        postcode: null,
        country: 'AU',
        latitude: null,
        longitude: null,
        phone: null,
        email: null,
        website: null,
        socialProfiles: [],
        sourceUrl: null,
        discoveredAt: new Date().toISOString(),
        confidence: 0.5,
        metadata: {},
      } satisfies BusinessCandidate,
    ];
  },
};

describe('DiscoveryRegistry', () => {
  it('registers and discovers via provider', async () => {
    const registry = new DiscoveryRegistry();
    registry.registerProvider(stubProvider);
    const results = await registry.discover({ provider: 'manual', businessName: 'x' });
    expect(results).toHaveLength(1);
    expect(results[0].businessName).toBe('Stub Cafe');
  });

  it('throws for unknown provider', async () => {
    const registry = new DiscoveryRegistry();
    await expect(registry.discover({ provider: 'osm' })).rejects.toThrow(/not registered/);
  });
});
