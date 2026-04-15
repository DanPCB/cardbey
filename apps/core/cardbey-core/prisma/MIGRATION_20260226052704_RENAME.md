# Migration 20260226052704 → 20260226200100_schema_json_updates

The migration that altered `AgentMessage`, `Mission`, etc. was renamed so it runs **after** the migrations that create those tables (fixing shadow DB "no such table: AgentMessage").

## If you see "Migrations applied to the database but absent from the migrations directory: 20260226052704"

Your database has the old migration name recorded. Update it so Prisma treats the renamed migration as already applied:

**SQLite (dev.db):**

```sql
UPDATE _prisma_migrations
SET migration_name = '20260226200100_schema_json_updates'
WHERE migration_name = '20260226052704';
```

Then run:

```bash
npx prisma migrate dev --name add_llm_cache
```

to create and apply the new LlmCache migration.

## If you prefer to reset (all data will be lost)

```bash
npx prisma migrate reset
```

This drops the database, reapplies all migrations (including the renamed one), and runs seed if configured.
