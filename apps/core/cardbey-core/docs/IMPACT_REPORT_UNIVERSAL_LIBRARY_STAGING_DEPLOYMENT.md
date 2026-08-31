# Impact Report — Universal Library Core Staging Deployment

**Date:** 2026-08-08  
**Branch:** `feat/ul-core-staging-deploy` (focused port from `feat/universal-library-staging-milestone`)  
**Status:** **UNIVERSAL_LIBRARY_STAGING_OPERATIONAL_READY** (verified 2026-08-08)

## Pre-merge audit

### REQUIRED (ported)

| Area | Source |
|------|--------|
| UL routes | `src/routes/universalLibraryRoutes.js` |
| UL services | `src/services/universalLibrary/**` (incl. Pexels sync, Originals, collections) |
| Migration | `20260806200000_universal_library_population` (postgres + sqlite) |
| Schema models | `UniversalAsset`, relations, `ContentPopulationJob`, entities, `UniversalDiscoveryScore`, `MarketplacePurchase` (table only; no marketplace product) |
| Flags | `Features.universalLibrary` + `readNonProductionFlag` |
| Mount | `server.js` `/api/universal-library`, endpoint registry |
| Staging bootstrap | `scripts/staging-ul-bootstrap.mjs` |

### NOT ported (unrelated / optional)

| Item | Reason |
|------|--------|
| Store reviews (`20260806120000`, `storeReview*`, `8b4bd246b`) | Not required for Library gate |
| URI / `universalResourceIntelligence` | Pexels UL sync does not import Federation |
| Marketplace seller/listing product | Not required; purchase table created by UL migration for schema parity only |
| Rest of feat branch (performer, create-store, checkpoints) | Unrelated WIP |

### DEPENDENCIES

- `PEXELS_API_KEY` for provider pilot  
- Additive Prisma migrate deploy on staging Postgres  
- Non-prod flag defaults OR explicit `ENABLE_UNIVERSAL_LIBRARY_V1=true`

### ENVIRONMENT / FLAGS (staging target)

| Name | Staging target |
|------|----------------|
| `ENABLE_UNIVERSAL_LIBRARY_V1` | ON (explicit or non-prod default) |
| `ENABLE_CONTENT_POPULATION_V1` | ON |
| `ENABLE_UNIVERSAL_DISCOVERY_V1` | ON |
| `ENABLE_REAL_LIBRARY_POPULATION_V1` / expansion / originals | ON |
| `ENABLE_FIRST_EXTERNAL_PROVIDER_V1` | ON for Pexels pilot |
| `ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1` | **OFF** |
| `ENABLE_PROVIDER_SCHEDULED_SYNC_V1` | **OFF** |
| `ENABLE_CREATOR_LIBRARY_PUBLICATION_V1` | OFF (staging policy) |
| `PEXELS_API_KEY` | PRESENT (required before population) |

### phase3b vs staging bootstrap

`phase3b-populate-real-library.mjs` forces Pexels (`force: true`), mixes creator pilot local preview paths, and is local-pilot oriented.  
**Staging path:** `scripts/staging-ul-bootstrap.mjs` — bounded `--limit`, no fixture seed, no local creator pilot, no force unless `--force`.

## Risk

- Medium: new tables + public API surface on staging Core  
- Does not reset DB; migration is CREATE TABLE / INDEX only  
- Does not change Dashboard  
- Does not enable scheduled sync  

## Gates

| Gate | Meaning |
|------|---------|
| A | `GET /api/universal-library/assets?status=PUBLISHED` → **200** (empty OK) |
| B | Bootstrap Originals + ≤20 Pexels → public count > 0 |
| C | Staging `/library` shows real cards |

## Results (post-operator config + bootstrap)

| Field | Value |
|-------|-------|
| CORE DEPLOY | **YES** — PR #82 on staging |
| MIGRATIONS | **Applied** |
| FLAGS | `fixturesV1=false`, `providerScheduledSyncV1=false`, `externalOpenProviderV1=true` |
| PEXELS CONFIG | **PRESENT** (sync produced 16 REFERENCE assets) |
| ORIGINALS IMPORT | **YES** — 41 `cardbey_internal` HOSTED public assets |
| PROVIDER PILOT | **YES** — 16 Pexels REFERENCE (bounded) |
| PUBLIC ASSETS | **57** (`fixturesExcluded=true`) |
| FIXTURES | Flag **OFF**; public payload has **0** fixture/mock/seed providers |
| RIGHTS / CUSTODY | Pexels `hostingMode=REFERENCE`, license `Pexels License`, openLicense; Originals HOSTED |
| API | `GET /api/universal-library/assets?status=PUBLISHED` → **200**, total **57** |
| IMAGE DELIVERY | Pexels preview HEAD **200** `image/jpeg`; Originals Core public HEAD **200** `image/png` |
| DASHBOARD | Staging bundle `VITE_API_BASE_URL=https://cardbey-core-staging.onrender.com`; `/library` loads (SPA consumes Core catalogue) |
| DESKTOP / MOBILE | Same Core catalogue endpoint; no empty-catalogue hardcode in HTML |
| RESTART PERSISTENCE | DB-backed `UniversalAsset` ids; repeat GET stable at 57 |
| Deployed commit | `49650125d` (+ docs PR #83) |

### Staging inventory (public)

| Metric | Count |
|--------|------:|
| Public total | 57 |
| Pexels (REFERENCE) | 16 |
| Cardbey Originals / internal (HOSTED) | 41 |
| Fixtures in public | 0 |
| Industries observed | beauty, fashion, food-drink, hair, home-services, retail, travel |

### Sample Pexels trace

`cmsjskrpv001mjfi5g52m9jd1` — Food-drink photo - Astrid Sosa → `provider=pexels`, `hostingMode=REFERENCE`, preview on `images.pexels.com`, collection `open-media-essentials`.

### Not enabled (by design)

- Scheduled provider sync remains **OFF**
- Public fixtures remain **OFF**
- Production/main promotion **not** part of this task

## Verdict

**UNIVERSAL_LIBRARY_STAGING_OPERATIONAL_READY**

Proven chain: staging Dashboard → staging Core UL API → staging DB ← Originals + bounded Pexels REFERENCE path, fixtures excluded, previews render, catalogue persists across repeated reads.
