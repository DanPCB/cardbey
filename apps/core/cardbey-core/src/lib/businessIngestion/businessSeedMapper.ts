/**
 * Map IngestedSeedRecord ↔ BusinessSeed Prisma row.
 */

import type { IngestedSeedRecord, IngestionSourceType } from './types.js';
import { buildSourceKey } from './seedIdempotency.js';

export function buildSeedDedupeKey(seed: IngestedSeedRecord): string {
  return buildSourceKey(seed.normalized);
}

export function ingestedSeedToDbRow(seed: IngestedSeedRecord) {
  const n = seed.normalized;
  return {
    id: seed.id,
    source: n.sourceType,
    status: seed.verificationStatus,
    name: n.businessName,
    website: n.website,
    phone: n.phone,
    email: n.email,
    address: n.address,
    city: n.city,
    state: n.state,
    country: n.country,
    rawPayload: JSON.stringify(seed),
    dedupeKey: buildSeedDedupeKey(seed),
    storeId: seed.storeId,
    createdAt: new Date(seed.createdAt),
    updatedAt: new Date(seed.updatedAt),
  };
}

export function dbRowToIngestedSeed(row: {
  id: string;
  source: string;
  status: string;
  name: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  rawPayload: string;
  dedupeKey: string;
  storeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): IngestedSeedRecord {
  try {
    const parsed = JSON.parse(row.rawPayload) as IngestedSeedRecord;
    if (parsed?.id === row.id && parsed.normalized) {
      return {
        ...parsed,
        verificationStatus: row.status as IngestedSeedRecord['verificationStatus'],
        storeId: row.storeId,
        updatedAt: row.updatedAt.toISOString(),
      };
    }
  } catch {
    /* fall through to column reconstruction */
  }

  return {
    id: row.id,
    normalized: {
      id: row.id,
      businessName: row.name,
      legalName: null,
      address: row.address,
      phone: row.phone,
      website: row.website,
      category: null,
      categoryConfidence: 0,
      registrationNumber: null,
      email: row.email,
      operatingRegion: row.city,
      country: row.country,
      state: row.state,
      city: row.city,
      confidenceScore: 0,
      sourceType: row.source as IngestionSourceType,
      sourceReference: '',
      sourceRowId: row.id,
      ingestedAt: row.createdAt.toISOString(),
    },
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 0,
    qualityTier: 'medium_quality',
    verificationStatus: row.status as IngestedSeedRecord['verificationStatus'],
    claimable: row.status === 'seeded_claimable',
    publicVisibility: 'limited',
    ownerUserId: null,
    storeId: row.storeId,
    draftId: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
