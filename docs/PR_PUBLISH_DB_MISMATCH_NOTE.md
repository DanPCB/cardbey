# PR note: Publish DB mismatch (P2021 / P2022) — fix and prevention

## What caused P2021 / P2022

- **P2022 (column does not exist):** The Prisma schema defines `Business.heroImageUrl`, `avatarImageUrl`, and `publishedAt`, but the database file in use did not have these columns. This happens when:
  - `DATABASE_URL` points at a different SQLite file than the one migrations were run on (e.g. an old `dev.db` or another path), or
  - The migration that adds these columns (`20260208120000_add_business_hero_avatar_published`) was never applied to this DB.
- **P2021 (table does not exist):** The app (or an old Prisma client) tried to access the `Section` table. The current schema has no `Section` model; the table was dropped by a later migration (or a partial run of `20260208073206`). So either the DB no longer has `Section` but something still referenced it, or the client was generated from an older schema that had `Section`.

## Changes in this PR

1. **Publish error handling**  
   In `POST /api/store/publish` (stores.js), Prisma errors **P2021** and **P2022** are caught and return **409** with a clear JSON body:
   - `error: "Database schema out of date"`
   - `message: "DB schema out of date — run prisma migrate dev"`
   - `action: "Run: cd apps/core/cardbey-core && npx prisma migrate status && npx prisma migrate dev"`  
   So the UI can show an actionable message instead of a raw 500/stack trace. Server logs still contain the full error.

2. **Docs**  
   - `docs/PRISMA_MIGRATION_RESOLVE.md`: added a section on P2021/P2022 at publish (what they mean, how to fix, how to prevent, API behavior).

## How to prevent this in the future

- After pulling schema or migration changes, run in `apps/core/cardbey-core`:
  - `npx prisma migrate status`
  - `npx prisma migrate dev` (if there are pending migrations)
  - `npx prisma generate` (if not run in postinstall)
- Use a single local DB file for dev (e.g. `file:./prisma/dev.db`) and ensure `.env` `DATABASE_URL` matches the file you run migrations against.
- If a migration fails (e.g. 20260208073206 with UNIQUE constraint), follow `docs/PRISMA_MIGRATION_RESOLVE.md` to mark it rolled back and re-run `migrate dev` so the DB stays in sync.

## DB confirmation (for PR/notes)

- **Provider:** sqlite  
- **DATABASE_URL:** `file:./prisma/dev.db` (or value from `.env` in apps/core/cardbey-core; redact if needed)  
- **Migrations:** Run `npx prisma migrate status` in `apps/core/cardbey-core`. If it reports “Database schema is up to date”, the DB has the migrations applied (including `Business.heroImageUrl` from `20260208120000`). If the failed migration was resolved as rolled back, the `Section` table may or may not exist depending on migration history; the current schema does not use `Section`.
