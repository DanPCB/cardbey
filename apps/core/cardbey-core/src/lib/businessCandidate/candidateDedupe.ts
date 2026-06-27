/**
 * Enhanced deduplication for BusinessCandidate — name+suburb, placeId, phone, website.
 */

import type { BusinessCandidateRecord } from './types.js';
import { buildCandidateDedupeKey, listBusinessCandidates } from './candidateRepository.js';
import type { BusinessCandidate as DiscoveryBusinessCandidate } from '../discoveryEngine/types/index.js';

export interface DedupeCheckResult {
  duplicate: boolean;
  reason?: string;
  existingId?: string;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normPhone(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

function normWebsite(url: string | null | undefined): string {
  const s = norm(url);
  return s.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export async function checkCandidateDuplicate(
  candidate: DiscoveryBusinessCandidate,
  suburb: string | null,
): Promise<DedupeCheckResult> {
  const existing = await listBusinessCandidates();
  const placeId =
    typeof candidate.metadata.placeId === 'string'
      ? candidate.metadata.placeId
      : candidate.externalId?.startsWith('Ch')
        ? candidate.externalId
        : null;

  const dedupeKey = buildCandidateDedupeKey({
    name: candidate.businessName,
    phone: candidate.phone,
    address: candidate.address,
    suburb: suburb ?? candidate.city,
  });

  for (const row of existing) {
    if (row.dedupeKey === dedupeKey) {
      return { duplicate: true, reason: 'dedupe_key', existingId: row.id };
    }
    if (placeId && row.placeId === placeId) {
      return { duplicate: true, reason: 'place_id', existingId: row.id };
    }
    const phone = normPhone(candidate.phone);
    if (phone && normPhone(row.phone) === phone) {
      return { duplicate: true, reason: 'phone', existingId: row.id };
    }
    const web = normWebsite(candidate.website);
    if (web && normWebsite(row.website) === web) {
      return { duplicate: true, reason: 'website', existingId: row.id };
    }
    if (
      norm(candidate.businessName) === norm(row.name) &&
      norm(suburb ?? candidate.city) === norm(row.suburb ?? row.city)
    ) {
      return { duplicate: true, reason: 'name_suburb', existingId: row.id };
    }
  }

  return { duplicate: false };
}

export function isPendingQaCandidate(candidate: BusinessCandidateRecord): boolean {
  return candidate.status === 'DISCOVERED' || candidate.status === 'PENDING_QA';
}

export function isClaimableCandidate(candidate: BusinessCandidateRecord): boolean {
  return candidate.status === 'CLAIMABLE' && Boolean(candidate.seedId);
}
