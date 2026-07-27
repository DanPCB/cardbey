/**
 * Business normalization engine (Phase 2).
 * Deterministic rules first; optional LLM enrichment can wrap this later.
 * Never fabricates data — unknown fields remain unknown.
 */

import { randomUUID } from 'node:crypto';
import {
  cleanString,
  normalizePhone,
  normalizeWebsite,
  clampConfidence,
} from '../businessDiscovery/businessDataNormalizer.js';
import type { NormalizedBusinessRecord, RawBusinessRecord } from './types.js';

const CATEGORY_KEYWORDS: Array<{ pattern: RegExp; category: string; confidence: number }> = [
  { pattern: /\b(restaurant|cafe|coffee|bakery|food|dining|bistro|eatery)\b/i, category: 'food', confidence: 0.85 },
  { pattern: /\b(salon|spa|beauty|nail|hair|barber)\b/i, category: 'beauty', confidence: 0.85 },
  { pattern: /\b(retail|shop|store|boutique|market)\b/i, category: 'retail', confidence: 0.75 },
  { pattern: /\b(clinic|medical|dental|health|pharmacy|doctor)\b/i, category: 'health', confidence: 0.85 },
  { pattern: /\b(gym|fitness|yoga|sport)\b/i, category: 'fitness', confidence: 0.8 },
  { pattern: /\b(hotel|motel|lodging|accommodation)\b/i, category: 'hospitality', confidence: 0.85 },
  { pattern: /\b(law|legal|accounting|consulting|agency)\b/i, category: 'services', confidence: 0.75 },
  { pattern: /\b(auto|mechanic|garage|car wash)\b/i, category: 'automotive', confidence: 0.8 },
];

const ADDRESS_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bSt\.?\b/gi, 'Street'],
  [/\bRd\.?\b/gi, 'Road'],
  [/\bAve\.?\b/gi, 'Avenue'],
  [/\bBlvd\.?\b/gi, 'Boulevard'],
  [/\bDr\.?\b/gi, 'Drive'],
  [/\bLn\.?\b/gi, 'Lane'],
];

function normalizeBusinessName(value: unknown): string | null {
  const s = cleanString(value);
  if (!s) return null;
  return s
    .replace(/\s+(pty|ltd|llc|inc|corp|co)\.?\s*$/i, (m) => m.trim())
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddress(value: unknown): string | null {
  const s = cleanString(value);
  if (!s) return null;
  let out = s;
  for (const [re, rep] of ADDRESS_ABBREVIATIONS) {
    out = out.replace(re, rep);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value: unknown): string | null {
  const s = cleanString(value);
  if (!s) return null;
  const lower = s.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : null;
}

function normalizeRegistrationNumber(value: unknown): string | null {
  const s = cleanString(value);
  if (!s) return null;
  const compact = s.replace(/[\s-]/g, '').toUpperCase();
  return compact.length >= 4 ? compact : null;
}

function classifyCategory(
  explicit: string | null,
  name: string | null,
): { category: string | null; confidence: number } {
  if (explicit) {
    const norm = explicit.toLowerCase().trim();
    for (const rule of CATEGORY_KEYWORDS) {
      if (rule.pattern.test(norm)) {
        return { category: rule.category, confidence: Math.max(rule.confidence, 0.7) };
      }
    }
    return { category: norm, confidence: 0.65 };
  }
  if (name) {
    for (const rule of CATEGORY_KEYWORDS) {
      if (rule.pattern.test(name)) {
        return { category: rule.category, confidence: rule.confidence };
      }
    }
  }
  return { category: explicit, confidence: explicit ? 0.5 : 0 };
}

function inferGeo(
  address: string | null,
  operatingRegion: string | null,
): { country: string | null; state: string | null; city: string | null } {
  const source = address ?? operatingRegion;
  if (!source) return { country: null, state: null, city: null };

  const parts = source.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return {
      city: parts[parts.length - 3] ?? null,
      state: parts[parts.length - 2] ?? null,
      country: parts[parts.length - 1] ?? null,
    };
  }
  if (parts.length === 2) {
    return { city: parts[0], state: null, country: parts[1] };
  }
  return { city: parts[0] ?? null, state: null, country: operatingRegion };
}

function computeRecordConfidence(input: {
  businessName: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  email: string | null;
  registrationNumber: string | null;
  categoryConfidence: number;
}): number {
  let score = 0.35;
  if (input.businessName) score += 0.1;
  if (input.phone) score += 0.15;
  if (input.website) score += 0.12;
  if (input.address) score += 0.12;
  if (input.email) score += 0.08;
  if (input.registrationNumber) score += 0.1;
  score += input.categoryConfidence * 0.08;
  if (input.businessName && !input.phone && !input.website && !input.address) score -= 0.15;
  return clampConfidence(score);
}

export class BusinessNormalizer {
  normalize(raw: RawBusinessRecord): NormalizedBusinessRecord {
    const businessName = normalizeBusinessName(raw.businessName);
    const legalName = normalizeBusinessName(raw.legalName);
    const address = normalizeAddress(raw.address);
    const phone = normalizePhone(raw.phone);
    const website = normalizeWebsite(raw.website);
    const email = normalizeEmail(raw.email);
    const registrationNumber = normalizeRegistrationNumber(raw.registrationNumber);
    const operatingRegion = cleanString(raw.operatingRegion);
    const { category, confidence: categoryConfidence } = classifyCategory(
      cleanString(raw.category),
      businessName,
    );
    const geo = inferGeo(address, operatingRegion);

    const confidenceScore = computeRecordConfidence({
      businessName,
      phone,
      website,
      address,
      email,
      registrationNumber,
      categoryConfidence,
    });

    return {
      id: randomUUID(),
      businessName,
      legalName,
      address,
      phone,
      website,
      category,
      categoryConfidence,
      registrationNumber,
      email,
      operatingRegion,
      country: geo.country,
      state: geo.state,
      city: geo.city,
      confidenceScore,
      sourceType: raw.sourceType,
      sourceReference: raw.sourceReference,
      sourceRowId: raw.sourceRowId,
      ingestedAt: raw.fetchedAt,
    };
  }

  normalizeMany(rawRecords: RawBusinessRecord[]): NormalizedBusinessRecord[] {
    return rawRecords.map((r) => this.normalize(r));
  }
}

export const businessNormalizer = new BusinessNormalizer();
