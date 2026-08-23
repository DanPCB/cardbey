# Impact Report — Broader Enrichment Sources

**Date:** 2026-08-23  
**Mission:** Extend multi-source enrichment with confidence-gap selection, stronger OSM use, Foursquare Places (+ photos), full-name recovery, Wikimedia Commons (opt-in prestige), and hero ladder updates.  
**Status:** APPROVED — implemented 2026-08-23 (additive; dry-run before live batch).

---

## 0. Pipeline map (current)

Existing fetch sequence in `multiSourceEnrichmentAgent.ts`:

| Step | Source | Budget | Stored in |
|------|--------|--------|-----------|
| 1 | ABR (`abrLookup`) | 1 fetch | `bag.abn`, `bag.legalName` |
| 2 | Business website | 1 fetch | `bag.description`, `openingHours`, `website`; `websiteExtract.ogImage` |
| 3 | Instagram / Facebook public | 0–2 fetches | `igBio` / `fbAbout` (locals) → may set `bag.description` |
| 4 | OSM Overpass (`osmCrossRef.queryOsmOverpass`) | 1 fetch | locals `osmTag`, `cuisine`; `bag.openingHours` |
| 5 | Yellow Pages / True Local | 0–2 fetches | `ypExtract` / `trueLocalExtract` |
| 6 | Category map (rules) | 0 | `bag.category`, `bag.tags` |
| 7 | Hero (`resolveHeroImage`) | 0–N Pexels | `bag.heroImageUrl` |
| 8 | Description synthesis | 0–1 Claude | `bag.description` |
| 9 | BI brief synthesis | 0–1 Claude | `bag.biBrief` |

Cap unchanged: **5 website fetches + 3 Claude + 10 min**.

`FieldBag` today: description, category, tags, heroImageUrl, heroImageSource, biBrief, openingHours, abn, legalName, website.  
`name` is **not** frozen (`FROZEN_CANDIDATE_KEYS`) — recovered display name can be written carefully; prefer provenance + optional `displayName` / overwrite only when truncation detected.

**Important:** OSM is already wired (`osmCrossRef.ts`). Do **not** add a parallel `osmFetcher.ts` that doubles Overpass traffic. Extend the existing Overpass helper (area query, full name, website, rate limit) and gate it with the new source selector.

---

## 1. Current hit rates

From live Batch 1 run (`enrichmentRunId` `cmt59eh2u0000ymrc78siha3g`, `MELBOURNE_BATCH001_REAL_LOCAL`, n=25):

| Metric | Observed |
|--------|----------|
| ENRICHED | **1 / 25 (4%)** — Churchill Cellars |
| PARTIAL | **24 / 25 (96%)** |
| Hero present | **0 / 25 (0%)** — report listed `hero=none` for all ranked rows |
| Description ≥ 40 words | **0 / 25 (0%)** — ranked descWords 11–29 |
| Name truncation examples | Churchill Cellars ends mid-`&`; several truncated titles |

Earlier dry-runs on single thin bakery candidates were also PARTIAL (`NO_WEBSITE`, `NO_ELIGIBLE_MEDIA`, `THIN_DATA`).

Prompt “before” baselines (~30% ENRICHED / ~20% hero) are optimistic relative to this Braybrook batch; targets below use **this batch** as the before baseline.

---

## 2. Expected improvement per new source

| Source | Primary gaps closed | Expected lift (Batch 1–like, no-website heavy) | Confidence |
|--------|---------------------|-----------------------------------------------|------------|
| Confidence-gap selector | Over-fetch / budget waste | Enables FSQ/Wikimedia without blowing 5-fetch cap | High |
| OSM extend (area + name + website) | category, hours, website seed, full name | Modest category/hours; some website discoveries | Medium |
| Foursquare venue | description, category, hours, name | Largest description/category lift when key present | Medium |
| Foursquare photos | hero | Largest hero lift for no-website SMEs | Medium–High |
| Full-name recovery (YP/FB title) | truncated Places names | High for `&`/`,` truncations | Medium |
| Wikimedia Commons | hero (prestige / Batch 0) | Low hit rate on Braybrook SMEs; high quality when matched | Low for Batch 1 |

**Directional targets** (same batch profile, after live re-enrich with FSQ key configured):

| Metric | Before (this batch) | Target |
|--------|---------------------|--------|
| ENRICHED | ~4% | ~40–65% |
| Hero present | ~0% | ~40–55% |
| Desc ≥ 40 words | ~0% | ~40–60% |
| Truncated names fixed | ~0% | ~80–90% of truncated set |

Without `FOURSQUARE_API_KEY`, expect only OSM + full-name + Wikimedia gains (much smaller).

