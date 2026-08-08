# AUDIT — Universal Library Local vs Staging Operational Parity

**Date:** 2026-08-08  
**Mode:** Evidence-only (no fix applied in this pass)  
**Environments probed:**

| Env | Surface |
|-----|---------|
| Local Core | `http://127.0.0.1:3001` (process `dev-api-entry.mjs`, uptime ~16h, `env=development`) |
| Local DB | `prisma/dev-fresh.db` |
| Staging Dashboard | `https://cardbey-dashboard-staging.onrender.com` (bundle `index._qIvOGCM.js`, commit `56a883ef`) |
| Staging Core | `https://cardbey-core-staging.onrender.com` (`env=staging`) |

---

## VERDICT

**`STAGING_CORE_UNIVERSAL_LIBRARY_NOT_DEPLOYED`**

(alias / operator shorthand: **`STAGING_LIBRARY_NOT_POPULATED`** — because the catalogue API and schema are absent on staging, population cannot have run there.)

**Not** primarily a Dashboard UI bug, image/CORS issue, or wrong Core URL.

---

## K. Root-cause block

| Field | Finding |
|-------|---------|
| **VERDICT** | `STAGING_CORE_UNIVERSAL_LIBRARY_NOT_DEPLOYED` |
| **FIRST DIVERGENCE** | Staging Core returns **HTTP 404** for `GET /api/universal-library/assets?status=PUBLISHED`. Local Core returns **HTTP 200** with **121** public real assets (`fixturesExcluded=true`). |
| **ROOT CAUSE** | Universal Library Core code + Prisma models live on branch `feat/universal-library-staging-milestone` (intro commit `8818a9afa`) and are **not ancestors of `origin/staging` or `origin/main`**. Staging never mounts the route; never migrated `UniversalAsset` / jobs; never ran `phase3b-populate-real-library.mjs` / Pexels sync. |
| **LOCAL BEHAVIOUR** | Dashboard → Core `/api/universal-library` → `UniversalAsset` rows (Originals + Creator + Pexels REFERENCE) → shelves populate with real Pexels preview URLs. |
| **STAGING BEHAVIOUR** | Dashboard UI loads → same client calls staging Core → **404** → `fetchPublishedUniversalAssets` falls through to empty in-memory snapshot → `"No published catalogue is available yet."` |
| **EVIDENCE** | See §§A–J below. |
| **MINIMUM FIX** | (1) Land Universal Library Core (routes, services, migrations, flags) onto staging. (2) Apply migrations. (3) Set secrets/flags. (4) Run idempotent `node scripts/phase3b-populate-real-library.mjs` (or admin ops equivalent) against staging DB with `force` Pexels sync. (5) Confirm public GET returns items; open `/library`. |
| **RISK** | Medium–high merge (large feature branch + Prisma migrations). Must not copy local DB; must not enable fixtures in public catalogue; must not bypass rights. |

**Not ready for:** `UNIVERSAL_LIBRARY_STAGING_OPERATIONAL_PARITY_READY`

---

## A. `/library` data path (exact)

```text
UniversalLibraryPage.tsx
  useEffect → fetchPublishedUniversalAssets()
    → apiGET('/api/universal-library/assets?status=PUBLISHED')   // authority: Core
    → on miss/404: getPopulationAdminSnapshot().published        // dashboard in-memory only
  filteredPublishedAssets()
    → isUniversalDiscoveryV1Enabled() ? universalAssetStore.list({ publishedOnly: true }) : []
  Shelves (Recommended / Popular / New / Browse)
    → rankAssetsForShelf(filteredAssets, …)   // client-side only; no separate shelf APIs
  Categories
    → listIndustryCategoryChips()             // client taxonomy chips; not Core catalogue
  Content types
    → TYPE_FILTERS constant in page           // static UI filters
  Collections / Featured
    → memoryStore.listCollections()           // Phase1 memory; not Core collections API
```

### Files / functions

