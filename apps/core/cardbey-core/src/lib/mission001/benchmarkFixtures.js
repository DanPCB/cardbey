/**
 * Mission 001 Gate 10 — controlled benchmark fixture registry.
 * Never publishes or contacts businesses.
 *
 * Offline fixtures are id/vertical/inputType only.
 * Live fixtures add public research inputs (name/location/website) for Places/web research.
 */

export const MISSION001_BENCHMARK_FIXTURES = [
  { id: 'florist-strong-web', vertical: 'florist', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'florist-name-loc', vertical: 'florist', inputType: 'name_location', evidenceQuality: 'medium' },
  { id: 'florist-name-only', vertical: 'florist', inputType: 'name_only', evidenceQuality: 'weak' },
  { id: 'beauty-strong-web', vertical: 'beauty', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'beauty-social', vertical: 'beauty', inputType: 'social', evidenceQuality: 'medium' },
  { id: 'beauty-name-only', vertical: 'beauty', inputType: 'name_only', evidenceQuality: 'weak' },
  { id: 'cafe-strong-web', vertical: 'cafe', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'restaurant-ref', vertical: 'restaurant', inputType: 'reference', evidenceQuality: 'medium' },
  { id: 'cafe-name-loc', vertical: 'cafe', inputType: 'name_location', evidenceQuality: 'medium' },
  { id: 'finance-strong-web', vertical: 'financial', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'finance-name-only', vertical: 'financial', inputType: 'name_only', evidenceQuality: 'weak' },
  { id: 'finance-name-loc', vertical: 'financial', inputType: 'name_location', evidenceQuality: 'medium' },
  { id: 'trades-strong-web', vertical: 'trades', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'trades-name-loc', vertical: 'trades', inputType: 'name_location', evidenceQuality: 'medium' },
  { id: 'trades-weak-name', vertical: 'trades', inputType: 'name_only', evidenceQuality: 'weak' },
  { id: 'security-strong-web', vertical: 'security', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'manufacturing-ref', vertical: 'manufacturing', inputType: 'reference', evidenceQuality: 'medium' },
  { id: 'security-name-only', vertical: 'security', inputType: 'name_only', evidenceQuality: 'weak' },
  { id: 'consulting-strong-web', vertical: 'consulting', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'consulting-name-loc', vertical: 'consulting', inputType: 'name_location', evidenceQuality: 'medium' },
  { id: 'consulting-weak', vertical: 'consulting', inputType: 'name_only', evidenceQuality: 'weak' },
  { id: 'retailer-strong-web', vertical: 'retail', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'retailer-social', vertical: 'retail', inputType: 'social', evidenceQuality: 'medium' },
  { id: 'retailer-name-only', vertical: 'retail', inputType: 'name_only', evidenceQuality: 'weak' },
  { id: 'vn-sme-export-web', vertical: 'vietnamese_sme', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'vn-sme-name-loc', vertical: 'vietnamese_sme', inputType: 'name_location', evidenceQuality: 'medium' },
  { id: 'vn-sme-weak', vertical: 'vietnamese_sme', inputType: 'name_only', evidenceQuality: 'weak' },
  { id: 'service-strong-web', vertical: 'service', inputType: 'website', evidenceQuality: 'strong' },
  { id: 'service-name-loc', vertical: 'service', inputType: 'name_location', evidenceQuality: 'medium' },
  { id: 'service-name-only', vertical: 'service', inputType: 'name_only', evidenceQuality: 'weak' },
];

/**
 * Public research inputs for live staging (Places + website scrape only).
 * Never used to email, call, publish, or claim businesses.
 *
 * @type {Record<string, {
 *   businessName: string,
 *   location?: string,
 *   website?: string,
 *   category?: string,
 *   socialLinks?: Record<string, string>,
 * }>}
 */
