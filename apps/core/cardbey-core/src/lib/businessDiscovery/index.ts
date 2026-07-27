/**
 * Business Discovery / Ingestion Layer — orchestration entry point (Phase 1).
 *
 * Flow: search permitted sources → normalize facts → resolve duplicates →
 * create unclaimed/draft records → claim → generate channel payload.
 */

import { randomUUID } from 'node:crypto';

import type {
  BusinessDiscoveryCandidate,
  DiscoverySource,
  DiscoveryImportInput,
  DiscoverySearchInput,
} from './businessDiscoveryTypes.js';
import { MIN_CONFIDENCE_FOR_NON_DRAFT } from './businessDiscoveryTypes.js';
import {
  computeConfidence,
  normalizeFacts,
  clampConfidence,
} from './businessDataNormalizer.js';
import { buildDedupeKey, findDuplicate } from './businessEntityResolver.js';
import { createAttribution, mergeAttributions } from './businessSourceAttribution.js';
import { evaluateClaim } from './businessClaimStatus.js';
import {
  extractFromWebsite,
  fromManualInput,
  isGooglePlacesConfigured,
  searchGooglePlaces,
  type RawDiscoveryResult,
} from './businessDiscoverySources.js';
import {
  getCandidateById,
  listCandidates,
  saveCandidate,
} from './businessDiscoveryRepository.js';

export * from './businessDiscoveryTypes.js';
export { isGooglePlacesConfigured } from './businessDiscoverySources.js';

function looksLikeUrl(value: string): boolean {
  return /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(value.trim());
}

