/**
 * Entity resolution / de-duplication.
 *
 * Rule: "Avoid duplicate records by name + phone + location + website."
 * We compute a primary dedupe key plus secondary match signals so that the
 * same business arriving from different sources resolves to one record.
 */

import {
  cleanString,
  normalizePhone,
  normalizeWebsite,
  websiteHost,
} from './businessDataNormalizer.js';
import type { BusinessDiscoveryCandidate } from './businessDiscoveryTypes.js';

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

/** Coarse locality token from a free-form address/location string. */
function localityToken(location: string | null): string {
  const s = cleanString(location);
  if (!s) return '';
  // Use the most specific non-numeric tokens (suburb/city) — keep last 2 words.
  const words = s
    .toLowerCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(-2).join('-');
}

export interface DedupeFields {
  name: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
}

/**
 * Build a stable dedupe key from name + phone + location + website.
 * Phone and website host are the strongest signals; name+locality back them up.
 */
export function buildDedupeKey(fields: DedupeFields): string {
  const name = slugWord(fields.name);
  const phone = normalizePhone(fields.phone) ?? '';
  const host = websiteHost(fields.website) ?? '';
  const locality = localityToken(fields.location);
  return [name, phone, host, locality].join('|');
}

export interface MatchSignal {
  matched: boolean;
  score: number; // 0..1 strength of the match
  reasons: string[];
}

/**
 * Decide whether two candidates are the same business.
 * Strong signals (exact phone, same website host) match alone.
 * Otherwise require name similarity + (locality or partial contact) agreement.
 */
export function matchCandidates(
  a: DedupeFields,
  b: DedupeFields,
): MatchSignal {
  const reasons: string[] = [];
  let score = 0;

  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA === phoneB) {
    reasons.push('phone');
    score += 0.6;
  }

  const hostA = websiteHost(a.website);
  const hostB = websiteHost(b.website);
  if (hostA && hostB && hostA === hostB) {
    reasons.push('website');
    score += 0.5;
  }

  const nameA = slugWord(a.name);
  const nameB = slugWord(b.name);
  if (nameA && nameB) {
    if (nameA === nameB) {
      reasons.push('name-exact');
      score += 0.4;
    } else if (nameA.includes(nameB) || nameB.includes(nameA)) {
      reasons.push('name-partial');
      score += 0.2;
    }
  }

  const locA = localityToken(a.location);
  const locB = localityToken(b.location);
  if (locA && locB && locA === locB) {
    reasons.push('locality');
    score += 0.2;
  }

  if (score > 1) score = 1;

  // A single strong identifier (phone or website) is enough.
  const strong = reasons.includes('phone') || reasons.includes('website');
  // Otherwise, need name agreement plus a corroborating signal.
  const corroborated =
    (reasons.includes('name-exact') || reasons.includes('name-partial')) &&
    reasons.includes('locality');

  return { matched: strong || corroborated, score, reasons };
}

/**
 * Find an existing candidate that represents the same business as `incoming`.
 * Returns the best match (highest score) above the match threshold, or null.
 */
export function findDuplicate(
  incoming: DedupeFields,
  existing: BusinessDiscoveryCandidate[],
): { candidate: BusinessDiscoveryCandidate; signal: MatchSignal } | null {
  const incKey = buildDedupeKey(incoming);
  let best: { candidate: BusinessDiscoveryCandidate; signal: MatchSignal } | null = null;

  for (const c of existing) {
    // Fast path: identical dedupe key.
    if (c.dedupeKey && c.dedupeKey === incKey && incKey.replace(/\|/g, '').length > 0) {
      return { candidate: c, signal: { matched: true, score: 1, reasons: ['dedupe-key'] } };
    }
    const signal = matchCandidates(incoming, {
      name: c.name,
      phone: c.phone,
      website: c.website,
      location: c.location?.raw ?? c.address ?? null,
    });
    if (signal.matched && (!best || signal.score > best.signal.score)) {
      best = { candidate: c, signal };
    }
  }
  return best;
}