export const MISSION001_LIVE_INPUTS = {
  'florist-strong-web': {
    businessName: 'Grandiflora',
    location: 'Surry Hills NSW',
    website: 'https://www.grandiflora.net',
    category: 'Florist',
  },
  'florist-name-loc': {
    businessName: 'Flower Store',
    location: 'Melbourne VIC',
    category: 'Florist',
  },
  'florist-name-only': {
    businessName: 'Bloom & Petal Studio',
  },
  'beauty-strong-web': {
    businessName: 'Mecca Cosmetica',
    location: 'Melbourne VIC',
    website: 'https://www.mecca.com.au',
    category: 'Beauty',
  },
  'beauty-social': {
    businessName: 'Glamshell Beauty',
    location: 'Sydney NSW',
    category: 'Beauty salon',
    socialLinks: { instagram: 'https://www.instagram.com' },
  },
  'beauty-name-only': {
    businessName: 'Luxe Nail Bar Collective',
  },
  'cafe-strong-web': {
    businessName: 'Market Lane Coffee',
    location: 'Melbourne VIC',
    website: 'https://www.marketlane.com.au',
    category: 'Cafe',
  },
  'restaurant-ref': {
    businessName: 'Chin Chin',
    location: 'Melbourne VIC',
    category: 'Restaurant',
  },
  'cafe-name-loc': {
    businessName: 'Little Nap Coffee Roasters',
    location: 'Fitzroy VIC',
    category: 'Cafe',
  },
  'finance-strong-web': {
    businessName: 'Vanguard Investments Australia',
    location: 'Melbourne VIC',
    website: 'https://www.vanguard.com.au',
    category: 'Financial services',
  },
  'finance-name-only': {
    businessName: 'Anison Capital',
  },
  'finance-name-loc': {
    businessName: 'Anison Capital',
    location: 'Melbourne VIC',
    category: 'Financial planner',
  },
  'trades-strong-web': {
    businessName: 'Jim\'s Mowing',
    location: 'Melbourne VIC',
    website: 'https://jimsmowing.com.au',
    category: 'Lawn mowing',
  },
  'trades-name-loc': {
    businessName: 'CA Handy Man',
    location: 'Melbourne VIC',
    category: 'Handyman',
  },
  'trades-weak-name': {
    businessName: 'Apex Trade Solutions Group',
  },
  'security-strong-web': {
    businessName: 'Modern Security Doors',
    location: 'Ravenhall VIC 3023',
    website: 'https://www.modernsecuritydoors.com.au',
    category: 'Home & garden',
  },
  'manufacturing-ref': {
    businessName: 'BlueScope Steel',
    location: 'Melbourne VIC',
    category: 'Manufacturing',
  },
  'security-name-only': {
    businessName: 'SecurePoint Access Systems',
  },
  'consulting-strong-web': {
    businessName: 'Deloitte Australia',
    location: 'Melbourne VIC',
    website: 'https://www.deloitte.com/au',
    category: 'Consulting',
  },
  'consulting-name-loc': {
    businessName: 'Nous Group',
    location: 'Melbourne VIC',
    category: 'Consulting',
  },
  'consulting-weak': {
    businessName: 'Northbridge Advisory Partners',
  },
  'retailer-strong-web': {
    businessName: 'Cotton On',
    location: 'Geelong VIC',
    website: 'https://cottonon.com',
    category: 'Retail fashion',
  },
  'retailer-social': {
    businessName: 'Typo',
    location: 'Melbourne VIC',
    category: 'Retail',
    socialLinks: { instagram: 'https://www.instagram.com' },
  },
  'retailer-name-only': {
    businessName: 'Harbor Lane Goods Co',
  },
  'vn-sme-export-web': {
    businessName: 'Vinamilk',
    location: 'Ho Chi Minh City',
    website: 'https://www.vinamilk.com.vn',
    category: 'Food manufacturing',
  },
  'vn-sme-name-loc': {
    businessName: 'Phuong Nam Export Trading',
    location: 'Ho Chi Minh City',
    category: 'Export trading',
  },
  'vn-sme-weak': {
    businessName: 'Saigon Horizon Trading',
  },
  'service-strong-web': {
    businessName: 'Hireup',
    location: 'Sydney NSW',
    website: 'https://hireup.com.au',
    category: 'Disability support services',
  },
  'service-name-loc': {
    businessName: 'Spotless Cleaning Services',
    location: 'Melbourne VIC',
    category: 'Cleaning',
  },
  'service-name-only': {
    businessName: 'BrightPath Local Services',
  },
};

