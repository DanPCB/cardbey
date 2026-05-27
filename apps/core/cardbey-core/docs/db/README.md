# Core database documentation

| File | Purpose |
|------|---------|
| `schema-fingerprint.json` | Committed schema/DB fingerprint — update via `npm run db:fingerprint` |
| `BASELINE_AUDIT_LATEST.md` | Latest audit from `npm run db:baseline:audit` |
| `schema-current.prisma.snapshot` | Prisma schema snapshot |
| `schema-current.sql.snapshot` | SQLite DDL snapshot (when sqlite3 CLI available) |

Repo-level plans:

- `docs/db/MIGRATION_BASELINE_PLAN.md` (monorepo root)
- `docs/db/POSTGRES_MIGRATION_PLAN.md`
- `docs/SCHEMA_FREEZE.md`
