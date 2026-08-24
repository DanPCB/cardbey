# Impact report: Store creation E2E with real data fetching

Date: 2026-08-17  
Status: **IMPLEMENTED** — P0/P1 patches applied (unwrap Places `.raw`, keep GBP-matched website offers, fix `websiteResolved`, skip unused extractor crawls, document flags, opt-in live test)  
Scope: Performer create-store research → catalog authority  
Related: [`IMPACT_REPORT_PERFORMER_RESEARCH_GROUNDED_CATALOG.md`](../../apps/core/cardbey-core/docs/IMPACT_REPORT_PERFORMER_RESEARCH_GROUNDED_CATALOG.md), [`IMPACT_REPORT_MSD_SUGGESTED_CATALOG_GROUNDING.md`](../../apps/core/cardbey-core/docs/IMPACT_REPORT_MSD_SUGGESTED_CATALOG_GROUNDING.md)

---

## Verdict

The **fixture / unit spine is green**. The **live fetch spine is not**.

A live research-only probe (no store create, no publish) for **Modern Security Doors + Ravenhall VIC** today:

| Check | Result |
|-------|--------|
| Google Places (New) configured locally | Yes — 1 match, `MODERN SECURITY DOORS` |
| Official website from Place Details | Yes — `http://modernsecuritydoors.com.au` |
| Website HTML extract | **17** sourced category offers (Plantation Shutters, Fly Doors, Roller Shutters, …) |
| Catalog applied to draft authority | **No** — `fallbackToGenerated: true`, `itemCount: 0`, `suggested_fallback` / `WEBSITE_NOT_FOUND` |
| Entity resolver (pipeline) | **0 candidates** — `No public entity match — treat as new business` |
| Fixture tests (Places mocked) | **70 / 70 passed** |

Create-store still **completes** (fail-open → AI/template catalog). That is why the UI can look “E2E fine” while the catalog is not from fetched business data — the original MSD symptom is still live.

---

## What is working

1. **Intake forwarding (Phase 1)** — `websiteUrl` / phone / email / OCR are forwarded into `missionRunBody` when present (`createStoreCheckpointDispatch.js`). Unit tests cover this.
2. **Places API (New)** — search + details succeed locally; website URI and GBP identity come back.
3. **HTML category extract (MSD patch)** — `extractFromWebsite` now returns nav categories without prices (17 rows on the live site).
4. **Staging apply gate (Phase 2A)** — when research actually returns items and `fallbackToGenerated` is false, sourced catalog can be staged. Defaults: on in non-prod, **off in production** unless `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW=1`.
5. **Publish gate** — unconfirmed research still blocks public publish (`storeResearchPublishGate.js`). Tests pass.
6. **Fail-open** — research exceptions / empty catalog do not abort store creation.
7. **Fixture E2E** — `createStoreResearchRuntime.e2e.test.js` passes with mocked `discoverSources` (explicitly “no live Places/network”).

`websiteMode: false` on store missions is **not** a missing-website bug. It means “create store” vs “mini website”. Real URL lives in `websiteUrl`.

---

## What is stuck (live)

### P0 — Entity resolver ignores Places `.raw`

`searchGooglePlaces()` returns `{ source, attribution, raw }`.  
`resolveBusinessEntity` maps the **wrapper** into `rawToCandidate()`:

```js
.map((raw, i) => rawToCandidate(raw, i, input))
```

Live measurement:

- Wrapper-as-raw match: `score 0`, `matched: false`
- Nested `.raw` match: `score 0.6`, `matched: true`, reasons `name-exact` + `locality`

Candidates with score `0.4` (name only, no placeId/address) are dropped by `PLAUSIBLE_CANDIDATE_THRESHOLD` (0.45) → pipeline logs `no_entity_match_fallback_new` even when Places found the business.

Legacy `sourceDiscoveryService.js` unwraps `p.raw` correctly, so discovery still finds the Place. Pipeline entity resolution does not.

**File:** `apps/core/cardbey-core/src/lib/storeResearch/businessEntityResolver.js`

### P0 — Website offers discarded because schema name ≠ trading name

Live extract name is `modernsecuritydoors.com.au` (hostname / schema).  
Identity expected `Modern Security Doors`.

`scoreSourceMatch` → `matched: false`, `confidence: 0.1` (only the official-website +0.1 bump).  
`extractServiceMenuCatalog` only reads **matched** `sourcesUsed` → **17 offers dropped** → `no_catalog_items` → AI/suggested catalog.

This is the remaining MSD hole: Places + website fetch **succeed**, catalog authority still says `WEBSITE_NOT_FOUND`.

**Files:** `sourceConfidenceScorer.js`, `businessResearchAgent.js` (use matched sources only), `extractFromWebsite` name pick

### P1 — Authority decision reads the wrong source shape

`sourcesUsed` entries are `{ source: { sourceType, sourceUrl }, … }`.  
`catalogAuthorityDecision` checks `s.sourceType` / `s.website` on the **match object**.

Even a matched `official_website` would not set `websiteResolved` unless the user also typed `websiteUrl`. Live probe therefore labelled `WEBSITE_NOT_FOUND` despite Place Details returning a URL and a successful crawl.

