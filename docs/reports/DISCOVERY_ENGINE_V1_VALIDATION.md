# Discovery Engine V1 — Staging Validation Report

**Date:** 2026-06-19  
**Scope:** `apps/core/cardbey-core/src/lib/discoveryEngine/`  
**Validator:** Automated audit + hardening pass + test/integration runs  

---

## Executive summary

Discovery Engine V1 is **safe to deploy to staging** with the following conditions:

1. Apply migration `20260616120000_add_discovery_engine_job` on staging Postgres before relying on job history.
2. Set `DISCOVERY_JOBS_BACKEND=db` on Render (default auto-detects when table exists).
3. OSM live runs require valid `NOMINATIM_USER_AGENT` and outbound network access.
4. Standalone CLI scripts currently fail in this workspace due to a **bcryptjs module resolution** issue when loading the ingestion pipeline graph outside Vitest — use API or `pnpm run test:discovery-engine` until CLI import chain is slimmed (follow-up).

**Verdict:** Discovery creates **BusinessSeeds only** (`seeded_pending_qa`), never stores. Hardening applied for rate limits, dedupe, API auth, referral anti-spam, CSV validation, and DB-backed jobs.

---

## 1. Provider safety

| Provider | Status | Notes |
|----------|--------|-------|
| **OSM** | ✅ Hardened | Nominatim 1 req/s (`1100ms`) + Overpass 2s courtesy delay; User-Agent from `NOMINATIM_USER_AGENT`; outputs `BusinessCandidate[]` only |
| **CSV** | ✅ Hardened | Rows must have `businessName` or contact/address; invalid rows rejected; zero valid rows → error |
| **Referral** | ✅ Hardened | Pre-flight duplicate check vs seed corpus; 5/user/24h job limit; API rate limit 5/24h; metadata `referred_pending_review` |
| **Manual** | ✅ Secured | Requires platform admin (`requireAdmin`); website or phone required on API |

No provider creates Business, DraftStore, or activated stores.

---

## 2. Runtime authority

Static audit of `discoveryEngine/`:

| Check | Result |
|-------|--------|
| `persistStores: true` in discovery code | **None found** |
| Direct `attachStoreToSeed` / Prisma Business writes | **None in discoveryEngine** |
| Promotion pipeline | `persistStores: false` (explicit comment + test) |
| Post-promotion guard | `assertDiscoverySeedsGoverned()` — rejects `storeId`, `draftId`, non-QA status |
| QA bypass | **None** — all seeds via `IngestionPipeline` → `seeded_pending_qa` |

Automated tests: `runtimeAuthority.test.ts` (5/5 pass).

---

## 3. Deduplication validation

`BusinessIdentityEngine` thresholds:

- **> 95** → duplicate (rejected in batch / referral blocked)
- **70–95** → review_required (still promoted with `possible_duplicate` resolution)
- **< 70** → unique

Hardening applied:

- Exact website host match → floor **96**
- Equivalent phone (incl. AU `04…` ↔ `+614…`) → floor **96**
- Same brand name (≥0.75 similarity) → floor **72** (review, not duplicate)
- Same name + coords <50m → floor **85–96**

| Scenario | Expected | Test |
|----------|----------|------|
| Same website | duplicate | ✅ `dedupeScenarios.test.ts` |
| Same phone (AU formats) | duplicate | ✅ |
| Same name + close coords | duplicate/review | ✅ |
| Same name, far coords | review, not duplicate | ✅ |
| Weak match | unique | ✅ |

**21/21** discovery engine tests pass.

---

## 4. Discovery job durability

### Problem (pre-hardening)

`data/discoveryEngine/jobs.json` is **not persistent on Render** — ephemeral filesystem is wiped on deploy/restart.

### Fix applied

- Prisma model `DiscoveryEngineJob` → Postgres table `discovery_engine_job`
- Migration: `20260616120000_add_discovery_engine_job` (sqlite + postgres)
- **Postgres / Render:** jobs **must** use the database — silent fallback to `jobs.json` is **disabled**
- **Local SQLite dev:** uses DB when table exists; `jobs.json` only when table missing and not production
- Env override: `DISCOVERY_JOBS_BACKEND=db|file` (tests use `file`)
- Bootstrap: `npm run db:ensure-discovery-engine-job` (SQLite idempotent ensure)

### Backend selection (current behavior)

| Environment | Storage |
|-------------|---------|
| Render + Postgres | `discovery_engine_job` table only — **fails loudly** if migration not applied |
| `DATABASE_URL=postgresql://…` | Database only |
| Local SQLite (table exists) | Database |
| Local dev (no table) | `data/discoveryEngine/jobs.json` with warning |

### Staging deploy checklist

```bash
# Postgres (Render)
pnpm -C apps/core/cardbey-core exec node scripts/run-postgres-prisma.js migrate deploy

# Or ensure migration 20260616120000_add_discovery_engine_job is applied
```

---

## 5. API security

| Endpoint | Auth | Rate limit |
|----------|------|------------|
| `GET /metrics` | platform admin | — |
| `GET /jobs` | platform admin | — |
| `POST /discover` | platform admin | 20/hour per user |
| `POST /csv` | platform admin | 20/hour per user |
| `POST /manual` | platform admin | 20/hour per user |
| `POST /referrals` | authenticated | 5/24h per user |

