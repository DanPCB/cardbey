# DRAFT_NOT_FOUND in Production — Root Cause and Fix

**Date:** 2026-03-13  
**Symptom:** Mission starts successfully (draft + job + run returned); `GET /api/draft-store/:id/summary` returns `404 DRAFT_NOT_FOUND`.

---

## 1. Root cause analysis

### Most likely: multiple instances + SQLite

- **Observation:** Development works; production fails.
- **Explanation:** On Render (or any multi-instance deployment), if the service runs **more than one instance** and uses **SQLite** (`DATABASE_URL=file:...`):
  - Each instance has its **own** process and its **own** copy of `DATABASE_URL`.
  - With a **per-instance** disk (e.g. `/data` on each container), each instance has a **different** SQLite file on its local filesystem.
  - Instance A handles mission start → creates draft in **A’s** DB.
  - Instance B handles the next request (e.g. summary) → looks up the draft in **B’s** DB → **not found** → 404.

So the draft exists in A’s database, but the summary request is served by B, which uses a different database file.

### Other possibilities (ruled out or mitigated)

- **Ephemeral path (/tmp):** Already addressed in `ensureDatabaseUrl.js` (fail-fast and no fallback to `/tmp` in production).
- **Wrong draft id:** Same `draftId` is returned at mission start and used in `GET /api/draft-store/:id/summary`; no evidence of id mix-up.
- **Race:** Unlikely to cause 404; more likely a transient error. Diagnostics (instanceId + DB path) will show if create and summary hit different instances.
- **Multiple Prisma clients in one process:** Draft store **route** previously created its own `new PrismaClient()` from `@prisma/client`. It now uses `getPrismaClient()` from `db/prisma.js`. Within a single process, all clients read the same `DATABASE_URL`, so this was not the cause of cross-instance 404 but is fixed for consistency.

---

## 2. Files inspected

| File | Purpose |
|------|--------|
| `apps/core/cardbey-core/src/env/ensureDatabaseUrl.js` | Single source of truth for `DATABASE_URL`; runs before any Prisma; fail-fast for ephemeral paths; startup log + instanceId + SQLite multi-instance warning. |
| `apps/core/cardbey-core/src/server.js` | Imports `ensureDatabaseUrl.js` first; mounts `/api/draft-store`; uses `getPrismaClient()` from `db/prisma.js`. |
| `apps/core/cardbey-core/src/db/prisma.js` | Singleton Prisma client via `getPrismaClient()`; reads `process.env.DATABASE_URL` at construction. |
| `apps/core/cardbey-core/src/lib/prisma.js` | Separate module-level `new PrismaClient()` (client-gen); used by `draftStoreService.js`, `miRoutes.js`, etc. Same `DATABASE_URL` in one process. |
| `apps/core/cardbey-core/src/routes/draftStore.js` | **Before:** Own `new PrismaClient()` from `@prisma/client` for create/by-store/claim/summary/etc. **After:** Uses `getPrismaClient()`; adds `[DraftSummaryLookup]` log (instanceId, draftId, database). |
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | Uses `prisma` from `lib/prisma.js`; `getDraft(draftId)` and create helpers use this client. Same process → same DB. |

---

## 3. Multiple DB paths or Prisma clients?

- **DB path:** Only one resolved value per process: `process.env.DATABASE_URL` set by `ensureDatabaseUrl.js`. No other module overrides it.
- **Prisma clients:**
  - **Before:** `routes/draftStore.js` used a **third** client (`@prisma/client`). `draftStoreService` and others use `lib/prisma.js` (client-gen). `server.js` and some routes use `db/prisma.js` (client-gen). All read the same `DATABASE_URL` in one process.
  - **After:** Draft store **route** uses `getPrismaClient()` (same singleton as the rest of the app). `draftStoreService` still uses `lib/prisma.js`; both connect to the same URL in a single process.
- **Conclusion:** No “wrong DB path” in one process. The 404 is explained by **different instances** (different processes) each with their own SQLite file when not using a shared DB (e.g. Postgres).

---

## 4. Minimal diff applied

1. **`apps/core/cardbey-core/src/routes/draftStore.js`**
   - Replaced `import { PrismaClient } from '@prisma/client'; const prisma = new PrismaClient();` with `import { getPrismaClient } from '../db/prisma.js'; const prisma = getPrismaClient();`.
   - Added `getInstanceId()` (hostname or pid) and `getDatabasePathForLog()` (redacted for postgres).
   - In `GET /:draftId/summary`: log `[DraftSummaryLookup] { instanceId, draftId, database }` on every request; log `[DraftSummaryLookup] not_found` on 404.

2. **`apps/core/cardbey-core/src/env/ensureDatabaseUrl.js`**
   - Added `import os from 'node:os'`.
   - In `logStartupAndFailIfEphemeral()`: include `instanceId` (hostname or pid) in `[env] DB resolution` log.
   - When production and SQLite: log a **warning** that multiple instances each use their own DB and to use Postgres or a single instance to avoid DRAFT_NOT_FOUND.

No change to mission logic, draft creation flow, or orchestrator.

---

## 5. Risk assessment

- **Unifying draft store route to `getPrismaClient()`:** Low. Same process still uses one `DATABASE_URL`; we only remove a redundant client and avoid `@prisma/client` vs client-gen mismatch.
- **Diagnostic logs:** Low. Logging is additive; no behavior change. Logs may contain draft ids and DB path (redacted for postgres).
- **SQLite multi-instance warning:** Low. Warning only; no throw. Nudges production toward Postgres or single instance.

---

## 6. Manual verification steps

1. **Confirm diagnostics in production**
   - After deploy, check startup logs for:
     - `[env] DB resolution: { environment, provider, resolved, storage, instanceId }`.
     - If SQLite: `[env] SQLite in production: with multiple instances...`.
   - Trigger a mission start then a summary request. Check logs for:
     - `[DraftSummaryLookup] { instanceId, draftId, database }`.
     - If 404: `[DraftSummaryLookup] not_found { instanceId, draftId, database }`.

2. **Interpret instanceId**
   - If `instanceId` (or hostname) **differs** between the request that creates the draft and the one that calls summary → different instances; consistent with multi-instance + SQLite.
   - If `instanceId` is the **same** and summary still 404 → investigate wrong id, deletion, or schema/table mismatch.

3. **Fix for multi-instance + SQLite**
   - **Option A (recommended):** Use **Postgres** in production: set `DATABASE_URL=postgresql://...`. All instances share one DB; create and summary will see the same draft.
   - **Option B:** Run **one instance** only (e.g. scale to 1 on Render) so all requests hit the same process and same SQLite file.
   - **Option C:** Use a **shared volume** for SQLite (if your platform supports it) so every instance mounts the same path and file. (Render’s persistent disk is per-service; confirm whether it’s shared across instances.)

4. **Sanity check**
   - With Postgres (or single instance + SQLite), create a mission, then call `GET /api/draft-store/:draftId/summary` with the returned `draftId`. Expect 200 and same `instanceId` if single instance.

---

## 7. Env / deployment contract

- **Development:** Single process; SQLite or Postgres; no multi-instance issue.
- **Production (single instance):** SQLite on a persistent path or Postgres; one DB; create and summary stay on same instance.
- **Production (multiple instances):** Use **Postgres** so all instances share one DB. If you keep SQLite, expect DRAFT_NOT_FOUND when create and summary hit different instances (diagnostics will show different `instanceId`).