**File:** `catalogAuthorityDecision.js`

### P1 — Canonical pipeline extractors are unused

`runStoreResearchPipeline` awaits `runBusinessSourceExtractors(...)` and **discards the return value**. Catalog still comes only from `legacyResearchResult`. Extra website fetches happen for nothing.

`MenuPageExtractor` requires `source.raw.html`, which discovery never stores. `ABRExtractor` is a stub (`supports: () => false`).

**File:** `runStoreResearchPipeline.js`

### P1 — Duplicate live fetches

With `ENABLE_STORE_RESEARCH_PIPELINE=1`, one create-store research can hit Places + website **twice** (pipeline discovery, then legacy `discoverSources`). After P0 unwrap, entity resolution adds a **third** Places search. 8s fetch timeout each. Looks “stuck”; burns quota.

### P1 — Production flags still off by default

| Flag | Local `.env` | Default if unset | `.env.example` |
|------|----------------|------------------|----------------|
| `ENABLE_STORE_RESEARCH_PIPELINE` | `1` | off in production | **missing** |
| `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW` | `true` | off in production | **missing** |
| `GOOGLE_PLACES_API_KEY` | set | disabled | documented |

Even after P0/P0-catalog fixes, production will keep suggested catalogs until ops sets both flags (and Places). Confirm on Render; this workspace cannot read production env.

### P2 — No live E2E in CI

- `createStoreResearchRuntime.e2e.test.js` mocks network.
- `bookwellLive.integration.test.js` is `describe.skipIf(BOOKWELL_LIVE_TEST !== '1')`.
- French Baguette script (`e2e:french-baguette`) is the **auth/draft/publish** contract, not live research grounding.
- Fixture tests cannot catch the `.raw` unwrap or hostname identity miss.

### P2 — Images are a separate, weak live path

`web_scrape_store_images` HTML-scrapes website / Facebook / Google Images (6s timeout, Googlebot UA). Failures are empty → Pexels/keywords. Places photo fields are **not** in the Place Details field mask. Real photos are not part of the catalog E2E today.

### P2 — User URL fetch-fail is not registered

Places websites get a `google_place_details_url_only` fallback when HTML extract is empty. **User-supplied** `websiteUrl` that times out / returns `[]` is omitted entirely. Dead or JS-only owner URLs skip official_website.

---

## Impact if left as-is

| Area | Effect |
|------|--------|
| Performer create-store (name + suburb, no URL) | Places + site crawl succeed; draft catalog is still **suggested/AI** |
| Owner review UI | May not appear (`fallbackToGenerated` short-circuits pending-review) |
| Publish | Allowed for suggested catalogs; sourced publish gate never engages |
| Production | Pipeline + staging off unless flags set → same suggested path even after code fixes |
| Quota / latency | Duplicate Places/website calls; missions can look hung |

Does **not** block draft creation, preview, or (for suggested catalogs) publish.

---

## Smallest safe patches (for a later confirm)

Do **not** apply until this report is acknowledged. Prefer in this order:

1. **Unwrap Places rows in entity resolver** — `rawToCandidate(place.raw ?? place, …)`. Add a unit test with a `{ source, attribution, raw }` fixture. No publish/auth change.
2. **Keep website offers when GBP matched** — if `google_business` matched and Place Details (or extract) has `website` / `offers`, treat `official_website` as matched (or copy offers onto the matched Place). Do not require schema `name` === trading name. Host-only names (`modernsecuritydoors.com.au`) should not drop the catalog.
3. **Fix `websiteResolved`** — read `s.source?.sourceType` / `s.source?.sourceUrl` / `research.facts.website`. Relabel `NO_CATALOG_CONTENT_FOUND` vs `WEBSITE_NOT_FOUND`.
4. **Stop throwing away extractor output** — either feed `runBusinessSourceExtractors` into evidence/catalog **or** skip the extra crawl until wired.
5. **Document flags in `.env.example`**. Production soak still needs explicit Render: `ENABLE_STORE_RESEARCH_PIPELINE=1`, `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW=1`, Places key.
6. **Add opt-in live test** (same pattern as `BOOKWELL_LIVE_TEST`) asserting MSD name+location → `fallbackToGenerated: false` and sourced item count &gt; 0. Keep default CI hermetic.

Out of scope unless requested: Prisma provenance promotion, ABR, Places photos, French Baguette campaign/QR steps, auto-publish.

---

## How this was verified (2026-08-17)

1. Code review of `storeCreationResearch` + `storeResearch` + catalog apply + intake handoff.
2. `vitest` (skip pretest): **9 files, 70 tests passed**.
3. Live `runStoreCreationResearch` (research only) with local Places key — MSD name+location and name-only.
4. Direct `extractFromWebsite('http://modernsecuritydoors.com.au')` — 17 offers; identity score 0.1.

No draft was created. No store was published.

---

## Confirmation checkpoint

User confirmed **Proceed** (2026-08-17). Patches 1–6 applied. Re-run `STORE_RESEARCH_LIVE_TEST=1` after merge. Production still needs explicit Render flags + Places key before sourced catalogs are default on live.
