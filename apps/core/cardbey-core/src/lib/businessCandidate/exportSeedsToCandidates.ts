/**
 * Rebuild JSON BusinessCandidate inventory from durable Postgres business_seed rows.
 */

import { listSeedRecords } from '../businessIngestion/IngestionRepository.js';
import type { IngestedSeedRecord, SeedVerificationStatus } from '../businessIngestion/types.js';
import {
  MELBOURNE_BATCH001_CAMPAIGN_ID,
  MELBOURNE_BATCH001_REAL_LOCAL_ID,
  isProtectedBatch0,
} from './batch001Config.js';
import { upsertBusinessCandidates } from './candidateRepository.js';
import { seedBriefCandidateId } from './seedBriefAdapter.js';
import type { BusinessCandidateRecord, BusinessCandidateStatus, DiscoveredFromSource } from './types.js';

function mapSeedStatusToCandidateStatus(status: SeedVerificationStatus): BusinessCandidateStatus {
  switch (status) {
    case 'seeded_pending_qa':
      return 'PENDING_QA';
    case 'seeded_claimable':
      return 'CLAIMABLE';
    case 'claim_pending':
      return 'CLAIM_PENDING';
    case 'verified_owner':
      return 'VERIFIED';
    case 'active':
      return 'ACTIVE';
    case 'rejected':
      return 'QA_REJECTED';
    case 'duplicate':
      return 'DUPLICATE';
    case 'rolled_back':
      return 'ROLLED_BACK';
    case 'hidden_by_operator':
      return 'HIDDEN_BY_OPERATOR';
    default:
      return 'CLAIMABLE';
  }
}

function mapDiscoveredFrom(sourceType: string | null | undefined): DiscoveredFromSource {
  switch (sourceType) {
    case 'places_discovery':
      return 'google';
    case 'open_data_url':
      return 'osm';
    case 'website_discovery':
      return 'website';
    case 'owner_submission':
      return 'manual';
    default:
      return 'manual';
  }
}

/** Best-effort Google Places types for taxonomy when only category string exists on seed. */
export function inferRawSourceJsonFromSeed(seed: IngestedSeedRecord): Record<string, unknown> | null {
  const n = seed.normalized;
  const fromMeta =
    n.sourceReference && typeof (seed as { discoveryMetadata?: unknown }).discoveryMetadata === 'object'
      ? ((seed as { discoveryMetadata?: Record<string, unknown> }).discoveryMetadata ?? null)
      : null;

  if (fromMeta && Array.isArray(fromMeta.types) && fromMeta.types.length) {
    return { ...fromMeta, types: fromMeta.types };
  }

  const category = n.category?.trim();
  if (!category) return null;

  const token = category.toLowerCase().replace(/\s+/g, '_');
  return {
    category,
    types: [token],
    sourceId: n.sourceRowId ?? seed.id,
    discoveryVia: 'seed_export',
  };
}

export function businessCandidateFromIngestedSeed(seed: IngestedSeedRecord): BusinessCandidateRecord {
  const n = seed.normalized;
  const now = new Date().toISOString();
  const rawSourceJson = inferRawSourceJsonFromSeed(seed);
  const profile = seed.enrichmentProfile;

  return {
    id: seedBriefCandidateId(seed.id),
    batchId: seed.batchId ?? MELBOURNE_BATCH001_REAL_LOCAL_ID,
    campaignId: seed.campaignId ?? MELBOURNE_BATCH001_CAMPAIGN_ID,
    name: n.businessName,
    businessType: n.category,
    address: n.address,
    suburb: n.city,
    city: n.city,
    state: n.state,
    postcode: null,
    country: n.country ?? 'AU',
    phone: n.phone,
    website: n.website,
    email: n.email,
    socialLinks: seed.socialLinks
      ? Object.entries(seed.socialLinks)
          .filter(([, url]) => typeof url === 'string' && url.trim())
          .map(([platform, url]) => ({ platform, url: String(url) }))
      : [],
    coordinates: null,
    discoveredFrom: mapDiscoveredFrom(n.sourceType),
    confidenceScore: n.confidenceScore ?? seed.qualityScore / 100,
    originalContent: {
      exportedFromSeedId: seed.id,
      sourceType: n.sourceType,
      sourceReference: n.sourceReference,
    },
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: [],
    ownerMatched: seed.verificationStatus === 'verified_owner' || seed.verificationStatus === 'active',
    ownerId: seed.ownerUserId,
    storeDraftId: seed.draftId,
    storeId: seed.storeId,
    missionId: null,
    placeId: null,
    sourceUrl: n.sourceReference || null,
    rawSourceJson,
    seedId: seed.id,
    status: mapSeedStatusToCandidateStatus(seed.verificationStatus),
    dedupeKey: `seed|${seed.id}`,
    discoveryProviderId: n.sourceType ?? 'seed_ingestion',
    externalId: n.sourceRowId ?? seed.id,
    createdAt: seed.createdAt ?? now,
    updatedAt: seed.updatedAt ?? now,
    description: profile?.description ?? seed.about ?? null,
    heroImageUrl: profile?.heroImageUrl ?? seed.hero?.url ?? null,
    enrichmentUpdatedAt: profile?.enrichedAt ?? null,
  };
}

export type ExportSeedsToCandidatesResult = {
  seedCount: number;
  exported: number;
  batchIds: string[];
  candidateIds: string[];
  dryRun: boolean;
};

export async function exportPostgresSeedsToCandidates(opts?: {
  dryRun?: boolean;
  batchId?: string | null;
  includeAllSeeds?: boolean;
}): Promise<{ candidates: BusinessCandidateRecord[]; result: ExportSeedsToCandidatesResult }> {
  const dryRun = opts?.dryRun === true;
  const batchFilter = opts?.batchId?.trim() || null;
  const includeAllSeeds = opts?.includeAllSeeds === true;

  const seeds = await listSeedRecords();
  const filtered = seeds.filter((seed) => {
    if (seed.verificationStatus === 'duplicate' || seed.verificationStatus === 'rejected') {
      return false;
    }
    if (seed.batchId && isProtectedBatch0(seed.batchId)) return false;
    if (includeAllSeeds) return true;
    if (batchFilter) return seed.batchId === batchFilter;
    return (
      !seed.batchId ||
      seed.batchId === MELBOURNE_BATCH001_REAL_LOCAL_ID ||
      seed.batchId.startsWith('MELBOURNE_BATCH001')
    );
  });

  const candidates = filtered.map(businessCandidateFromIngestedSeed);

  if (!dryRun && candidates.length) {
    await upsertBusinessCandidates(candidates);
  }

  return {
    candidates,
    result: {
      seedCount: seeds.length,
      exported: candidates.length,
      batchIds: [...new Set(candidates.map((c) => c.batchId))],
      candidateIds: candidates.map((c) => c.id),
      dryRun,
    },
  };
}
