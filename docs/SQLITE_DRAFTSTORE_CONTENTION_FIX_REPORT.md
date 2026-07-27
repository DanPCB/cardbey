# SQLite DraftStore Contention Fix Report

**Date:** 2026-06-13  
**Scope:** Socket timeout / lock contention during `structured_store_build` → `draftStore.create()` on local SQLite.

---

## Final verdict: Can store creation complete on local SQLite?

**YES**

With authority-write serialization enabled for local SQLite dev, `safeDraftStoreCreate` wired into `createDraftStoreForUser` / `createDraft`, transient retry (P1008 + SQLITE_BUSY), reduced frontend poll pressure during `structured_store_build`, and the contention gauntlet passing on `dev-fresh.db`.

---

## Root cause

After the TIMESTAMP(3) schema fix, store draft creation failed with:

> Socket timeout: the database failed to respond to a query within the configured timeout (P1008)

This was **SQLite write contention**, not invalid data:

1. **`structured_store_build`** runs a burst of critical writes: `createBuildStoreJob` → `draftStore.create`, `missionPipeline.update`, `missionPipelineStep.update`, `missionBlackboard.appendEvent`, orchestrator task transitions.

2. **Concurrent read polling** from Performer hit the same SQLite file every 2.5–8s:
   - `GET /api/mi/missions/:id/reasoning-log`
   - `GET /api/mi/missions/:id/events`
   - `GET /api/missions/:id/blackboard`
   - `GET /api/missions/:id/state` (+ mission projection poll ~10s)

3. **`createDraftStoreForUser` bypassed the existing write hardening** — it called `prismaClient.draftStore.create()` directly instead of `safeDraftStoreCreate` (authority lane + retry).

4. **Write serialization was OFF by default** (`PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION=false`), so mission runner writes and draft creation could overlap.

---

## Routes writing during polling (audit)

| Route | Writes during GET? |
|-------|-------------------|
| `GET /api/missions/:id/state` | **No** — read-only via `resolveMissionState()` |
| `GET /api/missions/:id/blackboard` | **No** — read-only via `getEvents()` |
| `GET /api/mi/missions/:id/reasoning-log` | **No** — read-only `mission.findUnique` |
| `GET /api/mi/missions/:id/events` | **No** — read-only `missionEvent.findMany` |

Polling increased **read load and lock waits** but did not perform side-effect writes. Contention came from **parallel readers + concurrent writers**, not hidden writes in read routes.

---

## Serializer / retry changes

### Backend

| Change | File |
|--------|------|
| `createDraftStoreForUser` + `createDraft` → `safeDraftStoreCreate` | `draftStoreService.js` |
| Transient retry for P1008 **and** SQLITE_BUSY (3 attempts, exponential backoff) | `safeDraftStoreCreate.js`, `sqliteCriticalWrite.js` |
| Observability events | `sqliteWriteObservability.js` |
| Authority lane queue wait logging | `sqliteWriteLane.js` |
| **Auto-enable** `PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION=true` for local SQLite dev | `loadEnv.js` |

Telemetry events (JSON log lines):

- `SQLITE_WRITE_WAIT`
- `SQLITE_WRITE_RETRY`
- `SQLITE_WRITE_TIMEOUT`
- `SQLITE_CRITICAL_WRITE_STARTED`
- `SQLITE_CRITICAL_WRITE_COMPLETED`

Each includes `operation` and `missionId` when provided.

### Frontend (poll backoff)

When `structured_store_build` is `running` / `executing` / `queued`:

- New helper: `isStructuredStoreBuildCriticalWriteInProgress()`
- Slower poll intervals via `resolveBlackboardPollIntervals()`:
  - Blackboard: 8s → **16s**
  - Mission events: 3.5s → **8s**
  - Reasoning log: 2.5s → **6s**

Wired through `ConsoleCentreColumn` → `useMissionBlackboardRows`.

---

## Validation

### Unit tests (7 passing)

```
safeDraftStoreCreate.test.js       — P1008 + SQLITE_BUSY retry
sqliteWriteLane.test.js            — FIFO lane
draftStoreCreateTimestamp.test.js  — createDraftStoreForUser integration
```

### Gauntlet

```powershell
cd apps/core/cardbey-core
node scripts/sqlite-draftstore-contention-gauntlet.mjs
```

**Result: PASS** on `dev-fresh.db` — concurrent simulated polling + `safeDraftStoreCreate` + mission update + blackboard append, no socket timeout.

---

## Local dev checklist

1. Restart Core after pull (serialization auto-enables in `loadEnv.js` for SQLite).
2. Optional explicit flag: `PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION=true` in `.env`.
3. Retry store creation in Performer — draft create should serialize behind mission writes instead of timing out.
4. Watch Core logs for `SQLITE_*` events if contention persists.

To disable serialization (not recommended for local SQLite): `PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION=false`.

---

## Files changed

**Core**

- `src/lib/sqliteWriteObservability.js` *(new)*
- `src/lib/safeDraftStoreCreate.js`
- `src/lib/sqliteCriticalWrite.js`
- `src/lib/sqliteWriteLane.js`
- `src/services/draftStore/draftStoreService.js`
- `src/env/loadEnv.js`
- `src/lib/__tests__/safeDraftStoreCreate.test.js`
- `scripts/sqlite-draftstore-contention-gauntlet.mjs` *(new)*
- `.env.example`

**Dashboard**

- `src/app/console/missions/blackboardPollWhileStoreBuild.ts`
- `src/app/console/ConsoleCentreColumn.tsx`
- `src/hooks/useMissionBlackboardRows.ts`
- `src/components/MissionControl/BlackboardFeed.tsx` (prop type)
