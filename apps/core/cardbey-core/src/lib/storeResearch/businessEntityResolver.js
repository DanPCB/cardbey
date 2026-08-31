/**
 * Phase 1 — Business entity resolution for existing-business store creation.
 * Never auto-selects when multiple plausible businesses exist.
 */

import { randomUUID } from 'node:crypto';
import {
  searchGooglePlaces,
  fetchGooglePlaceDetails,
  isGooglePlacesConfigured,
} from '../businessDiscovery/businessDiscoverySources.js';
import { matchCandidates, buildDedupeKey } from '../businessDiscovery/businessEntityResolver.js';
import { cleanString, normalizeWebsite, normalizePhone } from '../businessDiscovery/businessDataNormalizer.js';
import { distinctiveNameTokenOverlap } from '../mission001/businessResolutionOutcomes.js';

const STRONG_MATCH_THRESHOLD = 0.72;
const AUTO_SELECT_MAX_CANDIDATES = 1;
const PLAUSIBLE_CANDIDATE_THRESHOLD = 0.45;

function slugId(prefix, seed) {
  return `${prefix}_${String(seed).replace(/[^a-z0-9]+/gi, '_').slice(0, 48)}_${randomUUID().slice(0, 8)}`;
}

function websiteHostKey(url) {
  const normalized = normalizeWebsite(url);
  if (!normalized) return null;
  try {
    const host = new URL(normalized).hostname.replace(/^www\./i, '').toLowerCase();
    // Collapse country TLDs that share the same brand label (bluescopesteel.com / .com.au)
    const parts = host.split('.');
    if (parts.length >= 2) {
      const base = parts.slice(0, -1).join('.');
      // Prefer full host for matching; compare without final TLD only when identical brand stem
      return host;
    }
    return host;
  } catch {
    return null;
  }
}

/**
 * If multiple Place candidates share one brand website host, return a stable URL.
 * Used to continue offering research without inventing a storefront entity pick.
 * @param {object[]} candidates
 */
export function sharedBrandWebsiteFromCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2) return null;
  /** @type {Map<string, string>} */
  const byHost = new Map();
  for (const c of candidates) {
    const host = websiteHostKey(c?.website);
    const url = normalizeWebsite(c?.website);
    if (!host || !url) continue;
    if (!byHost.has(host)) byHost.set(host, url);
  }
  if (byHost.size === 1) return [...byHost.values()][0];

  // Same brand stem with different public suffixes (example.com / example.com.au)
  const stems = new Map();
  for (const [host, url] of byHost) {
    const stem = host.replace(/\.(com\.au|co\.uk|com|net|org|au)$/i, '');
    if (!stems.has(stem)) stems.set(stem, url);
    else if (websiteHostKey(stems.get(stem)) !== host) {
      // keep first; stem collision across different brands is rare for Place siblings
    }
  }
  if (stems.size === 1 && byHost.size >= 2) return [...stems.values()][0];
  return null;
}

function nameMatchIsStrong(candidate) {
  const reasons = candidate?.matchReasons ?? [];
  // Token overlap alone is NOT strong enough to soft-select — too many
  // same-city brand collisions (e.g. multiple "Phương Nam" companies).
  return reasons.includes('name-exact') || reasons.includes('name-partial');
}

/**
 * Soft-select for research enrichment only when identity is defensible.
 * Prefer UNRESOLVED over wrong-business catalog attachment.
 */
function canSoftSelectForResearch(candidate, { ambiguous, sharedBrandWebsite }) {
  if (!candidate || ambiguous) return false;
  if (!(candidate.website || sharedBrandWebsite)) return false;
  return nameMatchIsStrong(candidate);
}

/**
 * `searchGooglePlaces` returns `{ source, attribution, raw }`. Identity matching
 * must read the nested `raw` fields (name, placeId, website, address).
 * @param {object} row
 */
export function unwrapPlacesSearchRow(row) {
  if (!row || typeof row !== 'object') return row;
  const nested = row.raw;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    if (
      nested.name != null ||
      nested.businessName != null ||
      nested.placeId != null ||
      nested.sourceId != null ||
      nested.website != null ||
      nested.address != null ||
      nested.formattedAddress != null
    ) {
      return nested;
    }
  }
  return row;
}

/**
 * `searchGooglePlaces` returns `{ source, attribution, raw }`. Identity matching
 * must read the nested `raw` fields (name, placeId, website, address).
 * @param {object} row
 */
