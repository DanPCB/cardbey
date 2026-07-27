# SQLite migration repair report

**Date:** 2026-06-12  
**Scope:** Local Prisma SQLite migration hygiene for Cardbey Core (`apps/core/cardbey-core`)  
**Runtime / Creative Factory code:** unchanged

---

## Root cause

Four separate issues blocked local `prisma migrate deploy` and Core startup:

| Issue | Cause |
|-------|--------|
| Dirty migration history | Failed `_prisma_migrations` rows from partial re-runs (discovery, hero, SkillDispatchLog) |
| SQLite-incompatible SQL | `ADD COLUMN IF NOT EXISTS` used in **Postgres-only** chain (`prisma/postgres/migrations/`); main SQLite chain was already mostly clean |
| Duplicate column (`heroImageUrl`) | `20260610180000_ensure_business_hero_media_fields` re-added columns already created in `20260208120000_add_business_hero_avatar_published` |
| Missing `SkillDispatchLog` table | `20260611180000_skill_dispatch_log_query` altered a table that was never created in the migration chain (model existed in `schema.prisma` only) |

---

## DB backup

```text
apps/core/cardbey-core/prisma/prod.backup-before-migration-repair.db
```

Created before any schema or migration file changes.

---

## Migrations changed

### Added

| Migration | Purpose |
|-----------|---------|
| `20260611175000_add_skill_dispatch_log` | `CREATE TABLE IF NOT EXISTS` for `SkillDispatchLog` + `SkillDispatchFeedback` and indexes (SQLite, sqlite/, postgres/) |

### Converted to no-op (`SELECT 1;`)

| Migration | Reason |
|-----------|--------|
| `20260610180000_ensure_business_hero_media_fields` | Columns already added in `20260208120000` |
| `20260611180000_skill_dispatch_log_query` | `query` column included in `20260611175000` |

### Verified unchanged (already SQLite-safe)

| Migration | Status |
|-----------|--------|
| `20260610120000_add_discovery_pipeline` | Plain `ADD COLUMN`; `CREATE TABLE/INDEX IF NOT EXISTS` |
| `20260610140000_add_discovery_config` | Plain `ADD COLUMN`; `CREATE TABLE IF NOT EXISTS` |

---

## New scripts

| Script | Role |
|--------|------|
| `scripts/audit-sqlite-migrations.mjs` | Read-only audit: incompatible SQL, duplicate-column risk, missing-table deps, drift |
| `scripts/repair-sqlite-schema.mjs` | Idempotent local repair via `PRAGMA table_info` / `sqlite_master`; optional `--cleanup-failed-duplicates` |

---

## Repair performed on `prod.db`

```text
node scripts/repair-sqlite-schema.mjs --cleanup-failed-duplicates
```

Result:

- Created `SkillDispatchLog`, `SkillDispatchFeedback`, `intelligence_override`
- Ensured SkillDispatchLog / SkillDispatchFeedback indexes
- No columns added (discovery/hero columns already present)

Recovery sequence:

```powershell
npx prisma migrate resolve --rolled-back 20260611180000_skill_dispatch_log_query --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
```

---

## Validation output

### `npx prisma migrate status --schema=prisma/schema.prisma`

```text
134 migrations found in prisma/migrations
Database schema is up to date!
```

### `npx prisma migrate deploy --schema=prisma/schema.prisma`

Applied on recovery run:

- `20260611175000_add_skill_dispatch_log`
- `20260611180000_skill_dispatch_log_query` (no-op)
- `20260611190000_add_intelligence_override`
- `20260613120000_add_ghost_store_models`

Final state: **All migrations have been successfully applied.**

### `node scripts/audit-sqlite-migrations.mjs`

- **A.** No `ADD COLUMN IF NOT EXISTS` in `prisma/migrations/` (Postgres chain still has them — expected)
- **C.** Missing-table dependency risk: **0** (SkillDispatchLog gap closed)
- **D.** Failed migrations: **none**; local not applied: **none**
- Legacy note: DB row `20260611120000_product_catalog_item_type` has no folder in `prisma/migrations/` (sqlite-only chain artifact; non-blocking while `migrate status` is clean)

### `node scripts/repair-sqlite-schema.mjs`

Second run: no changes (idempotent) — `tablesCreated: []`, `columnsAdded: []`.

### `npx prisma generate --schema=prisma/schema.prisma`

Client generated successfully.

### `npx prisma db seed --schema=prisma/schema.prisma`

No seed script configured in schema (command exits cleanly).

### Migration health (Core startup check)

```json
{ "ok": true, "failed": [], "pending": [] }
```

No **DATABASE MIGRATION HISTORY IS DIRTY** banner.

---

## Remaining risks

1. **Historical migrations** use plain `CREATE INDEX` / `DROP TABLE` without `IF NOT EXISTS` — fine for sequential fresh deploy, risky only if re-run manually on a dirty DB (audit flags these).
2. **`prisma/sqlite/migrations/`** partial chain can confuse `migrationHealthCheck` when compared to `prisma/migrations/` — documented in recovery guide.
3. **Postgres chain** still uses `IF NOT EXISTS` patterns; do not copy those files into the SQLite chain.
4. **`20260612200000_add_content_interaction_metrics`** was listed in an earlier status check but is not present in the repo migration folders; if it reappears, validate before deploy.

---

## Final verdict

**Can local Creative Factory testing continue?**

## YES

Blockers resolved:

- Migration history is clean on `prod.db`
- No SQLite syntax errors on deploy
- No duplicate `heroImageUrl` failure (migration is no-op)
- `SkillDispatchLog` table exists before query/no-op migration
- Core migration health check passes
