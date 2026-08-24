# Mission 001 — Website → Business Offering Reconstruction

**Date:** 2026-08-23  
**Artifacts:**
- Cohort: `docs/reports/mission001-offering-cohort.json`
- Live 30: `docs/reports/mission001-live-30-offering-v1.json`
- Baseline soak: `docs/reports/mission001-live-30.json` / `MISSION_001_30_FIXTURE_SOAK_DECISION.md`

---

## VERDICT

`MISSION_001_OFFERING_RECONSTRUCTION_NEAR_TARGET`

When Cardbey has correctly identified a real business **and has a resolvable website**, it can now reconstruct evidence-supported customer offerings without inventing them. The prior dominant failure class `WEBSITE_FOUND_NO_CATALOG` (30% → **0%**) is eliminated on this soak.

Full eligible Offering Reconstruction Rate is **66.7%** (14/21) vs target **≥80%**. The remaining 7 eligible misses all have `websiteFound=false` (name/location/social/reference without a usable first-party site) — not website semantic extraction failures.

False Offering Rate remains **0%**.

---

## Gate status

| Gate | Status |
|------|--------|
| A Semantic page discovery | `MISSION_001_OFFERINGS_GATE_A_READY` |
| B Offering extraction | `MISSION_001_OFFERINGS_GATE_B_READY` |
| C Confidence + provenance | `MISSION_001_OFFERINGS_GATE_C_READY` |
| D Catalog / research path | `MISSION_001_OFFERINGS_GATE_D_READY` |
| E 9-failure cohort | `MISSION_001_OFFERINGS_GATE_E_READY` |
| F 30-fixture benchmark | `MISSION_001_OFFERING_RECONSTRUCTION_NEAR_TARGET` |

---

## Architecture change

```text
discoverSources → extractServiceMenuCatalog (STRUCTURED_CATALOG)
        │
        ├─ quality filter (reject nav/about/promo chrome)
        ├─ if chrome-dominated → treat as empty
        │
        └─ if empty + website → reconstructOfferingsFromWebsite
              page discovery → extract (schema/nav/headings/cards/meta)
              → confidence gate → dedupe → SEMANTIC_WEBSITE_OFFERINGS
```

Authority extended via existing `catalogAuthoritySource` / `catalogAuthorityDecision` constants:
`STRUCTURED_CATALOG` | `SEMANTIC_WEBSITE_OFFERINGS` | `SPARSE_NO_EVIDENCE`

Flag: `ENABLE_MISSION_001_OFFERING_RECONSTRUCTION_V1` (on with Mission 001 master).

---

## 9-failure cohort before/after

| Business | Before | After | Grounded? | Authority | Confidence |
| -------- | -----: | ----: | --------- | --------- | ---------- |
| Grandiflora | 0 | 7 | yes | STRUCTURED_CATALOG | high |
| Mecca Cosmetica | 0 | 40 | yes | SEMANTIC_WEBSITE_OFFERINGS | high |
| Market Lane Coffee | 0 | 24 | yes | STRUCTURED_CATALOG | high |
| Vanguard | 0 | 13 | yes | STRUCTURED_CATALOG | high |
| Modern Security Doors | 0 | 13 | yes | STRUCTURED_CATALOG | high |
| Deloitte Australia | 0 | 40 | yes | SEMANTIC_WEBSITE_OFFERINGS | high |
| Cotton On | 0 | 24 | yes | STRUCTURED_CATALOG | high |
| Vinamilk | 0 | 40 | yes | SEMANTIC_WEBSITE_OFFERINGS | high |
| Hireup | 0 | 2 | yes | SEMANTIC_WEBSITE_OFFERINGS | high |

**Cohort recovery: 9/9 (100%).** Modern Security Doors recovers product/service families (shutters, fly doors, security windows) — not generic packages.

---

## 30-fixture before/after

| Metric | Baseline | After | Target |
|--------|---------:|------:|-------:|
| Offering Reconstruction Rate | **23.8%** (5/21) | **66.7%** (14/21) | ≥80% |
| False Offering Rate | **0%** | **0%** (0/333) | ≤5% |
| Median fidelity | **55** | **55** | ≥75 |
| `WEBSITE_FOUND_NO_CATALOG` | **30%** | **0%** | — |
| `STRUCTURED_CATALOG_FOUND` | 16.7% | **46.7%** | — |
| Identity unresolved | 0 | 0 | — |
| Wrong entity | 0 | 0 | — |
| Source blocked | 0 | 0 | — |

---

## Vertical breakdown (offering reconstruction among eligible)

| Vertical | Offering recon % | Median fidelity |
|----------|-----------------:|----------------:|
| beauty | 100 | 59 |
| cafe | 100 | 67 |
| consulting | 100 | 67 |
| restaurant | 100 | 67 |
| security | 100 | 61 |
| trades | 50 | 55 |
| retail | 50 | 55 |
| financial | 50 | 55 |
| florist | 50 | 55 |
| service | 50 | 55 |
| manufacturing | 0 | 55 |
| vietnamese_sme | 50 | 55 |

---

## Remaining failure classes

All 7 remaining eligible misses:

`REFERENCE_HAS_NO_COMMERCE_CONTENT` + `websiteFound=false`

- Flower Store, Anison Capital, CA Handy Man, BlueScope Steel, Typo, Phuong Nam Export Trading, Spotless Cleaning Services

These need better identity/website resolution or alternate public commerce sources — **not** more aggressive invention from homepage chrome.

---

## Regressions

- False Offering Rate unchanged at **0%** (stop condition not triggered).
- Successful structured paths (Glamshell, Jim's Mowing, Nous, Little Nap, Chin Chin) still produce catalogs.
- Chrome filters may reduce recall of borderline nav labels; prefer sparse over fiction.

---

## Next bottleneck

1. **Identity + website resolution** for name/location/social fixtures (`websiteFound=false` among eligible).
2. **Median fidelity ≥75** — sparse fixtures floor the median at 55; catalog grounding score still reports 0 (instrumentation / scoring path).
3. Optional: deepen SPA rendering for Hireup-class sites beyond meta/title capabilities.

Do **not** trade false-offering rate for the last ~13pp of offering reconstruction.

---

## Key question

> When Cardbey has correctly identified a real business and has access to its website, can it now reliably understand what a customer can obtain from that business without inventing offerings?

**Evidence-backed answer: Yes for the website-available path.**  
All prior website+identity zero-catalog cohort fixtures now reconstruct grounded offerings; live soak `WEBSITE_FOUND_NO_CATALOG` is 0%; false offerings remain 0%. Full eligible rate is still below 80% only because several “offerings expected” fixtures never surface a website.