| Layer | Path | Function |
|-------|------|----------|
| UI | `apps/dashboard/.../src/pages/library/UniversalLibraryPage.tsx` | page load, shelves, empty copy |
| Client API | `.../src/lib/contentEngine/api/universalLibraryApi.ts` | `fetchPublishedUniversalAssets` |
| HTTP client | `.../src/lib/api.ts` + `apiBase.ts` / `coreApiBaseUrl` | `apiGET` → Core base |
| Fallback store | `.../population/populationEngine.ts` + `storage/universalAssetStore.ts` | in-memory only |
| Core route (feat branch only) | `apps/core/.../src/routes/universalLibraryRoutes.js` | mount `/api/universal-library` |
| Core services (feat) | `.../services/universalLibrary/*` | list/publish/pipeline/pexels sync |
| Core feature gate (feat) | `Features.universalLibrary.v1` etc. | fail-closed 404 if disabled |

### Endpoints responsible

| UI need | Endpoint / mechanism |
|---------|----------------------|
| Browse all | `GET /api/universal-library/assets?status=PUBLISHED` (+ client rank/slice) |
| Recommended / Popular / New | **No dedicated API** — `rankAssetsForShelf` on hydrated list |
| Categories | Client chips (`listIndustryCategoryChips`); asset `categories`/`industry` from Core when present |
| Content types | Client `TYPE_FILTERS` |
| Collections | Local `memoryStore` / Core collections on feat branch ops — **not** what fills Browse today |

### LOCAL vs STAGING request comparison

| | LOCAL | STAGING |
|---|-------|---------|
| Dashboard | Vite `localhost:5174` | `cardbey-dashboard-staging.onrender.com` |
| API base (actual) | Dev Core (`127.0.0.1:3001` via Vite/active context) | Bundle: `VITE_API_BASE_URL=https://cardbey-core-staging.onrender.com` (46 refs; 2 leftover prod URL strings — staging target is correct) |
| Request | `GET {core}/api/universal-library/assets?status=PUBLISHED` | Same path against staging Core |
| HTTP status | **200** | **404** |
| Returned item count | **121** public real (`total=121`, `fixturesExcluded=true`); sample page of 50 Pexels when uncapped earlier | **0** (route missing; client empty fallback) |

**Staging Dashboard is talking to the intended staging Core.** Empty catalogue is not a wrong-target problem.

Variables actually used (Dashboard):

- Build: `VITE_API_BASE_URL`, `VITE_CORE_BASE_URL` / `VITE_CORE_URL` / `VITE_CORE_ORIGIN` (resolved via `getCoreApiBaseUrl` / `cardbeyEnv`)
- Runtime override possible: `window.__APP_CORE_BASE_URL__` / active context (dev)
- Library flags: `VITE_ENABLE_UNIVERSAL_DISCOVERY_V1`, `VITE_ENABLE_CONTENT_POPULATION_V1`, … (see §C)

---

## B. Database inventory

### Local (`dev-fresh.db` — authoritative for local pilot)

| Metric | Local | Staging |
|--------|------:|--------:|
| Total `UniversalAsset` | **839** | **N/A — table/API not on staging deploy** |
| Published (`status=PUBLISHED`) | **839** | N/A |
| Unpublished | 0 | N/A |
| External / Pexels (`provider=pexels`) | **64** | N/A |
| Cardbey Originals (`contentOrigin=REAL_FIRST_PARTY`) | **52** | N/A |
| Creator (`REAL_CREATOR` / `creator_studio`) | **5** | N/A |
| Fixtures (`DEVELOPMENT_FIXTURE`) | **718** | N/A |
| Public `/library` after fixture exclusion | **121** | **0** |
| Rights `CLEARED` | **839** | N/A |
| Hosting `REFERENCE` (Pexels) | **64** | N/A |
| Hosting `HOSTED` (seed/internal/creator) | majority of non-Pexels | N/A |
| `REFERENCE_ONLY` outcome (sync job) | 60+4 across two Pexels jobs | never ran |
| `PROVIDER_HOSTED` / `PULL_ON_USE` (URI custody) | Not the UL public filter labels; Pexels published as `hostingMode=REFERENCE` | N/A |
| Collections (real) | Published via Phase 3B script (6 named in impact report) | N/A |
| `ContentPopulationJob` rows | **4** | N/A |

