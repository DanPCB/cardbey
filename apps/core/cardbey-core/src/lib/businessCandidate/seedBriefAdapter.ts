/**
 * Adapt claimable BusinessSeed records for media/BI enrichment when no BusinessCandidate exists.
 */

import type { IngestedSeedRecord } from '../businessIngestion/types.js';
import type { BusinessCandidateRecord } from './types.js';

export function seedBriefCandidateId(seedId: string): string {
  return `seed:${seedId}`;
}

export function isSeedBriefCandidateId(candidateId: string): boolean {
  return candidateId.startsWith('seed:');
}

export function businessCandidateFromSeed(seed: IngestedSeedRecord): BusinessCandidateRecord {
  const n = seed.normalized;
  const now = new Date().toISOString();
  return {
    id: seedBriefCandidateId(seed.id),
    batchId: seed.batchId ?? 'SEED_CLAIMABLE',
    campaignId: null,
    name: n.businessName,
    businessType: n.category,
    address: n.address,
    suburb: n.city,
    city: n.city,
    state: n.state,
    postcode: null,
    country: n.country,
    phone: n.phone,
    website: n.website,
    email: n.email,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'manual',
    confidenceScore: n.confidenceScore ?? seed.qualityScore / 100,
    originalContent: {},
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: [],
    ownerMatched: seed.verificationStatus === 'verified_owner',
    ownerId: seed.ownerUserId,
    storeDraftId: seed.draftId,
    storeId: seed.storeId,
    missionId: null,
    placeId: null,
    sourceUrl: null,
    rawSourceJson: null,
    seedId: seed.id,
    status: 'CLAIMABLE',
    dedupeKey: `seed|${seed.id}`,
    discoveryProviderId: n.sourceType ?? 'seed_ingestion',
    externalId: seed.id,
    createdAt: seed.createdAt ?? now,
    updatedAt: seed.updatedAt ?? now,
  };
}