export function unwrapPlacesSearchRow(row) {
  if (!row || typeof row !== 'object') return row;
  const nested = row.raw;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    if (
      nested.name != null ||
      nested.businessName != null ||
      nested.placeId != null ||
      nested.sourceId != null ||
      nested.website != null ||
      nested.address != null ||
      nested.formattedAddress != null
    ) {
      return nested;
    }
  }
  return row;
}

function rawToCandidate(raw, index, input) {
  const name = cleanString(raw.businessName ?? raw.name) || input.businessName;
  const phone = normalizePhone(cleanString(raw.phone)) ?? undefined;
  const website = normalizeWebsite(cleanString(raw.website)) ?? undefined;
  const address = cleanString(raw.address ?? raw.location ?? raw.formattedAddress);
  const placeId = cleanString(raw.placeId ?? raw.sourceId ?? raw.id);

  const match = matchCandidates(
    {
      name: input.businessName,
      phone: input.phoneHint ?? null,
      website: input.websiteHint ?? null,
      location: input.location ?? null,
    },
    { name, phone: phone ?? null, website: website ?? null, location: address ?? null },
  );

  let confidence = Math.min(1, Math.max(0, match.score));
  // Suburb-only intake vs Place formattedAddress ("… VIC 3023, Australia") often
  // disagrees on localityToken last-2 words. Keep named Place hits as candidates.
  if (
    placeId &&
    (match.reasons.includes('name-exact') || match.reasons.includes('name-partial'))
  ) {
    confidence = Math.max(confidence, 0.5);
  }

  // Distinctive multi-token brand overlap (fail-closed): requires ≥2 significant shared tokens.
  const tokenOverlap = distinctiveNameTokenOverlap(input.businessName, name);
  if (tokenOverlap.strong) {
    confidence = Math.max(confidence, 0.55);
    if (!match.reasons.includes('name-exact') && !match.reasons.includes('name-partial')) {
      match.reasons = [...match.reasons, 'name-token-overlap'];
    }
  }

  return {
    entityId: placeId ? slugId('place', placeId) : slugId('candidate', `${name}_${index}`),
    name,
    tradingName: name,
    address: address ?? null,
    location: address ?? input.location ?? null,
    phone: phone ?? null,
    website: website ?? null,
    placeId: placeId ?? null,
    category: cleanString(raw.category ?? raw.primaryType) ?? null,
    confidence,
    matchReasons: match.reasons,
    tokenOverlap,
    source: 'google_places',
  };
}

async function enrichCandidateDetails(candidate) {
  if (!candidate.placeId) return candidate;
  try {
    const details = await fetchGooglePlaceDetails(candidate.placeId);
    if (!details || typeof details !== 'object') return candidate;
    return {
      ...candidate,
      name: cleanString(details.businessName ?? details.name) || candidate.name,
      phone: normalizePhone(cleanString(details.phone)) ?? candidate.phone,
      website: normalizeWebsite(cleanString(details.website)) ?? candidate.website,
      address: cleanString(details.address ?? details.location) ?? candidate.address,
      location: cleanString(details.location ?? details.address) ?? candidate.location,
    };
  } catch {
    return candidate;
  }
}

