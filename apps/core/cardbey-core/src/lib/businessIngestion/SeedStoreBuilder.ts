/**
 * Seed store builder (Phase 6).
 * Converts normalized ingested records into Cardbey store drafts.
 * owner = null, claimable = true, publicVisibility = limited.
 */

import type { IngestedSeedRecord, SeedStoreDraft } from './types.js';

export function buildSeedStoreDraft(seed: IngestedSeedRecord): SeedStoreDraft | null {
  const n = seed.normalized;
  const businessName = n.businessName?.trim();
  if (!businessName) return null;

  return {
    businessName,
    businessType: n.category ?? 'general',
    address: n.address,
    phone: n.phone,
    website: n.website,
    email: n.email,
    region: n.operatingRegion,
    country: n.country,
    state: n.state,
    city: n.city,
    owner: null,
    claimable: true,
    publicVisibility: 'limited',
    provenance: 'ingestion_seed',
    sourceType: n.sourceType,
    sourceReference: n.sourceReference,
    sourceRowId: n.sourceRowId,
    ingestedAt: n.ingestedAt,
    qualityScore: seed.qualityScore,
    confidenceScore: n.confidenceScore,
    verificationStatus: seed.verificationStatus,
    registrationNumber: n.registrationNumber,
  };
}

/**
 * Build a minimal draftStore preview payload compatible with existing publish flow.
 * Does not include reviews, ratings, or competitor content.
 */
export function buildSeedStorePreview(draft: SeedStoreDraft) {
  return {
    storeName: draft.businessName,
    storeType: draft.businessType,
    tagline: '',
    heroText: '',
    heroImageUrl: null,
    brandColors: { primary: '#6C4CF1', secondary: '#1e293b' },
    items: [],
    categories: [{ id: 'default', name: 'Featured' }],
    website: {
      sections: [
        {
          type: 'hero',
          content: {
            headline: draft.businessName,
            subheadline: `Welcome to ${draft.businessName}`,
            ctaLabel: 'Contact',
          },
        },
        {
          type: 'contact',
          content: {
            heading: 'Visit',
            address: draft.address,
            phone: draft.phone,
            email: draft.email,
            website: draft.website,
          },
        },
      ],
    },
    ingestionMeta: {
      provenance: draft.provenance,
      sourceType: draft.sourceType,
      sourceReference: draft.sourceReference,
      sourceRowId: draft.sourceRowId,
      ingestedAt: draft.ingestedAt,
      qualityScore: draft.qualityScore,
      confidenceScore: draft.confidenceScore,
      verificationStatus: draft.verificationStatus,
      publicVisibility: draft.publicVisibility,
      claimable: draft.claimable,
      registrationNumber: draft.registrationNumber,
    },
  };
}

export class SeedStoreBuilder {
  buildFromSeed(seed: IngestedSeedRecord): SeedStoreDraft | null {
    return buildSeedStoreDraft(seed);
  }
}

export const seedStoreBuilder = new SeedStoreBuilder();