Staging Postgres was not opened directly; staging Core **404** on the catalogue route + missing code on `origin/staging` is sufficient to treat staging inventory as **absent for this product surface**.

**Stop treating this as a frontend problem.** Population has not happened on staging because the Core product surface is not deployed.

---

## C. Feature flags

### Dashboard (Vite — build-time)

| FLAG | LOCAL (typical DEV) | STAGING bundle | DEFAULT in code |
|------|---------------------|----------------|-----------------|
| `VITE_ENABLE_CONTENT_POPULATION_V1` | often unset → **ON in DEV** | **`"true"`** | `envOn(..., true)` → ON only if DEV when unset |
| `VITE_ENABLE_CONTENT_TAXONOMY_V1` | DEV default ON | `"true"` | same |
| `VITE_ENABLE_UNIVERSAL_DISCOVERY_V1` | DEV default ON | present as flag helper default `!0`; ensure explicit `"true"` on Render rebuild | DEV default ON; **prod/staging unset = OFF** |
| `VITE_ENABLE_UNIVERSAL_LIBRARY_V1` | marketplace gate | **not in staging env map** | fail closed OFF |
| `VITE_ENABLE_UNIVERSAL_RESOURCE_INTELLIGENCE_V1` | — | **not in staging env map** | OFF |
| `VITE_ENABLE_URI_*` | — | **not in staging env map** | OFF |

Evaluated in:

- `src/lib/contentEngine/population/featureFlags.ts`
- `src/lib/contentEngine/marketplace/flags.ts`
- `src/lib/universalResourceIntelligence/api.ts`

**Important:** Local DEV defaults can hide missing Vite flags. Staging production build does **not** get `defaultOnInDev`. Staging already embeds `CONTENT_POPULATION_V1=true`; primary blocker remains Core 404.

### Core (feat branch `Features.universalLibrary`)

| FLAG | LOCAL `.env` | STAGING (expected today) | DEFAULT |
|------|--------------|--------------------------|---------|
| `ENABLE_UNIVERSAL_LIBRARY_V1` | non-prod path / implied | **code absent** | `readNonProductionFlag` |
| `ENABLE_CONTENT_POPULATION_V1` | used | code absent | non-prod tied to v1 |
| `ENABLE_UNIVERSAL_DISCOVERY_V1` | used | code absent | non-prod |
| `ENABLE_REAL_LIBRARY_EXPANSION_V1` | **true** | unknown / irrelevant until deploy | non-prod |
| `ENABLE_FIRST_EXTERNAL_PROVIDER_V1` | **true** | unknown | **false** (explicit) |
| `ENABLE_PROVIDER_SCHEDULED_SYNC_V1` | **true** | unknown | **false** |
| `ENABLE_REAL_LIBRARY_COLLECTIONS_V1` | **true** | unknown | non-prod |
| `ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1` | **true** (ops) | must stay **false** for public | **false** |
| `ENABLE_CREATOR_LIBRARY_PUBLICATION_V1` | **true** | pilot | non-prod / gated |
| `PEXELS_API_KEY` | **PRESENT** (redacted) | **UNKNOWN** (must be set for sync) | required for sync |

URI Federation flags are separate from Universal Library catalogue publish path; staging empty catalogue is explained without them.

---

## D. Pexels / provider configuration

| Check | Local | Staging |
|-------|-------|---------|
| Adapter exists (`pexelsLibrarySync.js` on feat) | yes (loaded by long-lived local Core) | **no on `origin/staging` tree** |
| Provider enabled (`ENABLE_FIRST_EXTERNAL_PROVIDER_V1`) | yes | N/A until deploy |
| Credentials | **PRESENT** | **UNKNOWN** — do not invent; set `PEXELS_API_KEY` on Render Core |
| Search / metadata / preview / reuse | sync uses Pexels search API; publishes REFERENCE with preview URLs | not executed |
| Sync capability | `runPexelsLibrarySync(..., { force: true })` | not available |
| Last successful operation | `ContentPopulationJob` `PROVIDER_SYNC`/`pexels` **COMPLETED** (64 then +4) | **never** |
| Last failure | none in last jobs | N/A |
| Outbound to api.pexels.com | succeeded locally (64 REFERENCE_ONLY outcomes) | unproven |