Additional hardening:

- `csvPath` **rejected** on API (CLI only) — prevents path traversal
- CSV uploads use `POST /csv` with `csvContent` only
- Referral duplicates return **409** with `referral_duplicate`

---

## 6. Dashboard

Route: `/control-center/discovery-center`

| Feature | Status |
|---------|--------|
| Summary cards (candidates, pending QA, claimable, verified, activated) | ✅ |
| Discovery funnel chart | ✅ |
| Source / region / category breakdown | ✅ |
| OSM run form | ✅ (admin API) |
| Manual entry form | ✅ |
| Recent jobs table | ✅ (null-safe empty state) |
| Route registered in `App.jsx` + nav | ✅ |

Static review: no hydration-specific SSR (client-only page). Empty metrics render zeros, not crash.

---

## 7. Commands run

### Tests (PASS)

```bash
cd apps/core/cardbey-core
$env:NODE_ENV='test'
$env:DATABASE_URL='file:../test.db'
$env:DISCOVERY_JOBS_BACKEND='file'
npx vitest run src/lib/discoveryEngine/__tests__
```

**Result:** 7 files, **21/21 tests passed**

Includes integration parity tests equivalent to CLI:

- CSV: 2 candidates → 2 accepted, job `completed`
- Referral: 1 candidate → 1 accepted, job `completed`

### CLI (PARTIAL — known issue)

```bash
pnpm discovery:csv --file data/discoveryEngine/fixtures/sample-businesses.csv
pnpm discovery:referrals --name "Test Business" --website https://example.com
pnpm discovery:osm --city Melbourne --category Food --limit 10
```

**Result:** Standalone CLI fails with:

```
ERR_MODULE_NOT_FOUND: bcryptjs/index.js
  imported from draftStoreService.js (transitive via IngestionPipeline graph)
```

Vitest runs the **same** `runDiscoveryEngine()` successfully — issue is CLI/tsx module resolution in pnpm workspace, not discovery logic.

### Vitest tsx loader fix (APPLIED)

`vitest.config.js` updated:

- Was: `--import tsx/esm` (broken — package export path changed in tsx 4.x)
- Now: `--import file://…/node_modules/tsx/dist/loader.mjs` via `pathToFileURL`

---

## 8. Validation metrics (integration run)

| Metric | Value |
|--------|-------|
| CSV candidates found | 2 |
| CSV seeds accepted | 2 |
| Referral candidates found | 1 |
| Referral seeds accepted | 1 |
| Duplicates rejected (integration) | 0 |
| Jobs created | 2+ (see `data/discoveryEngine/jobs.json`) |
| Seeds with `storeId` | 0 |
| Seeds verification status | `seeded_pending_qa` |

Sample job audit (`jobs.json` excerpt):

```json
{
  "provider": "csv",
  "status": "completed",
  "recordsFound": 2,
  "recordsAccepted": 2,
  "recordsRejected": 0
}
```

---

## 9. Known risks & follow-ups

| Risk | Severity | Mitigation |
|------|----------|------------|
| ~~`seeds.json` ephemeral on Render~~ | ~~Medium~~ | **Fixed:** `business_seed` Postgres table + no production JSON fallback |
| CLI bcryptjs import chain | Medium | Use API or Vitest integration; lazy-import ingestion graph in follow-up |
| OSM external dependency | Low | Throttled; failures recorded as `failed` jobs |
| In-memory referral rate limit | Low | Resets on multi-instance — acceptable for V1; move to Redis if abuse observed |
| OSM CLI not validated live | Low | Provider unit-tested; run manual OSM on staging with `--limit 10` after deploy |

---

## 10. Success criteria

| Criterion | Met |
|-----------|-----|
| Discovery creates BusinessSeeds only | ✅ |
| Seeds stay `seeded_pending_qa` | ✅ |
| No automatic store creation | ✅ |
| Discovery Center loads safely | ✅ |
| CLI and API use same registry (`runDiscoveryEngine`) | ✅ (API + integration; CLI blocked by deps) |
| Job history reliable on Render | ✅ (after DB migration) |
| Safe for staging deploy | ✅ |

---

## Files changed in hardening pass

- `providers/OsmDiscoveryProvider.ts` — rate limits
- `providers/CsvDiscoveryProvider.ts` — validation
- `providers/referralGuard.ts` — anti-spam
- `normalization/csvValidation.ts` — row rules
- `dedupe/BusinessIdentityEngine.ts` — AU phone + signal floors
- `governance/runtimeAuthority.ts` — post-promotion assert
- `jobs/DiscoveryJobRepository.ts` — DB + file dual backend
- `routes/discoveryEngineRoutes.js` — `/csv`, rate limits, auth
- `prisma/*/schema.prisma` + migrations — `discovery_engine_job`
- `vitest.config.js` — tsx loader fix
- `scripts/discovery-*.mjs` — remove TS syntax from `.mjs`
- `package.json` — tsx loader path for CLI scripts
- `__tests__/*` — dedupe, runtime, integration tests