/** Build a fully-shaped (un-persisted) candidate from a raw source result. */
function buildCandidate(
  result: RawDiscoveryResult,
  opts: { confidenceOverride?: number | null } = {},
): BusinessDiscoveryCandidate {
  const facts = normalizeFacts(result.raw);
  const now = new Date().toISOString();
  const confidence = computeConfidence({
    source: result.source,
    name: facts.name,
    phone: facts.phone,
    website: facts.website,
    address: facts.address,
    rating: facts.rating,
    reviewCount: facts.reviewCount,
    override: opts.confidenceOverride ?? null,
  });
  const dedupeKey = buildDedupeKey({
    name: facts.name,
    phone: facts.phone,
    website: facts.website,
    location: facts.location?.raw ?? facts.address ?? null,
  });

  return {
    id: randomUUID(),
    name: facts.name ?? '',
    category: facts.category,
    address: facts.address,
    phone: facts.phone,
    website: facts.website,
    openingHours: facts.openingHours,
    photos: facts.photos,
    rating: facts.rating,
    reviewCount: facts.reviewCount,
    source: result.source,
    sourceUrl: result.attribution.sourceUrl,
    confidence,
    claimStatus: 'unclaimed',
    attributions: [result.attribution],
    location: facts.location,
    socialLinks: facts.socialLinks,
    dedupeKey,
    imported: false,
    claimedByUserId: null,
    generatedStoreId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Collapse duplicate candidates that came from different sources in one search. */
function dedupeWithinResults(
  candidates: BusinessDiscoveryCandidate[],
): BusinessDiscoveryCandidate[] {
  const out: BusinessDiscoveryCandidate[] = [];
  for (const c of candidates) {
    const dup = findDuplicate(
      { name: c.name, phone: c.phone, website: c.website, location: c.location?.raw ?? c.address ?? null },
      out,
    );
    if (dup) {
      const target = dup.candidate;
      target.attributions = mergeAttributions(target.attributions, c.attributions);
      target.category = target.category ?? c.category;
      target.address = target.address ?? c.address;
      target.phone = target.phone ?? c.phone;
      target.website = target.website ?? c.website;
      target.openingHours = target.openingHours ?? c.openingHours;
      target.rating = target.rating ?? c.rating;
      target.reviewCount = target.reviewCount ?? c.reviewCount;
      target.photos = target.photos.length ? target.photos : c.photos;
      target.confidence = Math.max(target.confidence, c.confidence);
    } else {
      out.push(c);
    }
  }
  return out;
}

export interface SearchResult {
  query: string;
  location: string | null;
  sourcesUsed: DiscoverySource[];
  googlePlacesConfigured: boolean;
  candidates: BusinessDiscoveryCandidate[];
}

/**
 * Search permitted sources for a business. Pure discovery — nothing is persisted.
 * Already-imported records that match are flagged via `imported: true`.
 */
export async function searchBusinesses(
  input: DiscoverySearchInput,
): Promise<SearchResult> {
  const q = (input.q || '').trim();
  const location = input.location?.trim() || null;
  const sourcesUsed: DiscoverySource[] = [];
  const raw: RawDiscoveryResult[] = [];

  if (!q) {
    return {
      query: q,
      location,
      sourcesUsed,
      googlePlacesConfigured: isGooglePlacesConfigured(),
      candidates: [],
    };
  }

  // If the query is a URL, extract from the (user-supplied) website.
  if (looksLikeUrl(q)) {
    const websiteResults = await extractFromWebsite(q);
    if (websiteResults.length) {
      raw.push(...websiteResults);
      sourcesUsed.push(websiteResults[0].source);
    }
  }

  // Official Google Places API (only when configured).
  const placeResults = await searchGooglePlaces(q, location);
  if (placeResults.length) {
    raw.push(...placeResults);
    sourcesUsed.push('google_places');
  }

  let candidates = raw.map((r) => buildCandidate(r));
  candidates = dedupeWithinResults(candidates);

  // Cross-reference the persisted store so the UI can show claim status.
  const existing = await listCandidates();
  for (const c of candidates) {
    const dup = findDuplicate(
      { name: c.name, phone: c.phone, website: c.website, location: c.location?.raw ?? c.address ?? null },
      existing,
    );
    if (dup) {
      c.id = dup.candidate.id;
      c.imported = true;
      c.claimStatus = dup.candidate.claimStatus;
      c.claimedByUserId = dup.candidate.claimedByUserId;
      c.generatedStoreId = dup.candidate.generatedStoreId;
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return {
    query: q,
    location,
    sourcesUsed: [...new Set(sourcesUsed)],
    googlePlacesConfigured: isGooglePlacesConfigured(),
    candidates,
  };
}

export interface ImportResult {
  ok: boolean;
  candidate: BusinessDiscoveryCandidate;
  deduped: boolean;
  draft: boolean;
  message: string;
}

/**
 * Import a candidate as an unclaimed/draft record.
 * - If it matches an existing record, facts are merged (no duplicate created).
 * - Low-confidence imports remain DRAFT (caller can surface this).
 * External data is always stored `unclaimed` with full attribution.
 */
export async function importBusiness(
  input: DiscoveryImportInput,
): Promise<ImportResult> {
  let base: BusinessDiscoveryCandidate;

  if (input.candidateId) {
    const fromSearchStore = await getCandidateById(input.candidateId);
    if (fromSearchStore) {
      base = fromSearchStore;
    } else {
      // candidateId referenced a transient search result; fall back to raw fields.
      base = buildCandidate(
        fromManualInput(rawFromInput(input), input.source ?? 'manual', input.sourceUrl ?? null),
        { confidenceOverride: input.confidence ?? null },
      );
    }
  } else {
    base = buildCandidate(
      fromManualInput(rawFromInput(input), input.source ?? 'manual', input.sourceUrl ?? null),
      { confidenceOverride: input.confidence ?? null },
    );
  }

  if (!base.name) {
    return {
      ok: false,
      candidate: base,
      deduped: false,
      draft: true,
      message: 'A business name is required to import.',
    };
  }

  // Dedup against the persisted store.
  const existing = await listCandidates();
  const dup = findDuplicate(
    { name: base.name, phone: base.phone, website: base.website, location: base.location?.raw ?? base.address ?? null },
    existing,
  );

  if (dup) {
    const merged = mergeInto(dup.candidate, base);
    merged.imported = true;
    merged.updatedAt = new Date().toISOString();
    await saveCandidate(merged);
    return {
      ok: true,
      candidate: merged,
      deduped: true,
      draft: merged.confidence < MIN_CONFIDENCE_FOR_NON_DRAFT,
      message: 'Matched an existing record — details merged (no duplicate created).',
    };
  }

  base.imported = true;
  base.claimStatus = 'unclaimed';
  base.updatedAt = new Date().toISOString();
  await saveCandidate(base);
  const draft = base.confidence < MIN_CONFIDENCE_FOR_NON_DRAFT;
  return {
    ok: true,
    candidate: base,
    deduped: false,
    draft,
    message: draft
      ? 'Imported as a low-confidence draft. Add details to strengthen it.'
      : 'Imported as an unclaimed business record.',
  };
}

function rawFromInput(input: DiscoveryImportInput): Record<string, unknown> {
  return {
    name: input.name ?? null,
    category: input.category ?? null,
    address: input.address ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    location: input.location ?? input.address ?? null,
    socialLinks: input.socialLinks ?? undefined,
    photos: input.photos ?? undefined,
    openingHours: input.openingHours ?? undefined,
    rating: input.rating ?? undefined,
    reviewCount: input.reviewCount ?? undefined,
  };
}

/** Merge new facts into an existing record without overwriting non-empty fields. */
function mergeInto(
  target: BusinessDiscoveryCandidate,
  incoming: BusinessDiscoveryCandidate,
): BusinessDiscoveryCandidate {
  const merged: BusinessDiscoveryCandidate = { ...target };
  merged.category = target.category ?? incoming.category;
  merged.address = target.address ?? incoming.address;
  merged.phone = target.phone ?? incoming.phone;
  merged.website = target.website ?? incoming.website;
  merged.openingHours = target.openingHours ?? incoming.openingHours;
  merged.rating = target.rating ?? incoming.rating;
  merged.reviewCount = target.reviewCount ?? incoming.reviewCount;
  merged.location = target.location ?? incoming.location;
  merged.photos = target.photos.length ? target.photos : incoming.photos;
  merged.socialLinks =
    target.socialLinks || incoming.socialLinks
      ? { ...(incoming.socialLinks ?? {}), ...(target.socialLinks ?? {}) }
      : null;
  merged.attributions = mergeAttributions(target.attributions, incoming.attributions);
  merged.confidence = clampConfidence(Math.max(target.confidence, incoming.confidence));
  return merged;
}

export interface ClaimInput {
  userId: string;
  /** A real verification proof (email/phone/domain) flips this true. Phase 1 placeholder. */
  verified?: boolean;
}

export async function claimBusiness(
  id: string,
  input: ClaimInput,
): Promise<{ ok: boolean; candidate: BusinessDiscoveryCandidate | null; message: string }> {
  const record = await getCandidateById(id);
  if (!record) {
    return { ok: false, candidate: null, message: 'Business record not found.' };
  }
  const verified = Boolean(input.verified);
  const result = evaluateClaim({ current: record.claimStatus, verified });
  if (!result.ok) {
    return { ok: false, candidate: record, message: result.message };
  }
  const updated: BusinessDiscoveryCandidate = {
    ...record,
    claimStatus: result.status,
    claimedByUserId: result.status === 'claimed' ? input.userId : record.claimedByUserId,
    updatedAt: new Date().toISOString(),
  };
  await saveCandidate(updated);
  return { ok: true, candidate: updated, message: result.message };
}

/** Mark which Cardbey store/channel was generated from this record. */
export async function attachGeneratedStore(
  id: string,
  storeId: string,
): Promise<BusinessDiscoveryCandidate | null> {
  const record = await getCandidateById(id);
  if (!record) return null;
  const updated = { ...record, generatedStoreId: storeId, updatedAt: new Date().toISOString() };
  await saveCandidate(updated);
  return updated;
}

/**
 * Convert an imported candidate into a `POST /api/business/create` orchestra payload,
 * so the existing (unchanged) store/channel generation pipeline can use discovered data.
 */
export function candidateToBuildStorePayload(record: BusinessDiscoveryCandidate): {
  sourceType: string;
  payload: Record<string, unknown>;
} {
  return {
    sourceType: 'business_discovery',
    payload: {
      businessName: record.name,
      businessType: record.category ?? undefined,
      location: record.location?.raw ?? record.address ?? undefined,
      website: record.website ?? undefined,
      phone: record.phone ?? undefined,
      socialLinks: record.socialLinks ?? undefined,
    },
  };
}

export { getCandidateById, listCandidates } from './businessDiscoveryRepository.js';
