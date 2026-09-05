/**
 * Mission 001 — business resolution outcomes (identity ≠ catalog).
 * Fail-closed: prefer UNRESOLVED over wrong-business attachment.
 */

export const BUSINESS_RESOLUTION_OUTCOME = Object.freeze({
  BUSINESS_RESOLVED: 'BUSINESS_RESOLVED',
  BUSINESS_RESOLVED_NO_WEBSITE: 'BUSINESS_RESOLVED_NO_WEBSITE',
  BUSINESS_RESOLVED_NO_CATALOG: 'BUSINESS_RESOLVED_NO_CATALOG',
  BUSINESS_UNRESOLVED: 'BUSINESS_UNRESOLVED',
  IDENTITY_AMBIGUOUS: 'IDENTITY_AMBIGUOUS',
  WEBSITE_NOT_FOUND: 'WEBSITE_NOT_FOUND',
  WEBSITE_FOUND: 'WEBSITE_FOUND',
  WEBSITE_IDENTITY_MISMATCH: 'WEBSITE_IDENTITY_MISMATCH',
  CATALOG_FOUND: 'CATALOG_FOUND',
  CATALOG_AUTHORITY_INSUFFICIENT: 'CATALOG_AUTHORITY_INSUFFICIENT',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  NO_AUTHORITATIVE_CATALOG: 'NO_AUTHORITATIVE_CATALOG',
});

export const RESOLUTION_CONFIDENCE = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  UNRESOLVED: 'UNRESOLVED',
});

/**
 * Parse free-form location into suburb/city/state/country fragments.
 * @param {string} [location]
 */
