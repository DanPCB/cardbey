# Impact Report — Universal Library Core Staging Deployment

**Date:** 2026-08-08  
**Branch:** `feat/ul-core-staging-deploy` (focused port from `feat/universal-library-staging-milestone`)  
**Status:** Gate A **PASSED**. Population blocked on staging flag hygiene + operator bootstrap.

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

## Results

| Field | Value |
|-------|-------|
| CORE DEPLOY | **YES** — Render staging healthy after merge of PR #82 |
| MIGRATIONS | **Applied** (API returns catalogue shape; tables usable) |
| FLAGS | See below — **fixturesV1=true and providerScheduledSyncV1=true are unsafe for this milestone** |
| PEXELS CONFIG | `externalOpenProviderV1=true`; **PEXELS_API_KEY** not observable via health → treat as **UNKNOWN** until ops confirm PRESENT |
| ORIGINALS IMPORT | **Not run** (blocked pending flag fix + admin/shell bootstrap) |
| PROVIDER PILOT | **Not run** |
| PUBLIC ASSETS | **0** (empty catalogue, expected pre-bootstrap) |
| FIXTURES | Flag currently **ON** on staging — must set `ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1=false` before any seed-run |
| RIGHTS | N/A until pilot |
| API | Gate A: `GET .../assets?status=PUBLISHED` → **200** `{ total: 0, fixturesExcluded: true }` |
| DASHBOARD | Still empty until population (expected) |
| DESKTOP / MOBILE | Pending population |
| RESTART PERSISTENCE | Pending population |
| Deployed commit | `49650125d9bfca96b563b18def5c37692fdf9d56` (merge PR #82) |

### Staging health `features.universalLibrary` (observed)

```
v1=true populationV1=true discoveryV1=true realPopulationV1=true
externalOpenProviderV1=true
fixturesV1=true                 ← MUST BE false
providerScheduledSyncV1=true    ← MUST BE false for this milestone
creatorLibraryPublicationV1=true
```

### Remaining blockers (stop before population)

1. Set on **cardbey-core-staging** Render env then redeploy/restart:
   - `ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1=false`
   - `ENABLE_PROVIDER_SCHEDULED_SYNC_V1=false`
2. Confirm `PEXELS_API_KEY` = **PRESENT** (do not invent).
3. Run staging-safe bootstrap on Core host/DB:
   ```bash
   node scripts/staging-ul-bootstrap.mjs --provider=pexels --limit=16
   ```
   Or authenticated admin:
   - `POST /api/universal-library/admin/import-originals`
   - `POST /api/universal-library/admin/sync-pexels` `{ "maxPublish": 16 }`
   - `POST /api/universal-library/admin/publish-real-collections`

## Verdict

**UNIVERSAL_LIBRARY_STAGING_BLOCKED**

Blocker: Gate A complete; population not executed because staging currently has **fixtures enabled** and **scheduled provider sync enabled**, and this agent cannot confirm/set `PEXELS_API_KEY` or run authenticated admin bootstrap against staging from this environment.
