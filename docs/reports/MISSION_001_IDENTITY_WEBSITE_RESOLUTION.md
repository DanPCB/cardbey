# Mission 001 — Identity / Website Resolution (next step after offering reconstruction)

**Date:** 2026-08-23  
**Prior:** `MISSION_001_OFFERING_RECONSTRUCTION.md` (66.7% offering recon)  
**Artifacts:**
- `docs/reports/mission001-live-30-website-resolution.json`
- `docs/reports/mission001-website-resolution-cohort.json`
- Impact: `docs/IMPACT_REPORT_MISSION_001_IDENTITY_WEBSITE_RESOLUTION.md`

---

## VERDICT

`MISSION_001_OFFERING_RECONSTRUCTION_NEAR_TARGET` (improved)

Offering Reconstruction Rate: **66.7% → 76.2%** (16/21)  
False Offering Rate: **0%** (0/378)  
Median fidelity: **55 → 63**  
`WEBSITE_FOUND_NO_CATALOG`: still **0%**

Target ≥80% not met without inventing offerings for unresolvable generic name+location fixtures.

---

## What changed

Ambiguous Places multi-location brands (BlueScope, Typo) previously **skipped research** when no website was pre-supplied.

Fix:

1. Enrich top Place candidates with details (website).
2. Detect **shared brand website** across ambiguous location candidates (same host / `.com`↔`.com.au` stem).
3. Run legacy + semantic offering research with that website while keeping `ownerReviewRequired=true`.
4. Soft-select single name-matched Place+website for research enrichment even if score &lt; 0.72.
5. Tighten chrome filters (nav menus, FAQ questions, free-delivery promos).

---

## Before / after (eligible failures)

| Business | Before | After | Notes |
|----------|-------:|------:|-------|
| BlueScope Steel | 0 | 40 | Shared brand website |
| Typo | 0 | 40 | Shared brand website (store locations) |
| Flower Store | 0 | 0 | No Places name match — sparse correct |
| Anison Capital | 0 | 0 | Synthetic — sparse correct |
| CA Handy Man | 0 | 0 | No exact entity — sparse correct |
| Phuong Nam Export Trading | 0 | 0 | No Places match — sparse correct |
| Spotless Cleaning Services | 0 | 0 | Ambiguous Spotless* brands — sparse correct |

---

## 30-fixture metrics

| Metric | Offering-recon soak | After website resolution | Target |
|--------|--------------------:|-------------------------:|-------:|
| Offering Reconstruction Rate | 66.7% | **76.2%** | ≥80% |
| False Offering Rate | 0% | **0%** | ≤5% |
| Median fidelity | 55 | **63** | ≥75 |
| Hard failure rate | 0% | **0%** | ≤2% |
| `STRUCTURED_CATALOG_FOUND` | 46.7% | **53.3%** | — |
| `SPARSE_CORRECTLY` | 30% | **30%** | — |

---

## Remaining bottleneck

The last **~4pp** to ≥80% are five name+location fixtures with **no safe first-party website**. Attaching a near-match Places business would raise **wrong-entity / false-offering** risk.

Next work should **not** invent catalogs for them. Prefer:

1. Median fidelity / catalog grounding instrumentation (≥75)
2. Optional owner-confirmation UX when Places is ambiguous
3. Broader fidelity (images, composition) only after offering path is accepted as near-ceiling for public-web evidence

Constraint recommendation remains: `CONTINUE_BROADER_FIDELITY_WORK`
