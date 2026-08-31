/**
 * Mission 001 — Identity / website resolution for offering reconstruction.
 *
 * Context: Offering Reconstruction Rate 66.7% (target ≥80%). Remaining eligible
 * failures are websiteFound=false — mostly ambiguous Places entities that skip
 * research when no website is pre-supplied.
 *
 * ## What could break
 * 1. Wrong-entity catalogs if we auto-select among ambiguous Places hits
 *    (e.g. "Flower Store" → another florist's website).
 * 2. False Offering Rate if weak name matches inherit a third-party catalog.
 * 3. Owner-review / governance expectations if we silently persist an entity.
 *
 * ## Why
 * `runStoreResearchPipeline` only runs legacy research on ambiguous entities when
 * `normalized.website` is already set. Name+location / social / reference fixtures
 * often have multiple Places candidates and therefore never reach website scrape
 * or offering reconstruction.
 *
 * ## Impact scope
 * - `apps/core/cardbey-core/src/lib/storeResearch/runStoreResearchPipeline.js`
 * - `apps/core/cardbey-core/src/lib/storeResearch/businessEntityResolver.js`
 * - Optionally Mission 001 name/location enrichment helpers
 * - Live benchmark offering reconstruction rate; false-offering guards unchanged
 *
 * ## Smallest safe patch
 * 1. When ambiguous: enrich top candidates with Place details (website).
 * 2. If a single top candidate has strong name match + website and is not a
 *    near-tie with another same-strength name match, run legacy research with
 *    that website while keeping `ownerReviewRequired=true` and not auto-persisting.
 * 3. If still truly ambiguous (near-tie), keep sparse — prefer SPARSE over fiction.
 * 4. Do not invent offerings; do not lower false-offering guards.
 *
 * Proceed after this report (operator authorized "proceed the next step").
 */
