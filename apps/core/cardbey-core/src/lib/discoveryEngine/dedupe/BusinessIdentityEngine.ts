import {
  cleanString,
  normalizePhone,
  websiteHost,
} from '../../businessDiscovery/businessDataNormalizer.js';
import type { BusinessCandidate, IdentityDecision } from '../types/index.js';

export interface IdentityMatchInput {
  businessName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
}

function slugWord(value: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nameSimilarity(a: string | null, b: string | null): number {
  const na = slugWord(a);
  const nb = slugWord(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.75;
  const aParts = na.split('-').filter(Boolean);
  const bParts = nb.split('-').filter(Boolean);
  const shared = aParts.filter((p) => bParts.includes(p)).length;
  return shared / Math.max(aParts.length, bParts.length);
}

function phonesEquivalent(a: string | null, b: string | null): boolean {
  const phoneA = normalizePhone(a);
  const phoneB = normalizePhone(b);
  if (!phoneA || !phoneB) return false;

  const digitsA = phoneA.replace(/\D/g, '');
  const digitsB = phoneB.replace(/\D/g, '');
  if (!digitsA || !digitsB) return false;
  if (digitsA === digitsB) return true;

  // AU local vs international (0390001000 ↔ 61390001000)
  if (digitsA.startsWith('61') && digitsB.startsWith('0')) {
    return digitsA === `61${digitsB.slice(1)}`;
  }
  if (digitsB.startsWith('61') && digitsA.startsWith('0')) {
    return digitsB === `61${digitsA.slice(1)}`;
  }
  return false;
}

export function computeIdentityScore(a: IdentityMatchInput, b: IdentityMatchInput): number {
  let score = 0;

  const phoneMatch = phonesEquivalent(a.phone, b.phone);
  if (phoneMatch) score += 35;

  const hostA = websiteHost(a.website);
  const hostB = websiteHost(b.website);
  const websiteMatch = !!(hostA && hostB && hostA === hostB);
  if (websiteMatch) score += 30;

  const emailA = cleanString(a.email)?.toLowerCase();
  const emailB = cleanString(b.email)?.toLowerCase();
  if (emailA && emailB && emailA === emailB) score += 25;

  let coordMatch: 'exact' | 'near' | null = null;
  if (
    a.latitude != null &&
    a.longitude != null &&
    b.latitude != null &&
    b.longitude != null
  ) {
    const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    if (km < 0.05) {
      score += 20;
      coordMatch = 'exact';
    } else if (km < 0.2) {
      score += 10;
      coordMatch = 'near';
    }
  }

  const nameSim = nameSimilarity(a.businessName, b.businessName);
  score += nameSim * 15;

  // Strong single-signal duplicates (staging validation contract)
  if (websiteMatch) score = Math.max(score, 96);
  if (phoneMatch) score = Math.max(score, 96);

  // Same brand name → at least review (e.g. chain locations in different suburbs)
  if (nameSim >= 0.75) score = Math.max(score, 72);

  // Same name at same location → at least review; exact coords → duplicate
  if (nameSim >= 0.75 && coordMatch === 'exact') score = Math.max(score, 85);
  if (nameSim >= 1 && coordMatch === 'exact') score = Math.max(score, 96);

  return Math.min(100, Math.round(score));
}

export function identityDecisionFromScore(score: number): IdentityDecision {
  if (score > 95) return 'duplicate';
  if (score >= 70) return 'review_required';
  return 'unique';
}

export class BusinessIdentityEngine {
  scorePair(a: IdentityMatchInput, b: IdentityMatchInput): number {
    return computeIdentityScore(a, b);
  }

  classify(score: number): IdentityDecision {
    return identityDecisionFromScore(score);
  }

  bestMatchScore(
    candidate: BusinessCandidate,
    corpus: BusinessCandidate[],
    externalId?: string,
  ): number {
    let best = 0;
    for (const other of corpus) {
      if (externalId && other.externalId === externalId) continue;
      const score = computeIdentityScore(candidate, other);
      if (score > best) best = score;
    }
    return best;
  }
}

export const businessIdentityEngine = new BusinessIdentityEngine();
