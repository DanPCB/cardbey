/**
 * Idempotent seed reconciliation (V1.2).
 * Matches by source key (sourceType + sourceReference + sourceRowId) or identity fingerprint.
 */

import type { IngestedSeedRecord, NormalizedBusinessRecord } from './types.js';
import {
  normalizePhone,
  websiteHost,
} from '../businessDiscovery/businessDataNormalizer.js';

export function buildSourceKey(n: NormalizedBusinessRecord): string {
  return [n.sourceType, n.sourceReference, n.sourceRowId].join('|');
}

export function buildIdentityFingerprint(n: NormalizedBusinessRecord): string {
  return [
    (n.businessName ?? '').toLowerCase().trim(),
    normalizePhone(n.phone) ?? '',
    websiteHost(n.website) ?? '',
    (n.address ?? '').toLowerCase().trim(),
  ].join('|');
}

function factualDigest(seed: IngestedSeedRecord): string {
  const n = seed.normalized;
  return JSON.stringify({
    businessName: n.businessName,
    legalName: n.legalName,
    address: n.address,
    phone: n.phone,
    website: n.website,
    category: n.category,
    registrationNumber: n.registrationNumber,
    email: n.email,
    operatingRegion: n.operatingRegion,
    country: n.country,
    state: n.state,
    city: n.city,
    qualityScore: seed.qualityScore,
    qualityTier: seed.qualityTier,
    resolution: seed.resolution,
    sourceType: n.sourceType,
    sourceReference: n.sourceReference,
    sourceRowId: n.sourceRowId,
  });
}

export interface SeedReconcileIndex {
  bySourceKey: Map<string, IngestedSeedRecord>;
  byIdentity: Map<string, IngestedSeedRecord>;
}

export function indexExistingSeeds(existing: IngestedSeedRecord[]): SeedReconcileIndex {
  const bySourceKey = new Map<string, IngestedSeedRecord>();
  const byIdentity = new Map<string, IngestedSeedRecord>();

  for (const seed of existing) {
    const sk = buildSourceKey(seed.normalized);
    if (!bySourceKey.has(sk)) bySourceKey.set(sk, seed);

    const ik = buildIdentityFingerprint(seed.normalized);
    if (ik.replace(/\|/g, '').length > 0 && !byIdentity.has(ik)) {
      byIdentity.set(ik, seed);
    }
  }

  return { bySourceKey, byIdentity };
}

export function findExistingSeed(
  incoming: IngestedSeedRecord,
  index: SeedReconcileIndex,
): IngestedSeedRecord | null {
  const sourceKey = buildSourceKey(incoming.normalized);
  const fromSource = index.bySourceKey.get(sourceKey);
  if (fromSource) return fromSource;

  const identityKey = buildIdentityFingerprint(incoming.normalized);
  if (identityKey.replace(/\|/g, '').length === 0) return null;
  return index.byIdentity.get(identityKey) ?? null;
}

/** Merge incoming facts while preserving governance, provenance, and ownership fields. */
export function mergeIncomingSeed(
  existing: IngestedSeedRecord,
  incoming: IngestedSeedRecord,
): IngestedSeedRecord {
  return {
    ...existing,
    normalized: {
      ...incoming.normalized,
      id: existing.normalized.id,
    },
    resolution: incoming.resolution,
    matchEvidence: incoming.matchEvidence,
    qualityScore: incoming.qualityScore,
    qualityTier: incoming.qualityTier,
    batchId: incoming.batchId ?? existing.batchId ?? null,
    campaignId: incoming.campaignId ?? existing.campaignId ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export type ReconcileAction = 'create' | 'update' | 'skip';

export interface ReconcileResult {
  seeds: IngestedSeedRecord[];
  seedsCreated: number;
  seedsUpdated: number;
  seedsSkippedExisting: number;
}

/**
 * Reconcile a batch of incoming seeds against persisted records.
 * Updates index as new seeds are accepted so within-batch duplicates resolve consistently.
 */
export function reconcileIngestionSeeds(
  incoming: IngestedSeedRecord[],
  existing: IngestedSeedRecord[],
): ReconcileResult {
  const index = indexExistingSeeds(existing);
  const out: IngestedSeedRecord[] = [];
  let seedsCreated = 0;
  let seedsUpdated = 0;
  let seedsSkippedExisting = 0;

  for (const candidate of incoming) {
    const match = findExistingSeed(candidate, index);

    if (!match) {
      out.push(candidate);
      seedsCreated++;
      const sk = buildSourceKey(candidate.normalized);
      index.bySourceKey.set(sk, candidate);
      const ik = buildIdentityFingerprint(candidate.normalized);
      if (ik.replace(/\|/g, '').length > 0) index.byIdentity.set(ik, candidate);
      continue;
    }

    const merged = mergeIncomingSeed(match, candidate);
    if (factualDigest(merged) === factualDigest(match)) {
      out.push(match);
      seedsSkippedExisting++;
      continue;
    }

    out.push(merged);
    seedsUpdated++;
    const sk = buildSourceKey(merged.normalized);
    index.bySourceKey.set(sk, merged);
    const ik = buildIdentityFingerprint(merged.normalized);
    if (ik.replace(/\|/g, '').length > 0) index.byIdentity.set(ik, merged);
  }

  return { seeds: out, seedsCreated, seedsUpdated, seedsSkippedExisting };
}