Distinction proven:

```text
ADAPTER EXISTS (feat branch)  ≠  DEPLOYED ON STAGING
≠ PROVIDER ENABLED ON STAGING
≠ AUTHENTICATED ON STAGING
≠ SYNC EXECUTED ON STAGING
≠ RESOURCE PUBLISHED ON STAGING
```

---

## E. Population history — how local got resources

Local resources were **not** primarily from Dashboard in-memory seed. They were created by Core population + Phase 3B script path:

| Job id (local) | kind | provider | status | Result summary |
|----------------|------|----------|--------|----------------|
| `cmshgftcd…` | DISCOVERY | seed | COMPLETED | seeded 680 / published 720 (later classified fixtures) |
| `cmshh7c6i…` | DISCOVERY | development_fixture | COMPLETED | fixtures excluded note |
| `cmshhsp0p…` | PROVIDER_SYNC | pexels | COMPLETED | DISCOVERED 64, REFERENCE_ONLY 60, SKIPPED 4 |
| `cmshhtgo3…` | PROVIDER_SYNC | pexels | COMPLETED | DISCOVERED 68, REFERENCE_ONLY 4, SKIPPED 64 |

**Supported local command (feat branch):**

```bash
cd apps/core/cardbey-core
node scripts/phase3b-populate-real-library.mjs
```

This script:

1. Imports Cardbey Originals  
2. Projects pilot creator samples if needed  
3. Runs **`runPexelsLibrarySync(prisma, { maxPublish: 60, force: true })`** ← yes, **can force provider sync** for local/pilot  
4. Publishes real collections  
5. Audits real vs fixture counts  

**Was this ever executed against STAGING?**  
**No evidence.** Staging has no route, and `origin/staging` lacks the script/services. No staging `ContentPopulationJob` history is available via API.

Dashboard `runSeedPopulation` / Content Acquisition “Run seed” is a **different** path: prefers Core `POST /admin/seed-run`, else ephemeral `runDiscoveryAndPopulate('seed')` in browser memory (explicitly “not durable”).

---

## F. Rights → publication pipeline (one Pexels resource)

**Local example:** `cmshhsne0002jjvfonuptt0s0` — “Home-services photo - Valentin Ivantsov”

| Stage | Local | Staging |
|-------|-------|---------|
| DISCOVERY | Pexels sync DISCOVERED | **never runs** |
| NORMALIZATION | titles/tags/industry set | — |
| RIGHTS | `rightsStatus=CLEARED`; open license; job `REJECTED_RIGHTS=0` | — |
| INDEX | row in `UniversalAsset` | — |
| CUSTODY / HOSTING | `hostingMode=REFERENCE` (REFERENCE_ONLY outcome in job) | — |
| PUBLICATION | `status=PUBLISHED`; public list includes with `fixturesExcluded` | — |
| `/library` query | returned in GET assets | **404 before query** |

**FIRST STAGE WHERE STAGING DIVERGES:** provider/catalogue **API not mounted** (pre-discovery). Not a rights block.

Do **not** weaken rights to “fix” staging.

---

## G. Migrations

| Check | Local | Staging (`origin/staging`) |
|-------|-------|------------------------------|
| `UniversalAsset` (+ relations, discovery score, entities) | present in `dev-fresh.db` | **not in deployed schema.prisma on staging tip** |
| `ContentPopulationJob` | present | absent from staging tip models |
| Store reviews migration co-landed in `8818a9afa` | applied locally | not on staging tip |
| Prisma client on staging Render | serves current staging code without UL models | N/A for UL |

Migrations exist on **feat branch** (`20260806…` universal library + store reviews). They are **not** on `origin/staging`. Do not push schema until merge strategy is approved.

---

## H. Deployment configuration

### Staging Dashboard (proven from bundle)

- `VITE_API_BASE_URL` / Core target: **`https://cardbey-core-staging.onrender.com`**
- `VITE_APP_COMMIT_SHA`: `56a883ef` (Library outcome UX merge)
- `VITE_APP_BUILD_TIME`: `2026-08-07T23:36:42.864Z`
- `MODE`: `staging`, `DEV`: false
- `VITE_ENABLE_CONTENT_POPULATION_V1`: `"true"`

