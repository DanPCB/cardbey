# Production Promotion Checklist — P2 Unified Memory Facade

**Prepared:** 2026-06-14  
**Staging verified:** yes (memory bundle 200, migrations up to date)  
**Target:** `main` → Render live (`cardbey-core`, `cardbey-dashboard`)

---

## Scope

This promotion includes:

| Component | Commits (staging, not yet on main) | Risk |
|-----------|----------------------------------|------|
| P2 Unified Memory Facade | `dece00690` | Low — backward compatible; legacy `/api/intelligence/memory` unchanged |
| Ghost store Postgres migration fix | `f662a4781` | **Medium** — new tables + Business columns on live Postgres |
| P3009 auto-resolve pre-deploy | `12c0bbacb` | Low — only runs when failed migration in allowlist |
| Dashboard memory client | submodule `133d30e` | Low — facade-first with legacy fallback |
| Large staging WIP bundle | `dece00690` (241 files) | **Review** — P2 was merged with other staging work; confirm intentional |

**Live URLs after promotion:**

| Service | URL |
|---------|-----|
| Core | `https://cardbey-core.onrender.com` |
| Dashboard | `https://cardbey-dashboard.onrender.com` |

**Staging reference (verified):**

| Service | URL |
|---------|-----|
| Core | `https://cardbey-core-staging.onrender.com` |
| Dashboard | `https://cardbey-dashboard-staging.onrender.com` |

---

## Phase 0 — Pre-promotion gates (must pass)

### Staging verification (completed)

- [x] `POST /api/memory/bundle` → **200** `{ ok: true, bundle: {...} }`
- [x] Bundle includes `business`, `suitcase`, `user`, `session`, `mission`, `meta`
- [x] `meta.fetchDurationMs` < 200ms on staging (observed: **3ms**)
- [x] Postgres migrations: **43 applied**, schema up to date
- [x] Ghost store migration uses `TIMESTAMP(3)` (not `DATETIME`)

### Staging verification (recommended before live)

- [ ] **Authenticated bundle** — store owner JWT + real `storeId`; confirm `business` / `suitcase` populate
- [ ] **Cache hit** — two identical `/api/memory/bundle` requests; second has `meta.cacheHit: true`
- [ ] **Legacy route** — `POST /api/intelligence/memory` still **200**
- [ ] **Dashboard soak** — login on staging dashboard; Network tab shows `/api/memory/bundle` **200** (not double-hop fallback)
- [ ] **No regressions** — hero video change, intake, store preview smoke-tested on staging

### Code / config readiness

- [ ] **Align production Render commands with staging** (critical — live `render.yaml` production block is stale):

  | Setting | Staging (working) | Production (current main — update before deploy) |
  |---------|-------------------|--------------------------------------------------|
  | Build Command | `npm ci && npm run build && ...` | Still has `migrate deploy` in build — **remove** |
  | Pre-Deploy | `node scripts/resolve-postgres-failed-migration.mjs && node scripts/prisma-bootstrap.js` | Only `prisma-bootstrap.js` — **add resolver** |

  Either merge updated `render.yaml` to `main` or set manually in Render Dashboard → **cardbey-core** → Settings.

- [ ] Confirm `USE_UNIFIED_MEMORY` is **unset** or not `false` on live Core
- [ ] Confirm live Postgres `DATABASE_URL` is `postgresql://` (not SQLite)

---

## Phase 1 — Git promotion

### 1a. Dashboard submodule (`cardbey-marketing-dashboard`)

```bash
cd apps/dashboard/cardbey-marketing-dashboard
git checkout staging
git pull origin staging
git checkout main
git merge staging --ff-only   # or merge commit if branches diverged
git push origin main
```

**Expected on `main`:** includes `133d30e` (memoryFacadeClient, useUnifiedMemory, memoryClient fallback).

### 1b. Monorepo (`cardbey`)

```bash
cd /path/to/cardbey
git checkout staging
git pull origin staging
git checkout main
git pull origin main

# Update submodule pointer to dashboard main
git submodule update --init --recursive
cd apps/dashboard/cardbey-marketing-dashboard && git checkout main && git pull && cd ../../..
git add apps/dashboard/cardbey-marketing-dashboard

git merge staging --no-ff   # or ff-only if main is ancestor
git push origin main
```

**Expected commits on `main`:** at minimum `dece00690`, `f662a4781`, `12c0bbacb`.

### 1c. Optional — sync production block in `render.yaml`

Before push, ensure **cardbey-core** production service matches staging deploy pattern:

```yaml
buildCommand: npm ci && npm run build && (pip install crewai crewai-tools --quiet || echo "pip not available, CrewAI disabled")
preDeployCommand: node scripts/resolve-postgres-failed-migration.mjs && node scripts/prisma-bootstrap.js
```

Commit on `main` if not already included from staging merge.

---

