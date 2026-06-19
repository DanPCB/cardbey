/**
 * User referral discovery — single business submission pending review.
 */

import { randomUUID } from 'node:crypto';
import type { BusinessCandidate, DiscoveryDiscoverParams, DiscoveryProvider } from '../types/index.js';

export class ReferralDiscoveryProvider implements DiscoveryProvider {
  readonly providerId = 'referral' as const;

  async discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]> {
    const name = params.businessName?.trim();
    if (!name) {
      throw new Error('Referral discovery requires businessName');
    }

    const discoveredAt = new Date().toISOString();
    const candidate: BusinessCandidate = {
      providerId: 'referral',
      externalId: randomUUID(),
      businessName: name,
      category: params.category ?? null,
      address: params.address ?? null,
      city: params.city ?? null,
      state: null,
      postcode: params.postcode ?? null,
      country: null,
      latitude: null,
      longitude: null,
      phone: params.phone ?? null,
      email: params.email ?? null,
      website: params.website ?? null,
      socialProfiles: [],
      sourceUrl: null,
      discoveredAt,
      confidence: 0.5,
      metadata: {
        referralStatus: 'referred_pending_review',
        referredByUserId: params.referredByUserId ?? null,
      },
    };

    return [candidate];
  }
}

export const referralDiscoveryProvider = new ReferralDiscoveryProvider();