---

## 3. New env vars

| Var | Required? | Notes |
|-----|-----------|--------|
| `FOURSQUARE_API_KEY` | Optional | Skip silently if unset; free tier ~1000 req/day |
| `OSM_OVERPASS_URL` | Optional | Default `https://overpass-api.de/api/interpreter` |
| Wikimedia | None | Public API |

Add to `apps/core/cardbey-core/.env.example` and document for Render. Deploy-gate: informational only for `FOURSQUARE_API_KEY` (do not fail deploy if missing).

---

## 4. Risk assessment

| Source | Risk | Why | Mitigations |
|--------|------|-----|-------------|
| OSM extend | **Low** | Public API; already in tree | 1 req/s; dry-run skips live writes; extend existing helper (no double fetch) |
| Foursquare | **Low–Medium** | Daily quota; key leakage if logged; ToS for photo display | Env-only key; silent skip; attribution in provenance + UI disclosure; no key in candidate JSON |
| Full-name recovery | **Low** | Extra HTML fetches; false-positive titles | Only when truncation signals; length + suburb checks; provenance `full_name_recovery` |
| Wikimedia | **Low** | Wrong venue photo | Name match confidence > 0.85; free-licence filter; Batch 0 / prestige opt-in preferred |
| Source selector | **Low** | Under-fetch if gaps mis-scored | Unit tests; dry-run logs gaps/plan |
| Hero ladder + FSQ photos | **Medium** | Public claimable pages show third-party photos | Attribution required; never Google Places photos (unchanged) |
| Budget interaction | **Medium** | Existing path can already use 4–5 fetches before new sources | Selector must run **before** optional Tier 3; prefer skip YP/TL when FSQ planned |

### Process / breakage (dev-safety)

1. **What could break:** Higher PARTIAL→ENRICHED rate may push more thin cards toward QA approve; FSQ photo heroes may appear on claimable surfaces; name overwrite could diverge from Places `placeId` identity if over-aggressive.  
2. **Why:** New fetchers feed synthesis/hero; name is writable.  
3. **Impact scope:** Opt-in enrichment agent + hero resolve + synthesize + provenance types + env; not discovery auto-run, not Batch 0 auto-enrich.  
4. **Smallest safe patch:** Additive fetchers + `sourceSelector` gating; extend `osmCrossRef` (no second Overpass client); dry-run default; no auto QA-approve.

---

## 5. Fetch budget impact

| | Avg fetches / candidate (estimate) |
|--|-------------------------------------|
| Current (website-less Braybrook) | ~2–4 (ABR + OSM + YP ± TL ± Pexels) |
| With selector + FSQ + photo (thin) | ~3–5 (must stay ≤ 5) |
| With website already good | ~1–2 (selector skips OSM/FSQ/Wikimedia) |

Wall-clock: prompt projects ~17s → ~28s; acceptable under 10 min cap. Enforce Overpass spacing so batch of 25 does not hammer the public endpoint.

---

## 6. Rollback

All new fetchers are additive:

- Unset `FOURSQUARE_API_KEY` → FSQ paths no-op.  
- Feature-disable via selector flags / env `ENRICHMENT_BROADER_SOURCES=0` (recommended small kill-switch).  
- Removing new modules does not invalidate existing candidate fields or provenance rows.  
- Prior ENRICHED/PARTIAL rows remain until a new live enrich overwrites.

---

## 7. Implementation plan (after approval)

1. `sourceSelector.ts` + tests  
2. Extend `osmCrossRef.ts` (area query, fullName, website, optional `OSM_OVERPASS_URL`, 1 rps) — **not** a duplicate fetcher  
3. `foursquareFetcher.ts` + tests (skip if no key)  
4. `fullNameRecovery.ts` + tests  
5. `wikimediaFetcher.ts` + tests (strict match + licence)  
6. Wire into agent after ABR/website/social, **before** synthesis; gate YP/TL with remaining budget + gaps  
7. Extend `heroImageResolve` ladder: website og → FSQ photo → Wikimedia → Pexels  
8. Extend `synthesize` evidence (FSQ description, OSM cuisine/amenity, recovered name)  
9. Provenance source kinds + `.env.example`  
10. Dry-run one candidate (e.g. Braybrook Hotel / Churchill Cellars) before any full live batch  

**Out of scope until separate confirm:** full Batch 1 live re-enrich on Render; QA bulk approve.

---

## 8. Verdict

**Proceed with implementation only after explicit acknowledgement** of this report (especially: reuse/extend existing OSM, Foursquare key optional, name recovery rules, hero attribution, no Batch 0 auto Wikimedia without confidence gate).
