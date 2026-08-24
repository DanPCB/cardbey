/**
 * Mission 001 — audit traces for 5 remaining eligible offering misses.
 */
import { config as loadDotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.join(root, '.env') });
loadDotenv({ path: path.join(root, '.env.local'), override: true });

const { MISSION001_LIVE_INPUTS } = await import('../src/lib/mission001/benchmarkFixtures.js');
const { resolveBusinessEntity } = await import('../src/lib/storeResearch/businessEntityResolver.js');
const { searchGooglePlaces, isGooglePlacesConfigured } = await import(
  '../src/lib/businessDiscovery/businessDiscoverySources.js'
);
const { matchCandidates } = await import('../src/lib/businessDiscovery/businessEntityResolver.js');

const IDS = [
  'florist-name-loc',
  'finance-name-loc',
  'trades-name-loc',
  'vn-sme-name-loc',
  'service-name-loc',
];

function unwrap(row) {
  return row?.raw && typeof row.raw === 'object' ? row.raw : row;
}

const traces = [];
console.error('placesConfigured', isGooglePlacesConfigured());

for (const id of IDS) {
  const live = MISSION001_LIVE_INPUTS[id];
  const entity = await resolveBusinessEntity({
    businessName: live.businessName,
    location: live.location,
    websiteHint: live.website,
    phoneHint: live.phone,
  });

  const query = `${live.businessName} ${live.location || ''}`.trim();
  const rawPlaces = isGooglePlacesConfigured()
    ? await searchGooglePlaces(query, live.location)
    : [];

  const placePreview = rawPlaces.slice(0, 8).map((row, i) => {
    const raw = unwrap(row);
    const name = raw.businessName ?? raw.name;
    const website = raw.website ?? null;
    const address = raw.address ?? raw.formattedAddress ?? null;
    const match = matchCandidates(
      { name: live.businessName, location: live.location ?? null, phone: null, website: null },
      { name, location: address, phone: raw.phone ?? null, website },
    );
    return {
      rank: i + 1,
      name,
      website,
      address: address ? String(address).slice(0, 80) : null,
      placeId: raw.placeId ?? raw.sourceId ?? null,
      matchScore: match.score,
      matchReasons: match.reasons,
    };
  });

  const selected = entity.selectedCandidate;
  const shared = entity.sharedBrandWebsite ?? null;

  let outcome = 'BUSINESS_UNRESOLVED';
  if (entity.candidates.length > 1 && entity.requiresOwnerConfirmation && !shared) {
    outcome = 'IDENTITY_AMBIGUOUS';
  } else if (selected?.website || shared) {
    outcome = 'WEBSITE_FOUND';
  } else if (selected || (entity.candidates.length === 1 && entity.candidates[0])) {
    outcome = entity.candidates[0]?.website ? 'WEBSITE_FOUND' : 'BUSINESS_RESOLVED_NO_WEBSITE';
  } else if (entity.candidates.length === 0) {
    outcome = 'BUSINESS_UNRESOLVED';
  }

  const rejectionReasons = [];
  if (!entity.candidates.length) rejectionReasons.push('no_places_candidate_above_threshold');
  if (entity.requiresOwnerConfirmation && entity.candidates.length > 1 && !shared) {
    rejectionReasons.push('multiple_plausible_entities_no_shared_website');
  }
  if (entity.candidates.length === 1 && !entity.selectedCandidate && (entity.candidates[0]?.confidence ?? 0) < 0.72) {
    rejectionReasons.push('single_candidate_below_strong_threshold_no_soft_select');
  }
  for (const p of placePreview) {
    if (p.matchScore < 0.45) rejectionReasons.push(`weak_name_match:${p.name}`);
  }

  traces.push({
    fixtureId: id,
    inputBusinessName: live.businessName,
    inputLocation: live.location,
    category: live.category ?? null,
    normalizedName: String(live.businessName).trim().toLowerCase(),
    placesConfigured: isGooglePlacesConfigured(),
    placesQuery: query,
    placesRawCount: rawPlaces.length,
    candidateEntities: entity.candidates.map((c) => ({
      name: c.name,
      website: c.website,
      location: c.location,
      confidence: c.confidence,
      matchReasons: c.matchReasons,
      placeId: c.placeId,
    })),
    placePreview,
    selectedCandidate: selected
      ? { name: selected.name, website: selected.website, confidence: selected.confidence }
      : null,
    sharedBrandWebsite: shared,
    identityConfidence: entity.confidence,
    requiresOwnerConfirmation: entity.requiresOwnerConfirmation,
    resolutionNotes: entity.resolutionNotes,
    rejectionReasons: [...new Set(rejectionReasons)],
    authoritativeSourceStatus: selected?.website || shared ? 'website_candidate' : 'none',
    catalogAuthorityStatus: 'not_evaluated_no_research',
    finalResolutionOutcome: outcome,
  });

  console.error(`[audit] ${live.businessName} → ${outcome} candidates=${entity.candidates.length}`);
}

const outPath = path.join(root, '../../../docs/reports/mission001-five-fixture-resolution-audit.json');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), traces }, null, 2));
console.log(JSON.stringify({ count: traces.length, outcomes: traces.map((t) => ({ b: t.inputBusinessName, o: t.finalResolutionOutcome, n: t.candidateEntities.length, reasons: t.rejectionReasons })) }, null, 2));
console.error('wrote', outPath);
