# Mission 001 — Business Resolution Coverage

**Date:** 2026-08-24  
**Principle:** Never invent a catalog to make the metric pass. Unresolved with zero offerings is a valid safe outcome.  
**Artifacts:**
- `docs/reports/mission001-five-fixture-resolution-audit.json`
- `docs/reports/mission001-five-fixture-recovery.json`
- `docs/reports/mission001-live-30-v1-closure.json`
- Prior soak: `docs/reports/mission001-live-30-fidelity-grounding.json`

**Impact:** `docs/IMPACT_REPORT_MISSION_001_BUSINESS_RESOLUTION_COVERAGE.md`

---

## What changed (resolution only)

1. Explicit resolution outcomes (`businessResolutionOutcomes.js`) — identity ≠ catalog eligibility.
2. Live benchmark no longer treats **location alone** as `identityResolved`.
3. Distinctive multi-token name overlap for ranking/ambiguity; soft-select requires **name-exact/partial** (token overlap alone cannot attach a wrong business).
4. Separated metrics A–E in soak payload (`resolutionMetrics`).
5. Wrong-business identity regressions (`wrongBusinessIdentity.test.js`).

**Frozen (not modified):** offering extractors, false-offering guards, fidelity media neutral score, `groundingPct` provenance fields, catalog authority rules.

---

## Five-fixture root cause table

| Business | Location | Normalized | Candidates above threshold | Candidate websites / sources | Rejection reason (specific) | Identity confidence | Auth source | Catalog authority | Final outcome |
|----------|----------|------------|----------------------------|------------------------------|-----------------------------|---------------------|-------------|-------------------|---------------|
| Flower Store | Melbourne VIC | flower store | 0 (Places returns other florists only) | H Flowers, Queen St Flower Co, etc. — **wrong entities** | Generic name; locality-only hits; no name-exact match to input | UNRESOLVED | none | not evaluated | **BUSINESS_UNRESOLVED** |
| Anison Capital | Melbourne VIC | anison capital | 0 | Acorn Capital, Aniston, Aniston Lawyers, etc. | Near-miss names (Aniston≠Anison); no defensible entity | UNRESOLVED | none | not evaluated | **BUSINESS_UNRESOLVED** |
| CA Handy Man | Melbourne VIC | ca handy man | 0 | Handyman In Melbourne, Cales, Handy Pros | Category/near-name collisions; no CA Handy Man entity | UNRESOLVED | none | not evaluated | **BUSINESS_UNRESOLVED** |
| Phuong Nam Export Trading | Ho Chi Minh City | phuong nam export trading | Multiple token-overlap hits (Phương Nam*) | Several unrelated export/trading cos + websites | Multi-company brand collision in same city → prefer ambiguity | LOW | none selected | not evaluated | **IDENTITY_AMBIGUOUS** |
| Spotless Cleaning Services | Melbourne VIC | spotless cleaning services | Multiple Spotless* brands | Simply Spotless, Spotless Surfaces, Pure Spotless, etc. | Ambiguous Spotless* cluster; no unique match | LOW | none selected | not evaluated | **IDENTITY_AMBIGUOUS** |

Do **not** collapse these to a generic `WEBSITE_NOT_FOUND`. None had a defensible official website for the *input* business.

---

## Before / after (five fixtures)

| Business | BEFORE resolution / website / catalog / offerings | AFTER | OUTCOME |
|----------|---------------------------------------------------|-------|---------|
| Flower Store | identity=true (location-inflated) / web=false / no catalog / 0 | BUSINESS_UNRESOLVED / web=false / no catalog / 0 | **safe unresolved** |
| Anison Capital | identity=true / web=false / no catalog / 0 | BUSINESS_UNRESOLVED / web=false / no catalog / 0 | **safe unresolved** |
| CA Handy Man | identity=true / web=false / no catalog / 0 | BUSINESS_UNRESOLVED / web=false / no catalog / 0 | **safe unresolved** |
| Phuong Nam Export Trading | identity=true / web=false / no catalog / 0 | IDENTITY_AMBIGUOUS / web=false / no catalog / 0 | **ambiguous (safe)** |
| Spotless Cleaning Services | identity=true / web=false / no catalog / 0 | IDENTITY_AMBIGUOUS / web=false / no catalog / 0 | **ambiguous (safe)** |

**Recovered businesses among the five:** **0** (intentional — recovery would require wrong-business catalogs).

**Safe unresolved / ambiguous:** **5 / 5**

---

## Website & catalog authority

| Decision | Rule applied |
|----------|--------------|
| Website accepted | Owner URL, or Places entity with name-exact/partial + website, or shared-brand host across locations |
| Website rejected | First search hit; locality-only florist/handyman/Spotless neighbors; Aniston≠Anison |
| Catalog authority | Unchanged fail-closed path; identity directories do **not** authorize offerings from directory “is a plumber” copy |
| Token overlap | Used to detect collisions / ranking; **not** alone sufficient to soft-select research entity |

---

## Metric definitions (A–E)

| Code | Name | Definition |
|------|------|------------|
| **A** | Business Resolution Rate | `identityResolved` businesses / cohort |
| **B** | Catalog Eligibility Rate | catalog-eligible / business-resolved |
| **C** | Eligible Offering Reconstruction | reconstructed offerings / catalog-eligible |
| **D** | End-to-End Offering Coverage | businesses with grounded offerings / full cohort |
| **E** | False Offering Rate | offerings without defensible evidence / all offerings |

Legacy offering reconstruction (launch gate): among `identityResolved ∩ offeringsPubliclyExpected`, share with reconstructed offerings.

---

## Full cohort after resolution fix

| Metric | Value |
|--------|------:|
| A Business Resolution Rate | **53.3%** (16/30) |
| B Catalog Eligibility Rate | **100%** (16/16) |
| C Eligible Offering Reconstruction | **100%** (16/16) |
| D End-to-End Offering Coverage | **53.3%** (16/30) |
| E False Offering Rate | **0%** (0/413) |
| Legacy offering reconstruction | **100%** (16/16) — was 76.2% (16/21) when unresolved counted as resolved |
| Median fidelity | **79** (unchanged) |

Previously reconstructed set unchanged (16 businesses; no lost catalogs; no new false offerings).

---

## Regressions protected

- Same short brand / different city (AWE Financial vs AWE Finance) — weak overlap → not strong.
- Phuong Nam multi-company HCMC — ambiguous, zero offerings.
- Flower Store / Spotless / Anison / CA Handy Man — unresolved, zero offerings.
- Shared-brand websites (BlueScope / Typo path) preserved via shared-host logic.
- Prefer **UNRESOLVED** over **WRONG BUSINESS**.

---

## Known coverage limitations (post-V1)

These fixtures remain intentionally sparse:

1. Flower Store (Melbourne) — generic trade name  
2. Anison Capital (Melbourne) — synthetic / no public entity  
3. CA Handy Man (Melbourne) — no defensible Places match  
4. Phuong Nam Export Trading (HCMC) — identity collision cluster  
5. Spotless Cleaning Services (Melbourne) — Spotless* brand cluster  

Plus other weak/name-only fixtures already classified `SPARSE_CORRECTLY`.

**Do not invent catalogs for these.** Further discovery/resolution belongs post-V1.
