# Mission 001 — Fidelity / Catalog Grounding Fix

**Date:** 2026-08-23  
**Prior:** `MISSION_001_IDENTITY_WEBSITE_RESOLUTION.md` (median fidelity 63, grounding 0)  
**Artifact:** `docs/reports/mission001-live-30-fidelity-grounding.json`  
**Impact:** `docs/IMPACT_REPORT_MISSION_001_FIDELITY_GROUNDING.md`

---

## VERDICT

Median fidelity target **met**. Catalog grounding instrumentation **fixed**.

| Metric | Before | After | Target |
|--------|-------:|------:|-------:|
| Median fidelity | 63 | **79** | ≥75 |
| Mean catalog grounding | 0 | **53** | — |
| Grounded ≥75% (share of fixtures) | 0 | **53** | ≥75 gate still open* |
| Offering Reconstruction Rate | 76.2% | **76.2%** | ≥80% |
| False Offering Rate | 0% | **0%** | ≤5% |
| Offering fidelity range | 61–69 | **77–85** | — |

\* `groundedAtOrAbove75Pct` averages sparse fixtures (grounding 0) with offering fixtures (grounding 100). Sparse-correct empty catalogs are truthful, not ungrounded fiction.

---

## Root causes fixed

1. **Media = 0 with deferred images** — fidelity averaged a zero media score when every item lacked an image. Mission 001 deferred image work; only-`no_image` gaps now use neutral media **0.8**.
2. **`groundingPct` field mismatch** — read `exact`/`verified` while engine emits `exactCount`/`verifiedCount` → always 0.
3. **`needsOwnerReview` demoted sourced offerings** — missing price forced INFERRED; website-sourced + confidence now map to VERIFIED.

---

## Launch gates (this soak)

| Gate | Status |
|------|--------|
| P50 / P90 latency | pass |
| Median fidelity ≥75 | **pass** |
| Hard failure ≤2% | pass |
| Truthfulness (unsupported claims) | pass |
| False offering ≤5% | pass |
| Offering reconstruction ≥80% | fail (76.2%) |
| Grounded ≥75% of fixtures | fail (53% — sparse floor) |

Verdict remains `60_SECOND_STORE_CREATION_MAJOR_GAPS` until offering reconstruction clears 80% without inventing, or eligibility is reassessed for unresolvable name+location fixtures.

---

## Next bottleneck

1. Offering Reconstruction **76.2% → ≥80%** without inventing (5 unresolvable name+location fixtures), **or** honest eligibility refinement for “offerings expected”.
2. Optional: image reconstruction (now that media no longer falsely tanks fidelity).
3. Owner-confirm UX for ambiguous Places entities.
