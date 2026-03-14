# Impact Report: Production Database Path Resolution

**Date:** 2026-03-13  
**Scope:** `apps/core/cardbey-core/src/env/ensureDatabaseUrl.js` (single source of truth for `DATABASE_URL`).

---

## 1. Root cause

- **Symptom:** Mission starts successfully; later `/api/draft-store/:id/summary` returns `404 DRAFT_NOT_FOUND`.
- **Cause:** On Render, `/tmp` (and previously hardcoded `/data`) was used as a **silent fallback** when `DATABASE_URL` was missing or “invalid”. `/tmp` is **ephemeral** and is wiped on every deploy/restart, so DraftStore, jobs, and runs created before restart disappear. All code paths use the same Prisma client (and thus the same `process.env.DATABASE_URL`), but the **resolved URL pointed at ephemeral storage**.
- **Contributing factor:** No fail-fast when production resolved to an ephemeral path; no explicit requirement for `DATABASE_URL` or a persistent disk in production.

---

## 2. Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/env/ensureDatabaseUrl.js` | Refactored: single source of truth, ephemeral-path detection, production fail-fast, startup logging, `PERSISTENT_DISK_PATH` support. No other files modified; `server.js` still imports this first; `db/prisma.js` still uses `process.env.DATABASE_URL` only. |

---

## 3. What could break (and mitigations)

- **Render without `DATABASE_URL` or `PERSISTENT_DISK_PATH`:** Server will **throw at startup** instead of silently using `/tmp` or `/data`. **Mitigation:** Set `DATABASE_URL` (Postgres or `file:/path/on/persistent/disk`) or set `PERSISTENT_DISK_PATH` and mount a persistent disk (see below).
- **Render with SQLite on a path that doesn’t exist or isn’t writable:** Server will throw in `ensureSqliteWritable()` with a clear message. **Mitigation:** Mount a persistent disk at the path you use (e.g. `/data`) and ensure the process can write there.
- **Existing workflows:** Mission logic, draft-store routes, and Prisma usage are **unchanged**. Only the **resolution and validation** of `DATABASE_URL` before any Prisma client is created were updated.

---

## 4. Minimal diff summary

- **Removed:** All silent fallbacks to `/tmp` or hardcoded `/data` in production.
- **Added:**
  - `EPHEMERAL_PREFIXES = ['/tmp', '/var/run']`; production must not resolve to these.
  - `PERSISTENT_DISK_PATH` env: in production, if `DATABASE_URL` is unset, `DATABASE_URL` is set to `file:${PERSISTENT_DISK_PATH}/cardbey-prod.db` (only when `PERSISTENT_DISK_PATH` is set).
  - Fail-fast: throw at startup if production and (1) `DATABASE_URL` is missing and `PERSISTENT_DISK_PATH` is unset, or (2) resolved path is ephemeral, or (3) SQLite path is not writable.
  - Startup log: `[env] DB resolution: { environment, provider, resolved, storage }` (secrets redacted for Postgres).
- **Unchanged:** Development can still omit `DATABASE_URL` (defaults to `prisma/prod.db`) or use a local path; fallback to `prisma/dev.db` if the chosen path is not writable.

---

## 5. Manual verification steps (Render)

1. **Postgres (recommended for production)**  
   - Set `DATABASE_URL=postgresql://...` in Render env.  
   - Deploy. Logs should show: `[env] DB resolution: { environment: 'render', provider: 'postgres', resolved: 'postgresql://*** (redacted)', storage: 'persistent' }`.  
   - Create a mission → create draft → restart service → GET draft summary. Draft should still exist (no `DRAFT_NOT_FOUND`).

2. **SQLite on persistent disk**  
   - In Render, add a **Persistent Disk** to the cardbey-core service; mount path e.g. `/data`.  
   - Set **either**:
     - `DATABASE_URL=file:/data/cardbey-prod.db`, **or**
     - `PERSISTENT_DISK_PATH=/data` (and leave `DATABASE_URL` unset to use `file:/data/cardbey-prod.db`).  
   - Deploy. Logs: `[env] DB resolution: { environment: 'render', provider: 'sqlite', resolved: '/data/cardbey-prod.db', storage: 'persistent' }`.  
   - Same test: create mission/draft, restart, GET summary → draft still there.

3. **Fail-fast check**  
   - Remove `DATABASE_URL` and `PERSISTENT_DISK_PATH` (or set `DATABASE_URL=file:/tmp/cardbey-prod.db`).  
   - Deploy. Server should **exit with an error** at startup (no silent use of ephemeral storage).

---

## 6. Env var contract: dev vs prod

| Env | DATABASE_URL | PERSISTENT_DISK_PATH | Behavior |
|-----|--------------|----------------------|----------|
| **Development** | Optional | Ignored | Default: `file:<PACKAGE_ROOT>/prisma/prod.db`. If path not writable, fallback to `prisma/dev.db`. Ephemeral paths allowed (e.g. `/tmp`) for local testing. |
| **Production (Render or NODE_ENV=production)** | Optional *if* PERSISTENT_DISK_PATH set | Optional | **Required:** either `DATABASE_URL` set to a **non-ephemeral** path or Postgres URL, **or** `PERSISTENT_DISK_PATH` set (e.g. `/data`) and a disk mounted at that path. Resolving to `/tmp` or `/var/run` **throws at startup**. |
| **Postgres** | `postgresql://...` or `postgres://...` | Ignored | Left unchanged; no file path checks; startup log shows `resolved: 'postgresql://*** (redacted)'`, `storage: 'persistent'`. |

**Ephemeral paths (production must not use):** `/tmp`, `/var/run`.  
**Typical persistent paths on Render:** `/data` (with Persistent Disk mounted at `/data`), or use Postgres.

---

## 7. DraftStore / jobs / runs consistency

- **Single source of truth:** `ensureDatabaseUrl.js` runs first (imported at top of `server.js`); it sets and validates `process.env.DATABASE_URL`.
- **Single client:** `db/prisma.js` creates one `PrismaClient` instance using `process.env.DATABASE_URL` (read by Prisma at construction). All routes (draft-store, MI, orchestrator, etc.) use `getPrismaClient()`.
- **No other code** sets `DATABASE_URL` or constructs a second Prisma client for DraftStore. No change required to draft-store or mission logic for DB resolution consistency.