## Phase 2 — Render deploy (production)

Deploy order: **Core first**, then **Dashboard**.

### 2a. cardbey-core (live)

1. Render Dashboard → **cardbey-core** → confirm branch **`main`**
2. Verify Build / Pre-Deploy commands (Phase 0 table)
3. **Manual Deploy** → watch logs

**Pre-deploy log — success indicators:**

```
[resolve-postgres-failed] no failed migrations
[prisma] migrate deploy
Applying migration `20260613120000_add_ghost_store_models`   # if not yet on live DB
All migrations have been successfully applied.
```

**If P3009 on live Postgres:**

```bash
# Render Shell → cardbey-core
cd ~/project/src/apps/core/cardbey-core
npx prisma migrate resolve --rolled-back 20260613120000_add_ghost_store_models --schema prisma/postgres/schema.prisma
npx prisma migrate deploy --schema prisma/postgres/schema.prisma
```

Then redeploy.

**If P3018 (`DATETIME` error):** live DB has old migration SQL in artifact — ensure `f662a4781` is on `main` before deploy.

### 2b. cardbey-dashboard (live)

1. Render Dashboard → **cardbey-dashboard** → branch **`main`**
2. **Manual Deploy** after Core is healthy
3. Confirm build uses updated submodule (`git submodule update` in buildCommand)

---

## Phase 3 — Post-deploy verification (production)

Run within 15 minutes of live deploy.

### Core API

```bash
# Health
curl -s https://cardbey-core.onrender.com/api/health

# Intake probe
curl -s https://cardbey-core.onrender.com/api/performer/intake/v2

# P2 memory facade (guest)
curl -s -X POST https://cardbey-core.onrender.com/api/memory/bundle \
  -H "Content-Type: application/json" \
  -d '{"context":{"actor":{"type":"guest","id":null}}}'
```

| Check | Expected |
|-------|----------|
| Health | HTTP 200 |
| Memory bundle | HTTP 200, `"ok":true`, `bundle.meta.fetchDurationMs` present |
| Legacy | `POST /api/intelligence/memory` → 200 (backward compat) |

### Intelligence layer

```bash
curl -s https://cardbey-core.onrender.com/api/intelligence/health
```

Expected: `{ "ok": true, "status": "ok", ... }`

### Dashboard (browser)

1. Open `https://cardbey-dashboard.onrender.com`
2. Log in as store owner
3. DevTools → Network: filter `memory/bundle` → **200**
4. Console: no `userId: null` memory errors; PIL/briefing loads

### Logs (Render → cardbey-core → Logs)

```text
[MemoryFacade] Cache miss for actor=...
[MemoryFacade] Cache hit for actor=...
```

Should use `actor=<id>` or `anon:guest`, not ambiguous `userId: null`.

---

## Phase 4 — Rollback plan

### Fast rollback — disable facade routes only

Render → **cardbey-core** → Environment:

```bash
USE_UNIFIED_MEMORY=false
```

Redeploy. Dashboard `memoryClient.ts` falls back to `/api/intelligence/memory`.

### Full rollback — revert git

```bash
# Monorepo — revert to previous main SHA (record before merge)
git checkout main
git revert <merge-commit-sha>   # or reset if not yet widely used
git push origin main

# Dashboard submodule — revert similarly
```

Redeploy Core + Dashboard on Render.

### Migration rollback (last resort)

Ghost store migration adds columns/tables only — **do not roll back SQL** unless necessary. If migration fails mid-deploy, use same Shell recovery as staging (`migrate resolve --rolled-back` then redeploy).

---

## Phase 5 — Sign-off

| Role | Item | Sign-off |
|------|------|----------|
| Engineering | Staging P2 verified | ☐ |
| Engineering | Production Core deploy green | ☐ |
| Engineering | Production memory bundle 200 | ☐ |
| Engineering | Dashboard memory fetch 200 | ☐ |
| Engineering | Legacy intelligence/memory 200 | ☐ |
| Product / QA | Store owner flow smoke test on live | ☐ |

**Promotion approved:** _______________ **Date:** _______________

---

## Quick reference — commit SHAs (staging @ 2026-06-14)

| Repo | Branch | HEAD | Notes |
|------|--------|------|-------|
| cardbey | staging | `12c0bbacb` | P2 + migration fixes |
| cardbey-marketing-dashboard | staging | `133d30e` | Dashboard facade client |

---

## Related docs

- [MEMORY_FACADE.md](./MEMORY_FACADE.md) — architecture and API
- [STAGING_VERIFICATION_P2_MEMORY_FACADE.md](./STAGING_VERIFICATION_P2_MEMORY_FACADE.md) — initial staging report (superseded by live staging pass)
- [STAGING_MIGRATION_GHOST_STORE_FIX.md](./STAGING_MIGRATION_GHOST_STORE_FIX.md) — P3009 / DATETIME recovery
