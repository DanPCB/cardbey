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

const STRONG_MATCH_THRESHOLD = 0.72;
const AUTO_SELECT_MAX_CANDIDATES = 1;
const PLAUSIBLE_CANDIDATE_THRESHOLD = 0.45;

function slugId(prefix, seed) {
  return `${prefix}_${seed.replace(/[^a-z0-9]+/gi, '_').slice(0, 48)}_${randomUUID().slice(0, 8)}`;
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
    confidence: Math.min(1, Math.max(0, match.score)),
    matchReasons: match.reasons,
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
      .map((raw, i) => rawToCandidate(raw, i, input))
      .filter((c) => c.confidence >= PLAUSIBLE_CANDIDATE_THRESHOLD);
    candidates.push(...mapped);
    if (mapped.length) notes.push(`Google Places returned ${mapped.length} plausible candidate(s)`);
  } else {
    notes.push('Google Places not configured — entity resolution limited to hints');
  }

  candidates = dedupeCandidates(candidates);

  if (candidates.length === 1 && candidates[0].placeId) {
    candidates[0] = await enrichCandidateDetails(candidates[0]);
  }

  const top = candidates[0];
  const second = candidates[1];
  const ambiguous =
    candidates.length > 1 &&
    second &&
    top &&
    top.confidence >= PLAUSIBLE_CANDIDATE_THRESHOLD &&
    second.confidence >= PLAUSIBLE_CANDIDATE_THRESHOLD &&
    top.confidence - second.confidence < 0.12;

  const strongSingleton =
    candidates.length === AUTO_SELECT_MAX_CANDIDATES &&
    top &&
    top.confidence >= STRONG_MATCH_THRESHOLD &&
    !ambiguous;

  let selectedCandidate;
  if (strongSingleton) {
    selectedCandidate = top;
    notes.push('Single strong match — pre-selected for owner review (not auto-persisted)');
  } else if (candidates.length > 1) {
    notes.push('Multiple plausible businesses — owner must confirm');
  } else if (!candidates.length) {
    notes.push('No public entity match — treat as new business');
  }

  return {
    candidates,
    selectedCandidate,
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
