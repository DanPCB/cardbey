/**
 * Runtime JS sibling for Node without TS remapping.
 * Keep behavior aligned with businessEntityResolver.ts.
 */

import {
  cleanString,
  normalizePhone,
  websiteHost,
} from './businessDataNormalizer.js';

function slugWord(value) {
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
function localityToken(location) {
  const s = cleanString(location);
  if (!s) return '';
  const words = s
    .toLowerCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(-2).join('-');
}

/**
 * Build a stable dedupe key from name + phone + location + website.
 * Phone and website host are the strongest signals; name+locality back them up.
 */
export function buildDedupeKey(fields) {
  const name = slugWord(fields.name);
  const phone = normalizePhone(fields.phone) ?? '';
  const host = websiteHost(fields.website) ?? '';
  const locality = localityToken(fields.location);
  return [name, phone, host, locality].join('|');
}

/**
 * Decide whether two candidates are the same business.
 * Strong signals (exact phone, same website host) match alone.
 * Otherwise require name similarity + (locality or partial contact) agreement.
 */
export function matchCandidates(a, b) {
  const reasons = [];
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

  const strong = reasons.includes('phone') || reasons.includes('website');
  const corroborated =
    (reasons.includes('name-exact') || reasons.includes('name-partial')) &&
    reasons.includes('locality');

  return { matched: strong || corroborated, score, reasons };
}

/**
 * Find an existing candidate that represents the same business as `incoming`.
 * Returns the best match (highest score) above the match threshold, or null.
 */
export function findDuplicate(incoming, existing) {
  const incKey = buildDedupeKey(incoming);
  let best = null;

  for (const c of existing) {
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