/**
 * @param {object} fixture
 */
export function resolveLiveInput(fixture) {
  const live = MISSION001_LIVE_INPUTS[fixture.id];
  if (!live) {
    return {
      businessName: fixture.id,
      category: fixture.vertical,
    };
  }
  return { ...live };
}

/**
 * @param {object} row
 */
export function normalizeBenchmarkRow(row) {
  return {
    business: row.business ?? row.id,
    vertical: row.vertical ?? null,
    inputType: row.inputType ?? 'unknown',
    evidenceQuality: row.evidenceQuality ?? 'unknown',
    resolutionConfidence: row.resolutionConfidence ?? null,
    generationTime: row.generationTime ?? row.totalMs ?? null,
    fidelityScore: row.fidelityScore ?? null,
    catalogGrounding: row.catalogGrounding ?? null,
    unsupportedClaims: row.unsupportedClaims ?? null,
    imageRelevance: row.imageRelevance ?? null,
    repairCycles: row.repairCycles ?? 0,
    finalStatus: row.finalStatus ?? 'pending',
    failureClass: row.failureClass ?? null,
    identityResolved: row.identityResolved ?? null,
    wrongEntity: row.wrongEntity ?? null,
    websiteFound: row.websiteFound ?? null,
    productCount: row.productCount ?? null,
    offeringsPubliclyExpected: row.offeringsPubliclyExpected ?? null,
    falseOfferingCount: row.falseOfferingCount ?? null,
    offeringReconstructed: row.offeringReconstructed ?? null,
    sparseMode: row.sparseMode ?? null,
    researchRan: row.researchRan ?? null,
    researchConfidence: row.researchConfidence ?? null,
    researchFallbackReason: row.researchFallbackReason ?? null,
    businessKind: row.businessKind ?? null,
    sourcesUsedSummary: row.sourcesUsedSummary ?? null,
    resolutionOutcome: row.resolutionOutcome ?? null,
    resolutionConfidenceBand: row.resolutionConfidenceBand ?? null,
    catalogEligible: row.catalogEligible ?? null,
    resolutionReasons: row.resolutionReasons ?? null,
    websiteAcceptedReason: row.websiteAcceptedReason ?? null,
  };
}

export function benchmarkFixtureCount() {
  return MISSION001_BENCHMARK_FIXTURES.length;
}

/**
 * Aggregate launch-readiness metrics from normalized rows.
 * @param {ReturnType<typeof normalizeBenchmarkRow>[]} rows
 */
export function summarizeBenchmarkRows(rows) {
  const times = rows.map((r) => Number(r.generationTime)).filter((n) => Number.isFinite(n) && n > 0);
  const fidelities = rows.map((r) => Number(r.fidelityScore)).filter((n) => Number.isFinite(n));
  const grounding = rows.map((r) => Number(r.catalogGrounding)).filter((n) => Number.isFinite(n));
  const hardFailures = rows.filter((r) => String(r.finalStatus) === 'hard_failure').length;
  const repaired = rows.filter((r) => Number(r.repairCycles) > 0).length;
  const unsupported = rows.reduce((n, r) => n + (Number(r.unsupportedClaims) || 0), 0);

  return {
    fixtureCount: rows.length,
    p50Ms: percentile(times, 0.5),
    p90Ms: percentile(times, 0.9),
    medianFidelity: median(fidelities),
    meanCatalogGrounding: grounding.length
      ? Math.round(grounding.reduce((a, b) => a + b, 0) / grounding.length)
      : null,
    groundedAtOrAbove75Pct: grounding.length
      ? Math.round((grounding.filter((g) => g >= 75).length / grounding.length) * 100)
      : null,
    repairRatePct: rows.length ? Math.round((repaired / rows.length) * 100) : null,
    hardFailureRatePct: rows.length ? Math.round((hardFailures / rows.length) * 1000) / 10 : null,
    unsupportedClaimTotal: unsupported,
    acceptedCount: rows.filter((r) => String(r.finalStatus).startsWith('accepted')).length,
  };
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function percentile(nums, p) {
  const sorted = [...nums].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx];
}
