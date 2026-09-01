# Database Integrity + Failure Recovery (W6 + W7)

Hardening workstream for schema drift gates and store-draft failure recovery on the Golden Path (`structured_store_build` → `generateDraft`).

---

## 1. DB fingerprint / health checks

**Location:** `apps/core/cardbey-core/src/lib/schemaFingerprint.js`, exposed via:

| Endpoint | Behavior |
|----------|----------|
| `GET /api/health?full=true` | Includes `dbFingerprint` object |
| `GET /api/health/db` | Returns fingerprint only; **503** when `ok: false` |

### Fingerprint fields

| Field | Meaning |
|-------|---------|
| `schemaPrismaHash` | Hash of `prisma/sqlite/schema.prisma` (committed baseline in `docs/db/schema-fingerprint.json`) |
| `tableColumnHash` | Live SQLite column fingerprint (null on Postgres) |
| `requiredColumnsOk` | `true` / `false` / `null` — see below |
| `migrationHealth` | `ok` \| `accepted` \| `unsafe` \| `unknown` |
| `warnings` | Includes `schema_prisma_hash_mismatch`, `table_column_hash_mismatch`, `required_columns_missing`, `migration_history_unsafe`, `sqlite_in_production` |

### `requiredColumnsOk` semantics

- **SQLite:** Checked synchronously from live DB (`DraftStore.publishSnapshot`, `DraftStore.publishSnapshotVersion`).
- **Postgres:** Sync health returns `null` (unknown) to avoid false 503s; live check runs in predeploy gate via `checkRequiredColumnsLive()` (`information_schema`).

### Startup assert

`assertSchemaFingerprintAtStartup()` in `server.js` / `worker.js` logs `[DB_SCHEMA_FINGERPRINT]` and enforces:

- No SQLite in production
- Committed fingerprint file present in production
- `PUBLISH_SNAPSHOT_V1=true` → required DraftStore columns on SQLite

---

## 2. Predeploy DB gate (W6)

**Script:** `npm run gate:db-schema-drift` → `scripts/check-db-schema-drift.mjs`

**Wired into:** `scripts/render-predeploy.mjs` (runs after `prisma-bootstrap` on container start).

### Gate behavior

| Condition | Production-like env | Local dev |
|-----------|---------------------|-----------|
| `requiredColumnsOk === false` (live) | **Exit 1** (blocks start/deploy) | **Warn** only |
| Migration health not ok | **Exit 1** | **Warn** only |
| Blocking fingerprint warnings (`required_columns_missing`, `migration_history_unsafe`, `sqlite_in_production`, …) | **Exit 1** | N/A |
| Non-blocking fingerprint warnings (`schema_prisma_hash_mismatch`, `table_column_hash_mismatch`) when columns + migrations OK | **Warn** (deploy allowed) | N/A |

Production-like = `NODE_ENV=production|staging` or Render env vars set.

**Emergency bypass:** `SKIP_DB_SCHEMA_DRIFT_GATE=1`

### Fix when gate fails

```bash
# Postgres (Render / staging)
cd apps/core/cardbey-core
npx prisma migrate deploy --schema prisma/postgres/schema.prisma

# SQLite dev
npm run db:migrate:dev
```

---

## 3. Draft failure path audit (`structured_store_build`)

### Before (gap)

1. `structured_store_build` calls `generateDraft`.
2. On throw: orchestrator task → `failed`, step → `failed`, but:
   - Draft could remain `generating` if transition failed
   - `mission.outputsJson.structured_store_build` missing → UI could not read `draftId` / error code
   - Only `_failed` debug key written by pipeline runner

### After (recovery)

**Files:**

- `structuredStoreBuildFailureRecovery.js` — shared recovery helpers
- `structured_store_build.js` — catch block calls recovery + returns `output` payload
- `missionPipelineRunner.js` — persists `structured_store_build` failure slice from tool `output`

---

## 4. Draft state machine on failure

```
draft | generating
        │
        ▼ generateDraft()
     generating ──success──► ready ──publish──► committed
        │
        │ error (GENERATE_DRAFT_FAILED)
        ▼
      failed
        errorCode: GENERATE_DRAFT_FAILED | STORE_BUILD_RUNTIME_DEPENDENCY_MISSING | …
        recommendedAction: retry
```

### Transitions

| From | To | Reason | Set by |
|------|-----|--------|--------|
| `generating` | `failed` | `GENERATE_DRAFT_FAILED` | `generateDraft` catch (`draftStoreService.js`) |
| `generating` | `failed` | `GENERATE_DRAFT_FAILED` | `ensureDraftFailedAfterGenerateError` (defensive, `structured_store_build`) |
| `generating` | `failed` | `EXPIRE` | Expired draft |
| `generating` | `failed` | `MISSION_PIPELINE_CANCELLED` | `finalizeDraft` cancel |

### Error codes (`DraftErrorCode`)

| Code | When |
|------|------|
| `GENERATE_DRAFT_FAILED` | Generic generation failure |
| `STORE_BUILD_RUNTIME_DEPENDENCY_MISSING` | `ERR_MODULE_NOT_FOUND` / missing runtime package |
| `INTERNAL_ERROR` | Unmapped errors (safe message only) |

---

## 5. Mission outputs on failure

On `structured_store_build` failure, `outputsJson` includes:

```json
{
  "draftId": "...",
  "generationRunId": "...",
  "jobId": "...",
  "structured_store_build": {
    "ok": false,
    "draftId": "...",
    "generationRunId": "...",
    "jobId": "...",
    "failureCode": "GENERATE_DRAFT_FAILED",
    "errorCode": "GENERATE_DRAFT_FAILED",
    "error": "We couldn't finish preparing your store draft."
  },
  "_failed": { "tool": "structured_store_build", "error": { ... }, "output": { ... } }
}
```

Dashboard reads step `error` for user message (`readStructuredStoreBuildFailureMessage`) and `outputs.structured_store_build` for IDs on restore.

---

## 6. Verification

```bash
cd apps/core/cardbey-core

# DB gate (local — warns unless prod-like)
npm run gate:db-schema-drift

# Health fingerprint (Core running)
npm run db:health:local

# Contract tests
npm test -- structured_store_build structuredStoreBuildFailureRecovery schemaFingerprint
```

---

## Related docs

- `docs/HARDENING_PROGRAM_V1.md` — W6/W7 gates and exit criteria
- `docs/db/schema-fingerprint.json` — committed schema baseline
