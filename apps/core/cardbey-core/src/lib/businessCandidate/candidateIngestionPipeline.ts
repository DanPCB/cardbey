/**
 * Performer-first discovery ingestion — BusinessCandidate + mission only.
 * Never creates BusinessSeed, DraftStore, or Business rows.
 */

import { randomUUID } from 'node:crypto';
import type { BusinessCandidate as DiscoveryBusinessCandidate } from '../discoveryEngine/types/index.js';
import { businessIdentityEngine } from '../discoveryEngine/dedupe/BusinessIdentityEngine.js';
import { applyDiscoveryScores } from '../discoveryEngine/scoring/discoveryScore.js';
import { businessCandidateNormalizer } from '../discoveryEngine/normalization/candidateNormalizer.js';
import { providerToSourceType } from '../discoveryEngine/adapters/candidateToRawRecord.js';
import type { DiscoveredFromSource } from './types.js';
import type { BusinessCandidateRecord, CandidateIngestionResult } from './types.js';
import {
  buildCandidateDedupeKey,
  getBusinessCandidateByDedupeKey,
  listBusinessCandidates,
  upsertBusinessCandidates,
} from './candidateRepository.js';
import { createBusinessOnboardingMission } from './businessOnboardingMission.js';
import { emitBusinessDiscovered } from './candidateRuntimeEvents.js';
import { checkCandidateDuplicate } from './candidateDedupe.js';
import { MELBOURNE_BATCH001_CAMPAIGN_ID } from './batch001Config.js';
import type { BusinessCandidateStatus } from './types.js';

const PROVIDER_DISCOVERED_FROM: Record<string, DiscoveredFromSource> = {
  osm: 'osm',
  csv: 'csv',
  referral: 'referral',
  manual: 'manual',
  vision: 'vision',
  google_places: 'google',
  google: 'google',
  government_register: 'manual',
  directory: 'website',
  partner_import: 'manual',
};

function inferMissingFields(candidate: DiscoveryBusinessCandidate): string[] {
  const missing: string[] = [];
  if (!candidate.businessName) missing.push('name');
  if (!candidate.phone) missing.push('phone');
  if (!candidate.website) missing.push('website');
  if (!candidate.email) missing.push('email');
  if (!candidate.address && !candidate.city) missing.push('address');
  if (!candidate.category) missing.push('businessType');
  return missing;
}

function discoveryToPersisted(
  candidate: DiscoveryBusinessCandidate,
  batchId: string,
  campaignId: string | null,
  initialStatus: BusinessCandidateStatus,
): BusinessCandidateRecord {
  const now = new Date().toISOString();
  const suburb =
    (typeof candidate.metadata.suburb === 'string' ? candidate.metadata.suburb : null) ??
    candidate.city ??
    null;
  const placeId =
    typeof candidate.metadata.placeId === 'string'
      ? candidate.metadata.placeId
      : candidate.providerId === 'google_places'
        ? candidate.externalId
        : null;
  const rawSourceJson =
    candidate.metadata.rawSourceJson && typeof candidate.metadata.rawSourceJson === 'object'
      ? (candidate.metadata.rawSourceJson as Record<string, unknown>)
      : null;

  const dedupeKey = buildCandidateDedupeKey({
    name: candidate.businessName,
    phone: candidate.phone,
    address: candidate.address,
    suburb,
  });

  return {
    id: randomUUID(),
    batchId,
    campaignId,
    name: candidate.businessName,
    businessType: candidate.category,
    address: candidate.address,
    suburb,
    city: candidate.city,
    state: candidate.state,
    postcode: candidate.postcode,
    country: candidate.country,
    phone: candidate.phone,
    website: candidate.website,
    email: candidate.email,
    socialLinks: candidate.socialProfiles.map((p) => ({ platform: p.platform, url: p.url })),
    coordinates:
      candidate.latitude != null && candidate.longitude != null
        ? { lat: candidate.latitude, lng: candidate.longitude }
        : null,
    discoveredFrom: PROVIDER_DISCOVERED_FROM[candidate.providerId] ?? 'manual',
    confidenceScore: candidate.confidence,
    originalContent: {
      providerId: candidate.providerId,
      externalId: candidate.externalId,
      sourceUrl: candidate.sourceUrl,
      sourceType: providerToSourceType(candidate.providerId),
      metadata: candidate.metadata,
      discoveredAt: candidate.discoveredAt,
    },
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: inferMissingFields(candidate),
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId,
    sourceUrl: candidate.sourceUrl,
    rawSourceJson,
    seedId: null,
    status: initialStatus,
    dedupeKey,
    discoveryProviderId: candidate.providerId,
    externalId: candidate.externalId,
    createdAt: now,
    updatedAt: now,
  };
}

