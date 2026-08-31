/**
 * Mission 001 — Business resolution coverage (launch closure)
 *
 * ## What could break
 * 1. Offering Reconstruction Rate may rise if unresolved name+location fixtures
 *    stop being counted as identity-resolved (denominator shrinks) — this is
 *    intentional taxonomy correction, not offering invention.
 * 2. Store creation path if identityResolved gating becomes stricter upstream.
 * 3. False sense of “business found” in UI if outcomes are mis-mapped.
 *
 * ## Why
 * Five remaining eligible misses have zero Places candidates above match threshold.
 * Attaching near-name businesses (other florists, Spotless*, Aniston≠Anison,
 * multiple Phương Nam Cos) would be wrong-entity catalogs = false offerings.
 * Benchmark currently sets identityResolved=true from location input alone.
 *
 * ## Impact scope
 * - Mission 001 resolution outcome helpers + live benchmark metrics
 * - Optional light name-token ranking improvements (fail-closed)
 * - Reports: BUSINESS_RESOLUTION_COVERAGE + V1_LAUNCH_CLOSURE
 * - Must NOT change offering extractors, false-offering guards, or fidelity media fix
 *
 * ## Smallest safe patch
 * 1. Explicit resolution outcomes (UNRESOLVED / AMBIGUOUS / RESOLVED_NO_WEBSITE / …)
 * 2. identityResolved only when entity/source evidence exists
 * 3. Separate metrics A–E; keep false offering = 0
 * 4. Wrong-business regression tests
 * 5. Full soak + launch verdict (READY only if gates pass honestly)
 *
 * Operator authorized this mission. Proceed.
 */
