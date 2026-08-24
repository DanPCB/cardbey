/**
 * Multi-market candidate deduplication — strongest identity evidence first.
 * Never merge solely because translated names are similar.
 */

import type { MarketCountryCode } from '../marketRegistry/types.js';
import {
  normalizeAddressForCountry,
  normalizeBusinessNameForMatch,
  normalizePhoneForCountry,
} from '../multiMarketDiscovery/normalizeContact.js';
import type { BusinessCandidateRecord } from '../businessCandidate/types.js';
import { listBusinessCandidates } from '../businessCandidate/candidateRepository.js';
import type { BusinessCandidate as DiscoveryBusinessCandidate } from '../discoveryEngine/types/index.js';
import { createHash } from 'node:crypto';

export type DedupeDecision =
  | { decision: 'duplicate'; reason: string; existingId: string; confidence: number }
  | { decision: 'review_cluster'; reason: string; clusterId: string; existingId: string; confidence: number }
  | { decision: 'unique' };

function normWebsite(url: string | null | undefined): string {
  return (url ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function clusterIdFor(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `dup_${createHash('sha256').update(`${x}|${y}`).digest('hex').slice(0, 16)}`;
}

export async function checkMultiMarketDuplicate(params: {
  candidate: DiscoveryBusinessCandidate;
  countryCode: MarketCountryCode;
  categoryId?: string | null;
  /** English translation of name — must NOT be used as sole merge key */
  translatedName?: string | null;
}): Promise<DedupeDecision> {
  const { candidate, countryCode } = params;
  const existing = await listBusinessCandidates();
  const placeId =
    typeof candidate.metadata.placeId === 'string'
      ? candidate.metadata.placeId
      : candidate.externalId?.startsWith('Ch')
        ? candidate.externalId
        : null;
  const phone = normalizePhoneForCountry(candidate.phone, countryCode);
  const website = normWebsite(candidate.website);
  const addr = normalizeAddressForCountry({
    countryCode,
    address: candidate.address,
    locality: candidate.city,
    region: candidate.state,
    postcode: candidate.postcode,
  });
  const nameKey = normalizeBusinessNameForMatch(candidate.businessName, countryCode);
  const coords =
    candidate.latitude != null && candidate.longitude != null
      ? { lat: candidate.latitude, lng: candidate.longitude }
      : null;

  for (const row of existing) {
    const rowCountry = (row.countryCode ?? row.country ?? 'AU') as string;
    if (rowCountry && rowCountry !== countryCode) continue;

    // 1. Provider + stable place id
    if (placeId && row.placeId && placeId === row.placeId) {
      return { decision: 'duplicate', reason: 'provider_place_id', existingId: row.id, confidence: 0.99 };
    }

    // 2. Verified official domain
    if (website && normWebsite(row.website) === website && website.length > 3) {
      return { decision: 'duplicate', reason: 'verified_domain', existingId: row.id, confidence: 0.95 };
    }

    // 3. Normalised phone
    const rowPhone = normalizePhoneForCountry(row.phone, countryCode);
    if (phone && rowPhone && phone === rowPhone && phone.length >= 8) {
      return { decision: 'duplicate', reason: 'normalised_phone', existingId: row.id, confidence: 0.92 };
    }

    // 4. Coordinates / address
    if (coords && row.coordinates) {
      const dist = haversineM(coords, row.coordinates);
      if (dist < 40 && nameKey && normalizeBusinessNameForMatch(row.name, countryCode) === nameKey) {
        return { decision: 'duplicate', reason: 'coords_name', existingId: row.id, confidence: 0.9 };
      }
      if (dist < 25) {
        return {
          decision: 'review_cluster',
          reason: 'coords_proximity',
          clusterId: clusterIdFor(placeId ?? nameKey, row.id),
          existingId: row.id,
          confidence: 0.75,
        };
      }
    }
    if (addr.matchKey && addr.matchKey.length > 8) {
      const rowAddr = normalizeAddressForCountry({
        countryCode,
        address: row.address,
        locality: row.locality ?? row.suburb ?? row.city,
        region: row.regionCode ?? row.state,
        postcode: row.postcode,
      });
      if (rowAddr.matchKey === addr.matchKey && nameKey === normalizeBusinessNameForMatch(row.name, countryCode)) {
        return { decision: 'duplicate', reason: 'address_name', existingId: row.id, confidence: 0.88 };
      }
    }

    // 5. Name + category + location — never translated-name alone
    const sameCategory =
      !params.categoryId ||
      !row.categoryId ||
      params.categoryId === row.categoryId;
    const sameLocality =
      normalizeBusinessNameForMatch(candidate.city, countryCode) ===
        normalizeBusinessNameForMatch(row.locality ?? row.suburb ?? row.city, countryCode) ||
      normalizeBusinessNameForMatch(candidate.city, countryCode) ===
        normalizeBusinessNameForMatch(row.city, countryCode);
    if (
      nameKey &&
      nameKey === normalizeBusinessNameForMatch(row.name ?? row.originalName, countryCode) &&
      sameCategory &&
      sameLocality
    ) {
      return {
        decision: 'review_cluster',
        reason: 'name_category_locality',
        clusterId: clusterIdFor(nameKey, row.id),
        existingId: row.id,
        confidence: 0.72,
      };
    }

    // Explicitly ignore translated-name-only similarity
    if (params.translatedName) {
      const tKey = normalizeBusinessNameForMatch(params.translatedName, 'AU');
      const rowEn = normalizeBusinessNameForMatch(row.name, 'AU');
      if (tKey && tKey === rowEn && !placeId && !phone && !website) {
        // Do not merge — leave unique (or soft review only if also same locality)
        if (sameLocality) {
          return {
            decision: 'review_cluster',
            reason: 'translated_name_needs_review',
            clusterId: clusterIdFor(tKey, row.id),
            existingId: row.id,
            confidence: 0.55,
          };
        }
      }
    }
  }

  return { decision: 'unique' };
}

export function shouldPersistAsDuplicate(decision: DedupeDecision): boolean {
  return decision.decision === 'duplicate';
}

/** Attach cluster id onto a candidate record when review is required. */
export function applyDuplicateCluster(
  record: BusinessCandidateRecord,
  decision: DedupeDecision,
): BusinessCandidateRecord {
  if (decision.decision !== 'review_cluster') return record;
  return { ...record, duplicateClusterId: decision.clusterId };
}
