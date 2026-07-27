/**
 * Entity resolution engine (Phase 3).
 * Detects duplicates using website, phone, registration number,
 * address similarity, and business name similarity.
 */

import {
  cleanString,
  normalizePhone,
  websiteHost,
} from '../businessDiscovery/businessDataNormalizer.js';
import type {
  MatchEvidence,
  NormalizedBusinessRecord,
  ResolutionStatus,
} from './types.js';

export interface EntityResolutionFields {
  id: string;
  businessName: string | null;
  phone: string | null;
  website: string | null;
  registrationNumber: string | null;
  address: string | null;
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

function addressTokens(address: string | null): Set<string> {
  const s = cleanString(address);
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function addressSimilarity(a: string | null, b: string | null): number {
  const ta = addressTokens(a);
  const tb = addressTokens(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap++;
  }
  return overlap / Math.max(ta.size, tb.size);
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

export interface MatchResult {
  matched: boolean;
  status: ResolutionStatus;
  score: number;
  evidence: MatchEvidence[];
}

export function matchEntities(
  incoming: EntityResolutionFields,
  existing: EntityResolutionFields,
): MatchResult {
  const evidence: MatchEvidence[] = [];
  let score = 0;

  const phoneA = normalizePhone(incoming.phone);
  const phoneB = normalizePhone(existing.phone);
  if (phoneA && phoneB && phoneA === phoneB) {
    evidence.push({ field: 'phone', signal: 'exact', score: 0.65 });
    score += 0.65;
  }

  const hostA = websiteHost(incoming.website);
  const hostB = websiteHost(existing.website);
  if (hostA && hostB && hostA === hostB) {
    evidence.push({ field: 'website', signal: 'host-exact', score: 0.6 });
    score += 0.6;
  }

  const regA = incoming.registrationNumber?.toUpperCase() ?? '';
  const regB = existing.registrationNumber?.toUpperCase() ?? '';
  if (regA && regB && regA === regB) {
    evidence.push({ field: 'registrationNumber', signal: 'exact', score: 0.7 });
    score += 0.7;
  }

  const nameSim = nameSimilarity(incoming.businessName, existing.businessName);
  if (nameSim >= 0.75) {
    evidence.push({ field: 'businessName', signal: nameSim === 1 ? 'exact' : 'partial', score: nameSim * 0.4 });
    score += nameSim * 0.4;
  }

  const addrSim = addressSimilarity(incoming.address, existing.address);
  if (addrSim >= 0.5) {
    evidence.push({ field: 'address', signal: 'token-overlap', score: addrSim * 0.35 });
    score += addrSim * 0.35;
  }

  if (score > 1) score = 1;

  const strongId =
    evidence.some((e) => e.field === 'phone' || e.field === 'website' || e.field === 'registrationNumber');

  let status: ResolutionStatus = 'unique';
  let matched = false;

  if (strongId && score >= 0.6) {
    status = 'duplicate';
    matched = true;
  } else if (score >= 0.55 || (nameSim >= 0.75 && addrSim >= 0.5)) {
    status = 'possible_duplicate';
    matched = true;
  } else if (score >= 0.75) {
    status = 'duplicate';
    matched = true;
  }

  return { matched, status, score, evidence };
}

export interface ResolvedRecord {
  record: NormalizedBusinessRecord;
  status: ResolutionStatus;
  matchEvidence: MatchEvidence[];
  matchedRecordId: string | null;
}

export class EntityResolver {
  resolveBatch(records: NormalizedBusinessRecord[]): ResolvedRecord[] {
    const accepted: NormalizedBusinessRecord[] = [];
    const results: ResolvedRecord[] = [];

    for (const record of records) {
      let best: { existing: NormalizedBusinessRecord; match: MatchResult } | null = null;

      for (const existing of accepted) {
        const match = matchEntities(record, existing);
        if (match.matched && (!best || match.score > best.match.score)) {
          best = { existing, match };
        }
      }

      if (best?.match.status === 'duplicate') {
        results.push({
          record,
          status: 'duplicate',
          matchEvidence: best.match.evidence,
          matchedRecordId: best.existing.id,
        });
        continue;
      }

      if (best?.match.status === 'possible_duplicate') {
        accepted.push(record);
        results.push({
          record,
          status: 'possible_duplicate',
          matchEvidence: best.match.evidence,
          matchedRecordId: best.existing.id,
        });
        continue;
      }

      accepted.push(record);
      results.push({
        record,
        status: 'unique',
        matchEvidence: [],
        matchedRecordId: null,
      });
    }

    return results;
  }
}

export const entityResolver = new EntityResolver();
