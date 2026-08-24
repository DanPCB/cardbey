/**
 * Mission 001 — Fidelity / catalog grounding instrumentation fix
 *
 * ## What could break
 * 1. Broader Performer grounding fidelity scores if global media weighting changes.
 * 2. Owner-review signals if evidenceStatus mapping becomes too aggressive (INFERRED→VERIFIED).
 * 3. Benchmark median fidelity rising without real image quality improving.
 *
 * ## Why
 * Live soak shows offering fidelities stuck at 61–69 and catalogGrounding always 0:
 * - `computeBusinessFidelityScore` sets media≈0 when every item lacks an image, even though
 *   Mission 001 deferred image reconstruction.
 * - `groundingPct` reads `exact`/`verified` but engine emits `exactCount`/`verifiedCount`.
 * - `mapEvidenceStatus` forces INFERRED whenever `needsOwnerReview` (often true for missing
 *   price), so website-sourced offerings never count as verified.
 *
 * ## Impact scope
 * - `businessFidelityScore.js` (deferred-image neutral media)
 * - `mission001-live-benchmark.mjs` groundingPct field names
 * - `storeGroundingAdapter.js` mapEvidenceStatus for sourced items
 * - Mission 001 soak metrics only; no publish/contact changes
 *
 * ## Smallest safe patch
 * 1. When missingContent is only `no_image:*` and catalog has evidence coverage, use neutral
 *    media confidence (0.8) instead of 0 — images deferred, not failed.
 * 2. Fix groundingPct to use exactCount/verifiedCount + product provenance fallback.
 * 3. Map sourced + high-confidence items to VERIFIED even if price needs owner review.
 *
 * Operator authorized "Next." Proceed.
 */