### Staging Core

- Health `env=staging` OK  
- `/api/universal-library/*` → **404**  
- Deployed git tip does **not** contain `8818a9afa` / feat UL stack  

### Subtle VITE note

VITE flags are build-time. Staging Dashboard already rebuilt with population flag true; changing Render env without redeploy would not fix Core 404 anyway.

---

## I. Image delivery

**Skipped as primary diagnosis.** Staging API returns no resources → empty catalogue copy is shown. Image/CORS is irrelevant until §A returns `itemCount > 0`.

Local Pexels cards use `images.pexels.com` preview URLs (200 expected when catalogue exists).

---

## J. Parity matrix

| Layer | Local | Staging | Parity |
|-------|-------|---------|--------|
| Dashboard commit | Vite dev / local | `56a883ef` | UI path aligned |
| Core commit | feat UL code in **running process** + DB; workspace tip may differ | `origin/staging` **without** UL | **FAIL** |
| Dashboard Core URL | local Core | staging Core | OK (correct target) |
| Library API | 200 / 121 | 404 / 0 | **FAIL** |
| DB migrations (UL) | applied | missing on tip | **FAIL** |
| DB resource count | 839 (121 public) | 0 / N/A | **FAIL** |
| Published count (public) | 121 | 0 | **FAIL** |
| URI enabled | local flags on | not required for this failure | n/a |
| Federation enabled | separate | separate | n/a |
| Pexels registered (UL sync) | yes (feat) | no on tip | **FAIL** |
| Pexels credential | PRESENT | UNKNOWN | unknown |
| Pexels health | sync completed | never | **FAIL** |
| Provider sync enabled | force/script + flag | no | **FAIL** |
| Provider sync executed | yes (2 jobs) | no | **FAIL** |
| Rights evaluation | CLEARED / REFERENCE | n/a | n/a |
| Publication | PUBLISHED | n/a | **FAIL** |
| Library query | 121 items | empty | **FAIL** |
| Image retrieval | N/A after data | N/A | blocked by empty catalogue |

---

## Answer — “Were local resources from the population script / force provider sync?”

**Yes.** Local public Pexels cards come from Core `PROVIDER_SYNC` jobs and `phase3b-populate-real-library.mjs`, which calls:

```js
runPexelsLibrarySync(prisma, { maxPublish: 60, force: true })
```

That **`force: true`** bypasses the disabled-flag early return for local/pilot sync while still requiring `PEXELS_API_KEY` and writing real REFERENCE publications with job persistence. Dashboard in-memory seed is **not** what fills local `/library` when Core is up.

---

## L. Fix gate (not executed)

Smallest safe operational sequence **after approval**:

1. Merge/cherry-pick Universal Library Core from `feat/universal-library-staging-milestone` onto staging (impact report + migration review required — large surface).  
2. Deploy Core staging; confirm route exists (even empty list `200`).  
3. Confirm Render secrets: `PEXELS_API_KEY=PRESENT`; set needed `ENABLE_*` (keep fixtures **off** for public).  
4. Run `node scripts/phase3b-populate-real-library.mjs` against staging DB (idempotent; uses force Pexels sync).  
5. `GET /api/universal-library/assets?status=PUBLISHED` → expect `total > 0`.  
6. Open staging `/library` → real cards + previews.  
7. Restart Core → data persists.

**Do not:** copy `dev-fresh.db`, insert fixtures into public catalogue, hardcode Pexels into Dashboard, or bypass rights.

---

## Acceptance status

| Criterion | Status |
|-----------|--------|
| Controlled Pexels discovery on staging | **Blocked** — code not deployed |
| Persist/index/rights/publish | **Blocked** |
| GET library endpoint returns items | **Fail** (404) |
| Staging `/library` cards | **Fail** (empty catalogue message) |
| No new fixtures introduced | N/A |

**Final verdict code:** not `UNIVERSAL_LIBRARY_STAGING_OPERATIONAL_PARITY_READY`  
**Remaining blocker:** deploy Universal Library Core + migrate + run Phase 3B population (with Pexels credential) on staging.