function dedupeCandidates(candidates) {
  const seen = new Map();
  for (const c of candidates) {
    const key =
      c.placeId ||
      buildDedupeKey({
        name: c.name,
        phone: c.phone ?? null,
        website: c.website ?? null,
        location: c.location ?? null,
      });
    const prev = seen.get(key);
    if (!prev || c.confidence > prev.confidence) seen.set(key, c);
  }
  return [...seen.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Resolve business entity candidates from public signals.
 * @param {import('./types.js').BusinessEntityResolverInput} input
 */
export async function resolveBusinessEntity(input) {
  const businessName = cleanString(input.businessName);
  const location = cleanString(input.location);
  const notes = [];

  if (!businessName || businessName.length < 2) {
    return {
      candidates: [],
      confidence: 0,
      requiresOwnerConfirmation: true,
      resolutionNotes: ['Business name too short for entity resolution'],
    };
  }

  let candidates = [];

  if (input.websiteHint) {
    const website = normalizeWebsite(input.websiteHint);
    if (website) {
      candidates.push({
        entityId: slugId('web', website),
        name: businessName,
        website,
        location: location ?? null,
        phone: normalizePhone(input.phoneHint ?? null) ?? null,
        confidence: 0.55,
        matchReasons: ['website_hint'],
        source: 'website',
      });
      notes.push('Included owner website hint as candidate');
    }
  }

  if (isGooglePlacesConfigured()) {
    const query = location ? `${businessName} ${location}` : businessName;
    const places = await searchGooglePlaces(query, location);
    const mapped = places
      .slice(0, 8)
      .map((row, i) => rawToCandidate(unwrapPlacesSearchRow(row), i, input))
      .filter((c) => c.confidence >= PLAUSIBLE_CANDIDATE_THRESHOLD);
    candidates.push(...mapped);
    if (mapped.length) notes.push(`Google Places returned ${mapped.length} plausible candidate(s)`);
  } else {
    notes.push('Google Places not configured — entity resolution limited to hints');
  }

  candidates = dedupeCandidates(candidates);

  // Enrich top candidates so website is available for shared-brand / research hints.
  const enrichCount = Math.min(3, candidates.length);
  for (let i = 0; i < enrichCount; i++) {
    if (candidates[i]?.placeId) {
      candidates[i] = await enrichCandidateDetails(candidates[i]);
    }
  }

  const top = candidates[0];
  const second = candidates[1];
  const strongTokenHits = candidates.filter((c) => c?.tokenOverlap?.strong === true);
  const ambiguous =
    (candidates.length > 1 &&
      second &&
      top &&
      top.confidence >= PLAUSIBLE_CANDIDATE_THRESHOLD &&
      second.confidence >= PLAUSIBLE_CANDIDATE_THRESHOLD &&
      top.confidence - second.confidence < 0.12) ||
    strongTokenHits.length > 1;

  const strongSingleton =
    candidates.length === AUTO_SELECT_MAX_CANDIDATES &&
    top &&
    top.confidence >= STRONG_MATCH_THRESHOLD &&
    !ambiguous;

  const sharedBrandWebsite = sharedBrandWebsiteFromCandidates(candidates);

  let selectedCandidate;
  if (strongSingleton) {
    selectedCandidate = top;
    notes.push('Single strong match — pre-selected for owner review (not auto-persisted)');
  } else if (strongTokenHits.length > 1) {
    notes.push(
      'Multiple distinctive name-token matches — identity ambiguous; prefer UNRESOLVED over wrong business',
    );
  } else if (
    strongTokenHits.length === 1 &&
    canSoftSelectForResearch(strongTokenHits[0], { ambiguous, sharedBrandWebsite })
  ) {
    const hit = strongTokenHits[0];
    selectedCandidate = hit.website ? hit : { ...hit, website: sharedBrandWebsite };
    notes.push(
      `Distinctive token overlap (${(hit.tokenOverlap?.shared || []).join('+')}) with name match + website — research enrichment only`,
    );
  } else if (
    candidates.length === 1 &&
    canSoftSelectForResearch(top, { ambiguous, sharedBrandWebsite })
  ) {
    // Research-safe soft select: one Place hit with name-exact/partial + website.
    selectedCandidate = top.website
      ? top
      : { ...top, website: sharedBrandWebsite };
    notes.push('Single name-matched candidate with website — research enrichment only (owner confirm for persist)');
  } else if (ambiguous && sharedBrandWebsite) {
    notes.push(
      `Multiple locations share brand website ${sharedBrandWebsite} — research may proceed; owner must confirm entity`,
    );
  } else if (candidates.length > 1) {
    notes.push('Multiple plausible businesses — owner must confirm');
  } else if (!candidates.length) {
    notes.push('No public entity match — treat as new business');
  } else if (strongTokenHits.length === 1 && !nameMatchIsStrong(strongTokenHits[0])) {
    notes.push(
      'Token overlap without name-exact/partial — left UNRESOLVED to avoid wrong-business catalog',
    );
  }

  return {
    candidates,
    selectedCandidate,
    sharedBrandWebsite: sharedBrandWebsite ?? null,
    confidence: top?.confidence ?? 0,
    requiresOwnerConfirmation: !strongSingleton || ambiguous || candidates.length !== 1,
    resolutionNotes: notes,
  };
}

/**
 * @param {import('./types.js').BusinessEntityResolverInput} input
 */
export function isExistingBusinessIntent(input) {
  const name = cleanString(input.businessName);
  if (!name || name.length < 2) return false;
  return Boolean(cleanString(input.location) || input.websiteHint || input.phoneHint);
}
