/**
 * Manual executive entry — creates a single BusinessCandidate.
 */

import { randomUUID } from 'node:crypto';
import type { BusinessCandidate, DiscoveryDiscoverParams, DiscoveryProvider } from '../types/index.js';

export class ManualDiscoveryProvider implements DiscoveryProvider {
  readonly providerId = 'manual' as const;

  async discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]> {
    const name = params.businessName?.trim();
    if (!name) {
      throw new Error('Manual discovery requires businessName');
    }
    if (!params.website && !params.phone) {
      throw new Error('Manual discovery requires website or phone');
    }

    const discoveredAt = new Date().toISOString();
    return [
      {
        providerId: 'manual',
        externalId: randomUUID(),
        businessName: name,
        category: params.category ?? null,
        address: params.address ?? null,
        city: params.city ?? params.region ?? null,
        state: null,
        postcode: params.postcode ?? null,
        country: null,
        latitude: null,
        longitude: null,
        phone: params.phone ?? null,
        email: params.email ?? null,
        website: params.website ?? null,
        socialProfiles: [],
        sourceUrl: params.website ?? null,
        discoveredAt,
        confidence: 0.65,
        metadata: { entryType: 'manual_executive' },
      },
    ];
  }
}

export const manualDiscoveryProvider = new ManualDiscoveryProvider();
