# Impact Report — Universal Library Core Staging Deployment

**Date:** 2026-08-08  
**Branch:** `feat/ul-core-staging-deploy` (focused port from `feat/universal-library-staging-milestone`)  
**Status:** In progress — Core deploy + Gate A pending

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

## Results (fill after deploy)

| Field | Value |
|-------|-------|
| CORE DEPLOY | pending |
| MIGRATIONS | pending |
| FLAGS | pending |
| PEXELS CONFIG | pending |
| ORIGINALS IMPORT | pending |
| PROVIDER PILOT | pending |
| PUBLIC ASSETS | pending |
| FIXTURES | pending |
| RIGHTS | pending |
| API | pending |
| DASHBOARD | pending |
| DESKTOP / MOBILE | pending |
| RESTART PERSISTENCE | pending |
| Deployed commit | pending |

## Verdict

Pending Gate A+.
