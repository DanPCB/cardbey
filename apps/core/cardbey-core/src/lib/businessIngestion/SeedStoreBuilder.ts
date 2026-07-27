/**
 * Seed store builder (Phase 6).
 * Converts normalized ingested records into Cardbey store drafts.
 * owner = null, claimable = true, publicVisibility = limited.
 */

import type { IngestedSeedRecord, SeedStoreDraft } from './types.js';
import { classifyBusinessVertical } from '../classifyBusinessVertical.js';

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
  const classification = classifyBusinessVertical({
    category: draft.businessType,
    businessType: draft.businessType,
    businessName: draft.businessName,
  });
  return {
    storeName: draft.businessName,
    storeType: draft.businessType,
    businessVertical: classification.businessVertical,
    commerceVerticalMode: classification.commerceMode,
    commerceMode: classification.legacyCommerceMode,
    transactionMode: classification.transactionMode,
    catalogLabel: classification.catalogLabel,
    ctaLabel: classification.ctaLabel,
    tagline: '',
    heroText: '',
    heroImageUrl: null,
    brandColors: { primary: '#6C4CF1', secondary: '#1e293b' },
    items: [],
    categories: [{ id: 'default', name: classification.catalogLabel }],
    website: {
      sections: [
        {
          type: 'hero',
          content: {
            headline: draft.businessName,
            subheadline: `Welcome to ${draft.businessName}`,
            ctaLabel: classification.ctaLabel,
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