function toDiscoveryShape(record: BusinessCandidateRecord): DiscoveryBusinessCandidate {
  return {
    providerId: record.discoveryProviderId as DiscoveryBusinessCandidate['providerId'],
    externalId: record.externalId,
    businessName: record.name,
    category: record.businessType,
    address: record.address,
    city: record.city,
    state: record.state,
    postcode: record.postcode,
    country: record.country,
    latitude: record.coordinates?.lat ?? null,
    longitude: record.coordinates?.lng ?? null,
    phone: record.phone,
    email: record.email,
    website: record.website,
    socialProfiles: record.socialLinks.map((s) => ({ platform: s.platform, url: s.url })),
    sourceUrl: typeof record.originalContent.sourceUrl === 'string' ? record.originalContent.sourceUrl : null,
    discoveredAt: record.createdAt,
    confidence: record.confidenceScore,
    metadata:
      'metadata' in record.originalContent && record.originalContent.metadata
        ? (record.originalContent.metadata as Record<string, unknown>)
        : {},
  };
}

export async function ingestDiscoveredCandidates(
  rawCandidates: DiscoveryBusinessCandidate[],
  options: {
    batchId: string;
    campaignId?: string | null;
    createdBy?: string | null;
    /** Real pilot: skip Performer mission until after QA */
    createMission?: boolean;
    initialStatus?: BusinessCandidateStatus;
  },
): Promise<CandidateIngestionResult> {
  const batchId = options.batchId;
  const campaignId = options.campaignId ?? MELBOURNE_BATCH001_CAMPAIGN_ID;
  const createMission = options.createMission !== false;
  const initialStatus = options.initialStatus ?? 'DISCOVERED';

  const normalized = businessCandidateNormalizer.normalizeMany(rawCandidates);
  const scored = applyDiscoveryScores(normalized);

  const existing = await listBusinessCandidates();
  const corpus: DiscoveryBusinessCandidate[] = existing.map(toDiscoveryShape);

  const accepted: BusinessCandidateRecord[] = [];
  let duplicatesRejected = 0;

  for (const candidate of scored) {
    const suburb =
      (typeof candidate.metadata.suburb === 'string' ? candidate.metadata.suburb : null) ??
      candidate.city;

    const dup = await checkCandidateDuplicate(candidate, suburb);
    if (dup.duplicate) {
      duplicatesRejected += 1;
      continue;
    }

    const identityScore = businessIdentityEngine.bestMatchScore(
      candidate,
      [...corpus, ...accepted.map(toDiscoveryShape)],
      candidate.externalId,
    );
    const decision = businessIdentityEngine.classify(identityScore);
    if (decision === 'duplicate') {
      duplicatesRejected += 1;
      continue;
    }

    accepted.push(discoveryToPersisted(candidate, batchId, campaignId, initialStatus));
    corpus.push(candidate);
  }

  if (!accepted.length) {
    return { accepted: [], duplicatesRejected, missionsCreated: 0 };
  }

  await upsertBusinessCandidates(accepted);

  let missionsCreated = 0;
  const withMissions: BusinessCandidateRecord[] = [];

  for (const record of accepted) {
    emitBusinessDiscovered(record);
    if (createMission) {
      const { candidate } = await createBusinessOnboardingMission(record, options.createdBy);
      withMissions.push(candidate);
      missionsCreated += 1;
    } else {
      withMissions.push(record);
    }
  }

  return {
    accepted: withMissions,
    duplicatesRejected,
    missionsCreated,
  };
}