export function parseLocationParts(location) {
  const raw = String(location ?? '').trim();
  if (!raw) {
    return { raw: null, suburb: null, city: null, state: null, country: null, postcode: null };
  }
  const postcode = (raw.match(/\b(\d{4,5})\b/) || [])[1] || null;
  const state =
    (raw.match(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/i) || [])[1]?.toUpperCase() || null;
  const country = /\b(australia|vietnam|việt nam|viet nam)\b/i.test(raw)
    ? raw.match(/\b(australia|vietnam|việt nam|viet nam)\b/i)[1]
    : null;
  const withoutCodes = raw
    .replace(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/gi, ' ')
    .replace(/\b\d{4,5}\b/g, ' ')
    .replace(/\b(australia|vietnam|việt nam|viet nam)\b/gi, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = withoutCodes.split(/\s+/).filter(Boolean);
  const city = words.length ? words[words.length - 1] : null;
  const suburb = words.length > 1 ? words.slice(0, -1).join(' ') : words[0] || null;
  return { raw, suburb, city, state, country, postcode };
}

/**
 * Classify business resolution from live research / entity pipeline signals.
 * @param {object} ctx
 */
export function classifyBusinessResolution(ctx = {}) {
  const {
    wrongEntity = false,
    sourceBlocked = false,
    websiteFound = false,
    productCount = 0,
    entityCandidates = 0,
    selectedCandidate = null,
    sharedBrandWebsite = null,
    requiresOwnerConfirmation = false,
    pipelineMode = null,
    sourcesUsed = [],
    ownerWebsite = null,
    researchConfidence = null,
  } = ctx;

  const reasons = [];
  const sourceTypes = (sourcesUsed ?? []).map((s) =>
    String(s?.sourceType ?? s?.source?.sourceType ?? s ?? '').toLowerCase(),
  );
  const hasOfficialWebsiteSource = sourceTypes.some(
    (t) => t.includes('website') || t.includes('official'),
  );
  const onlyManual =
    sourceTypes.length > 0 && sourceTypes.every((t) => t === 'manual' || t === '');

  if (sourceBlocked) {
    return {
      outcome: BUSINESS_RESOLUTION_OUTCOME.SOURCE_UNAVAILABLE,
      confidence: RESOLUTION_CONFIDENCE.UNRESOLVED,
      identityResolved: false,
      catalogEligible: false,
      reasons: ['source_blocked'],
    };
  }

  if (wrongEntity) {
    return {
      outcome: BUSINESS_RESOLUTION_OUTCOME.WEBSITE_IDENTITY_MISMATCH,
      confidence: RESOLUTION_CONFIDENCE.UNRESOLVED,
      identityResolved: false,
      catalogEligible: false,
      reasons: ['wrong_entity_guard'],
    };
  }

  const hasEntity =
    Boolean(selectedCandidate) ||
    Boolean(sharedBrandWebsite) ||
    Boolean(ownerWebsite) ||
    (entityCandidates === 1 && !requiresOwnerConfirmation);

  if (pipelineMode === 'ambiguous_entity' && !sharedBrandWebsite && !ownerWebsite && productCount === 0) {
    return {
      outcome: BUSINESS_RESOLUTION_OUTCOME.IDENTITY_AMBIGUOUS,
      confidence: RESOLUTION_CONFIDENCE.LOW,
      identityResolved: false,
      catalogEligible: false,
      reasons: ['multiple_plausible_entities'],
    };
  }

  if (!hasEntity && (entityCandidates === 0 || onlyManual) && !websiteFound && productCount === 0) {
    reasons.push(entityCandidates === 0 ? 'no_entity_candidates' : 'manual_only_no_website');
    return {
      outcome: BUSINESS_RESOLUTION_OUTCOME.BUSINESS_UNRESOLVED,
      confidence: RESOLUTION_CONFIDENCE.UNRESOLVED,
      identityResolved: false,
      catalogEligible: false,
      reasons,
    };
  }

  if (websiteFound || sharedBrandWebsite || ownerWebsite || hasOfficialWebsiteSource) {
    if (productCount > 0) {
      return {
        outcome: BUSINESS_RESOLUTION_OUTCOME.CATALOG_FOUND,
        confidence:
          Number(researchConfidence) >= 0.85
            ? RESOLUTION_CONFIDENCE.HIGH
            : RESOLUTION_CONFIDENCE.MEDIUM,
        identityResolved: true,
        catalogEligible: true,
        reasons: ['website_and_catalog'],
      };
    }
    return {
      outcome: BUSINESS_RESOLUTION_OUTCOME.NO_AUTHORITATIVE_CATALOG,
      confidence: hasEntity ? RESOLUTION_CONFIDENCE.MEDIUM : RESOLUTION_CONFIDENCE.LOW,
      identityResolved: Boolean(hasEntity || websiteFound),
      catalogEligible: false,
      reasons: ['website_without_authoritative_catalog'],
    };
  }

  if (hasEntity && !websiteFound) {
    return {
      outcome: BUSINESS_RESOLUTION_OUTCOME.BUSINESS_RESOLVED_NO_WEBSITE,
      confidence: RESOLUTION_CONFIDENCE.MEDIUM,
      identityResolved: true,
      catalogEligible: false,
      reasons: ['entity_without_website'],
    };
  }

  if (productCount > 0) {
    return {
      outcome: BUSINESS_RESOLUTION_OUTCOME.CATALOG_FOUND,
      confidence: RESOLUTION_CONFIDENCE.MEDIUM,
      identityResolved: true,
      catalogEligible: true,
      reasons: ['catalog_without_explicit_website_flag'],
    };
  }

  return {
    outcome: BUSINESS_RESOLUTION_OUTCOME.BUSINESS_UNRESOLVED,
    confidence: RESOLUTION_CONFIDENCE.UNRESOLVED,
    identityResolved: false,
    catalogEligible: false,
    reasons: ['insufficient_identity_evidence'],
  };
}

/**
 * Separated Mission 001 metrics (A–E).
 * @param {object[]} rows
 */
export function computeMission001ResolutionMetrics(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const n = list.length || 1;

  const businessResolved = list.filter((r) => r.identityResolved === true);
  const catalogEligible = list.filter(
    (r) => r.catalogEligible === true || r.resolutionOutcome === BUSINESS_RESOLUTION_OUTCOME.CATALOG_FOUND,
  );
  const eligibleReconstructed = catalogEligible.filter(
    (r) => Number(r.productCount) > 0 && Number(r.falseOfferingCount ?? 0) === 0,
  );
  const endToEndWithOfferings = list.filter(
    (r) => Number(r.productCount) > 0 && Number(r.falseOfferingCount ?? 0) === 0,
  );

  let falseOfferings = 0;
  let totalOfferings = 0;
  for (const r of list) {
    totalOfferings += Number(r.productCount) || 0;
    falseOfferings += Number(r.falseOfferingCount) || 0;
  }

  const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

  return {
    /** A */ businessResolutionRatePct: pct(businessResolved.length, list.length),
    businessResolved: businessResolved.length,
    businessTotal: list.length,
    /** B */ catalogEligibilityRatePct: pct(catalogEligible.length, businessResolved.length),
    catalogEligible: catalogEligible.length,
    /** C */ eligibleOfferingReconstructionRatePct: pct(
      eligibleReconstructed.length,
      catalogEligible.length,
    ),
    eligibleOfferingReconstructed: eligibleReconstructed.length,
    /** D */ endToEndOfferingCoveragePct: pct(endToEndWithOfferings.length, list.length),
    endToEndWithOfferings: endToEndWithOfferings.length,
    /** E */ falseOfferingRatePct: totalOfferings
      ? Math.round((falseOfferings / totalOfferings) * 1000) / 10
      : 0,
    falseOfferingCount: falseOfferings,
    falseOfferingTotal: totalOfferings,
    /** Legacy-compatible: identity-resolved ∩ offerings-publicly-expected */
    legacyOfferingReconstructionEligible: list.filter(
      (r) => r.identityResolved === true && r.offeringsPubliclyExpected !== false,
    ).length,
  };
}

/**
 * Distinctive token overlap for name matching — fail-closed.
 * Requires ≥2 significant shared tokens; rejects generic single-token hits.
 * @param {string} inputName
 * @param {string} candidateName
 */
export function distinctiveNameTokenOverlap(inputName, candidateName) {
  const stop = new Set([
    'the',
    'and',
    'co',
    'company',
    'ltd',
    'pty',
    'group',
    'services',
    'service',
    'store',
    'shop',
    'trading',
    'export',
    'import',
    'melbourne',
    'sydney',
    'australia',
    'vietnam',
    'cong',
    'ty',
    'tnhh',
    'cty',
    // Industry labels — not brand identity (blocks My Flower → Florist Braybrook)
    'flower',
    'flowers',
    'florist',
    'floral',
    'bloom',
    'blooms',
    'bouquet',
    'cafe',
    'coffee',
    'restaurant',
    'bakery',
    'salon',
    'spa',
    'pizza',
    'noodle',
    'noodles',
  ]);
  const tokens = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !stop.has(t));

  const a = new Set(tokens(inputName));
  const b = new Set(tokens(candidateName));
  if (a.size < 2) return { overlap: 0, shared: [], strong: false };
  const shared = [...a].filter((t) => b.has(t));
  return {
    overlap: shared.length,
    shared,
    strong: shared.length >= 2 && shared.length / a.size >= 0.66,
  };
}

export default {
  BUSINESS_RESOLUTION_OUTCOME,
  RESOLUTION_CONFIDENCE,
  parseLocationParts,
  classifyBusinessResolution,
  computeMission001ResolutionMetrics,
  distinctiveNameTokenOverlap,
};
