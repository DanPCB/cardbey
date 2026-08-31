/**
 * Mission 001 — live benchmark failure taxonomy + offering reconstruction metrics.
 */

export const FAILURE_CLASSES = Object.freeze([
  'IDENTITY_NOT_RESOLVED',
  'WEBSITE_FOUND_NO_CATALOG',
  'STRUCTURED_CATALOG_FOUND',
  'PRODUCTS_FOUND_LOW_CONFIDENCE',
  'SERVICES_FOUND_LOW_CONFIDENCE',
  'REFERENCE_HAS_NO_COMMERCE_CONTENT',
  'SOURCE_BLOCKED',
  'SPARSE_CORRECTLY',
  'WRONG_ENTITY',
  'OTHER',
]);

const STRUCTURED_SOURCE_RE =
  /\b(shopify|woocommerce|bookwell|fresha|square|schema\.org|menu|booking_platform|shopify_store)\b/i;

/**
 * @param {object} ctx
 * @returns {string}
 */
export function classifyMission001Failure(ctx = {}) {
  const {
    fixture,
    identityResolved,
    wrongEntity,
    websiteFound,
    productCount = 0,
    sparseMode,
    researchConfidence,
    sourcesUsed = [],
    researchFallbackReason,
    sourceBlocked,
    evidenceQuality,
    inputType,
  } = ctx;

  if (wrongEntity) return 'WRONG_ENTITY';
  if (sourceBlocked) return 'SOURCE_BLOCKED';

  const hasStructuredSource = (sourcesUsed ?? []).some((s) => {
    const blob = `${s?.sourceType ?? ''} ${s?.source?.sourceType ?? ''} ${s?.via ?? ''} ${s?.sourceUrl ?? ''}`;
    return STRUCTURED_SOURCE_RE.test(blob);
  });

  if (productCount > 0 && hasStructuredSource) return 'STRUCTURED_CATALOG_FOUND';

  if (productCount > 0) {
    const conf = Number(researchConfidence);
    const low = Number.isFinite(conf) && conf < 0.7;
    const kind = String(ctx.businessKind ?? '').toLowerCase();
    if (low && /product|retail|food_menu|menu/.test(kind)) return 'PRODUCTS_FOUND_LOW_CONFIDENCE';
    if (low) return 'SERVICES_FOUND_LOW_CONFIDENCE';
    if (hasStructuredSource) return 'STRUCTURED_CATALOG_FOUND';
    // Evidence-backed offerings without structured platform — still success class
    return 'STRUCTURED_CATALOG_FOUND';
  }

  if (!identityResolved) {
    if (
      evidenceQuality === 'weak' ||
      inputType === 'name_only' ||
      fixture?.evidenceQuality === 'weak' ||
      fixture?.inputType === 'name_only'
    ) {
      return 'SPARSE_CORRECTLY';
    }
    return 'IDENTITY_NOT_RESOLVED';
  }

  // Identity resolved, zero offerings
  if (websiteFound) return 'WEBSITE_FOUND_NO_CATALOG';

  if (
    researchFallbackReason === 'no_catalog_items' ||
    sparseMode === true
  ) {
    // Public reference may simply have no commerce surface
    if (evidenceQuality === 'weak' || inputType === 'name_only') return 'SPARSE_CORRECTLY';
    return 'REFERENCE_HAS_NO_COMMERCE_CONTENT';
  }

  if (sparseMode) return 'SPARSE_CORRECTLY';
  return 'OTHER';
}

/**
 * @param {object[]} rows — extended live rows with failureClass + flags
 */
export function summarizeFailureTaxonomy(rows) {
  const counts = Object.fromEntries(FAILURE_CLASSES.map((c) => [c, 0]));
  for (const row of rows) {
    const cls = FAILURE_CLASSES.includes(row.failureClass) ? row.failureClass : 'OTHER';
    counts[cls] += 1;
  }
  const total = rows.length || 1;
  const pct = {};
  for (const cls of FAILURE_CLASSES) {
    pct[cls] = Math.round((counts[cls] / total) * 1000) / 10;
  }
  return { counts, pct, total: rows.length };
}

/**
 * Offering Reconstruction Rate:
 * among correctly resolved identities where public offerings are expected,
 * share that reconstructed ≥1 evidence-grounded offering.
 *
 * @param {object[]} rows
 */
export function computeOfferingReconstructionRate(rows) {
  const eligible = rows.filter(
    (r) =>
      r.identityResolved === true &&
      r.wrongEntity !== true &&
      r.offeringsPubliclyExpected !== false,
  );
  if (!eligible.length) {
    return { eligible: 0, reconstructed: 0, ratePct: null };
  }
  const reconstructed = eligible.filter((r) => Number(r.productCount) > 0 && Number(r.falseOfferingCount ?? 0) === 0);
  return {
    eligible: eligible.length,
    reconstructed: reconstructed.length,
    ratePct: Math.round((reconstructed.length / eligible.length) * 1000) / 10,
  };
}

/**
 * False Offering Rate: unsupported generated offerings / all generated offerings.
 * @param {object[]} rows
 */
export function computeFalseOfferingRate(rows) {
  let totalOfferings = 0;
  let falseOfferings = 0;
  for (const r of rows) {
    const n = Number(r.productCount) || 0;
    totalOfferings += n;
    falseOfferings += Number(r.falseOfferingCount) || 0;
  }
  if (!totalOfferings) {
    return { totalOfferings: 0, falseOfferings: 0, ratePct: 0 };
  }
  return {
    totalOfferings,
    falseOfferings,
    ratePct: Math.round((falseOfferings / totalOfferings) * 1000) / 10,
  };
}

/**
 * @param {object[]} rows
 */
export function summarizeByVertical(rows) {
  /** @type {Record<string, object[]>} */
  const by = {};
  for (const row of rows) {
    const v = row.vertical ?? 'unknown';
    if (!by[v]) by[v] = [];
    by[v].push(row);
  }

  return Object.entries(by)
    .map(([vertical, group]) => {
      const identitySuccess = group.filter((r) => r.identityResolved === true).length;
      const offeringEligible = group.filter(
        (r) => r.identityResolved === true && r.offeringsPubliclyExpected !== false,
      );
      const offeringOk = offeringEligible.filter((r) => Number(r.productCount) > 0).length;
      const fidelities = group.map((r) => Number(r.fidelityScore)).filter((n) => Number.isFinite(n));
      return {
        vertical,
        n: group.length,
        identitySuccessPct: Math.round((identitySuccess / group.length) * 1000) / 10,
        offeringReconstructionPct: offeringEligible.length
          ? Math.round((offeringOk / offeringEligible.length) * 1000) / 10
          : null,
        medianFidelity: median(fidelities),
        websiteFoundNoCatalog: group.filter((r) => r.failureClass === 'WEBSITE_FOUND_NO_CATALOG').length,
        structuredCatalogFound: group.filter((r) => r.failureClass === 'STRUCTURED_CATALOG_FOUND').length,
      };
    })
    .sort((a, b) => a.vertical.localeCompare(b.vertical));
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Heuristic: expect public commerce content for website / strong / medium evidence
 * unless reference is deliberately weak name-only.
 */
export function offeringsPubliclyExpected(fixture, liveInput) {
  if (fixture.inputType === 'name_only' || fixture.evidenceQuality === 'weak') return false;
  if (liveInput?.website) return true;
  if (fixture.inputType === 'website' || fixture.evidenceQuality === 'strong') return true;
  // name+location / social / reference — often have public offerings but not guaranteed
  return true;
}
