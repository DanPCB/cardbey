# Mission 001 — 30-Fixture Live Research Soak Decision

**Date:** 2026-08-23  
**Artifact:** `docs/reports/mission001-live-30.json`  
**Mode:** `live_research` (public Places/website only; no publish, no contact)  
**Verdict:** `60_SECOND_STORE_CREATION_MAJOR_GAPS`

---

## Decision (freeze)

**Yes — website/reference offering reconstruction is the dominant remaining fidelity constraint.**

Recommendation from runner:

`FREEZE_NON_OFFERING_WORK__PRIORITIZE_WEBSITE_TO_OFFERING_RECONSTRUCTION`

Mission resources should collapse to one objective:

> Correctly reconstruct real products/services/offerings from a resolved business reference **before** store generation begins.

Temporarily stop investing in composition, brand styling, image improvement, 60s latency optimisation, additional discovery providers, and new UX — unless required to unblock offering reconstruction.

---

## Headline metrics (n=30)

| Metric | Value | Launch target |
|--------|------:|---------------|
| P50 / P90 (research path) | 349 ms / 9350 ms | ≤60s / ≤90s (not binding yet) |
| Median fidelity | **55** | ≥75 |
| Offering Reconstruction Rate | **23.8%** (5/21 eligible) | ≥80% |
| False Offering Rate | **0%** (0/131) | ≤5% |
| Hard failures | **0%** | ≤2% |

Interpretation:

- Truthfulness is healthy (no fabricated offerings in this soak).
- Understanding what the business sells is **not** healthy.
- Latency is **not** the bottleneck.

---

## Failure taxonomy (all 30)

| Class | Count | % |
|-------|------:|--:|
| `WEBSITE_FOUND_NO_CATALOG` | 9 | **30.0%** |
| `SPARSE_CORRECTLY` | 9 | 30.0% |
| `REFERENCE_HAS_NO_COMMERCE_CONTENT` | 7 | 23.3% |
| `STRUCTURED_CATALOG_FOUND` | 5 | 16.7% |
| `IDENTITY_NOT_RESOLVED` | 0 | 0% |
| `WRONG_ENTITY` | 0 | 0% |
| `SOURCE_BLOCKED` | 0 | 0% |
| `PRODUCTS_FOUND_LOW_CONFIDENCE` | 0 | 0% |
| `SERVICES_FOUND_LOW_CONFIDENCE` | 0 | 0% |
| `OTHER` | 0 | 0% |

### Among businesses where offerings were expected (eligible = 21)

| Outcome | Count | % of eligible |
|---------|------:|-------------:|
| `WEBSITE_FOUND_NO_CATALOG` | 9 | **42.9%** |
| `REFERENCE_HAS_NO_COMMERCE_CONTENT` | 7 | 33.3% |
| `STRUCTURED_CATALOG_FOUND` | 5 | 23.8% |

**42.9% of correctly resolved, offering-expected businesses fail specifically because a website/reference was found but catalog reconstruction returned zero items.** That meets the 40–60% freeze threshold.

### Among identity-resolved businesses that had a website (n=9 in this class set)

All 9 `WEBSITE_FOUND_NO_CATALOG` cases are strong/medium public brands with websites — including Grandiflora, Mecca, Market Lane, Vanguard, Modern Security Doors, Deloitte, Cotton On, Vinamilk, Hireup.

### What worked (`STRUCTURED_CATALOG_FOUND`)

| Business | Offerings | Likely reason |
|----------|----------:|---------------|
| Glamshell Beauty | 72 | Booking platform (Bookwell) |
| Jim's Mowing | 24 | Structured service surface |
| Nous Group | 24 | Structured/service pages extractable |
| Little Nap Coffee Roasters | 6 | Menu-like extract |
| Chin Chin | 5 | Restaurant/menu extract |

Pattern confirmation from smoke holds system-wide:

> Structured commerce source → offerings  
> Website identity alone → often zero offerings

---

## Vertical breakdown

| Vertical | Identity success | Offering reconstruction | Median fidelity | Website→no catalog |
|----------|-----------------:|------------------------:|----------------:|-------------------:|
| beauty | 66.7% | 50% | 55 | 1 |
| cafe | 100% | 50% | 61 | 1 |
| restaurant | 100% | 100% | 67 | 0 |
| consulting | 66.7% | 50% | 55 | 1 |
| financial | 66.7% | **0%** | 55 | 1 |
| florist | 66.7% | **0%** | 55 | 1 |
| retail | 66.7% | **0%** | 55 | 1 |
| security | 50% | **0%** | 55 | 1 |
| service | 66.7% | **0%** | 55 | 1 |
| trades | 66.7% | 50% | 55 | 0 |
| vietnamese_sme | 66.7% | **0%** | 55 | 1 |
| manufacturing | 100% | 0% | 55 | 0 |

Implication: one shared extraction engine is not enough as currently implemented. Need **shared reconstruction engine + vertical interpretation profiles** (retail collections, florist arrangements, beauty services, professional advisory capabilities, menu sections, trade service areas).

---

## Correct sparse behaviour (good)

All 9 name-only weak fixtures classified `SPARSE_CORRECTLY` with 0 false offerings. Do not “fix” this by inventing catalogs.

---

## Engineering objective (next)

### Website → Business Offering Reconstruction (first-class)

Cascade after identity:

1. **Structured commerce source** (Shopify / Woo / schema / menu / booking / …)
2. Else **Website semantic reconstruction** (nav, headings, commercial entities, prices, CTAs, page graph)
3. **Cross-source corroboration**
4. **Confidence scoring**
5. high → catalog · medium → conservative offerings · low → **sparse** (never invent)

Question to answer for each page graph:

> What can a customer obtain from this business?

Not merely: “find product cards.”

---

## Explicitly deferred until offering reconstruction improves

- composition / brand styling
- image fidelity polish
- 60-second latency optimisation
- new discovery providers
- new UX / wizards
- generate-timing sample (optional later; not the constraint)

---

## Launch answers (updated)

1. **P50/P90 (research):** 349 ms / 9350 ms — acceptable for now  
2. **Median fidelity:** 55  
3. **Offering reconstruction:** **23.8%** of eligible (target ≥80%)  
4. **False offerings:** **0%**  
5. **Top failure:** `WEBSITE_FOUND_NO_CATALOG` (30% overall; **42.9% of eligible**)  
6. **Owner edit-not-rebuild:** not measured  
7. **Advertise 60-second publicly?** **No**

---

## Next action

Implement **Website → Business Offering Reconstruction** as the Mission 001 bottleneck fix. Re-run this same 30-fixture soak after that change; launch gates should be reassessed only when Offering Reconstruction Rate approaches ≥80% while False Offering Rate stays ≤5%.
