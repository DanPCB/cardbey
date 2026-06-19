/**
 * Referral anti-spam — rate limits and duplicate blocking before seed creation.
 */

import { listSeedRecords } from '../../businessIngestion/IngestionRepository.js';
import { websiteHost } from '../../businessDiscovery/businessDataNormalizer.js';
import { businessIdentityEngine } from '../dedupe/BusinessIdentityEngine.js';
import type { BusinessCandidate, DiscoveryDiscoverParams } from '../types/index.js';
import { listDiscoveryJobs } from '../jobs/DiscoveryJobRepository.js';

const REFERRAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_REFERRALS_PER_USER_PER_DAY = 5;

export class ReferralRejectedError extends Error {
  readonly code: 'referral_duplicate' | 'referral_rate_limit';

  constructor(code: 'referral_duplicate' | 'referral_rate_limit', message: string) {
    super(message);
    this.name = 'ReferralRejectedError';
    this.code = code;
  }
}

function candidateFromParams(params: DiscoveryDiscoverParams): BusinessCandidate {
  return {
    providerId: 'referral',
    externalId: 'pending',
    businessName: params.businessName?.trim() ?? null,
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
    discoveredAt: new Date().toISOString(),
    confidence: 0.5,
    metadata: {},
  };
}

export async function assertReferralAllowed(params: DiscoveryDiscoverParams): Promise<void> {
  const userId = params.referredByUserId;
  if (userId) {
    const since = Date.now() - REFERRAL_COOLDOWN_MS;
    const recentJobs = await listDiscoveryJobs(200);
    const userReferrals = recentJobs.filter(
      (j) =>
        j.provider === 'referral' &&
        j.status !== 'failed' &&
        new Date(j.startedAt).getTime() >= since &&
        (j.params as { referredByUserId?: string })?.referredByUserId === userId,
    );
    if (userReferrals.length >= MAX_REFERRALS_PER_USER_PER_DAY) {
      throw new ReferralRejectedError(
        'referral_rate_limit',
        `Referral limit reached (${MAX_REFERRALS_PER_USER_PER_DAY} per 24 hours)`,
      );
    }
  }

  const incoming = candidateFromParams(params);
  const seeds = await listSeedRecords();
  const corpus: BusinessCandidate[] = seeds.map((s) => ({
    providerId: 'referral',
    externalId: s.id,
    businessName: s.normalized.businessName,
    category: s.normalized.category,
    address: s.normalized.address,
    city: s.normalized.city,
    state: s.normalized.state,
    postcode: null,
    country: s.normalized.country,
    latitude: null,
    longitude: null,
    phone: s.normalized.phone,
    email: s.normalized.email,
    website: s.normalized.website,
    socialProfiles: [],
    sourceUrl: s.normalized.sourceReference,
    discoveredAt: s.createdAt,
    confidence: 1,
    metadata: {},
  }));

  const identityScore = businessIdentityEngine.bestMatchScore(incoming, corpus);
  const decision = businessIdentityEngine.classify(identityScore);

  if (decision === 'duplicate') {
    throw new ReferralRejectedError(
      'referral_duplicate',
      'This business appears to already exist in our discovery pipeline',
    );
  }

  const host = websiteHost(incoming.website);
  if (host) {
    const duplicateHost = corpus.some(
      (c) => websiteHost(c.website) === host && businessIdentityEngine.classify(
        businessIdentityEngine.scorePair(incoming, c),
      ) !== 'unique',
    );
    if (duplicateHost) {
      throw new ReferralRejectedError(
        'referral_duplicate',
        'A business with this website is already in the pipeline',
      );
    }
  }
}
