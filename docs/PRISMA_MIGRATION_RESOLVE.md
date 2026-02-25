# Resolving failed migration 20260208073206_add_business_hero_avatar_urls

## What happened

1. **20260208120000_add_business_hero_avatar_published** was applied successfully. It added only:
   - `Business.heroImageUrl`
   - `Business.avatarImageUrl`
   - `Business.publishedAt`
   So your DB **already has** these columns.

2. You then ran `npx prisma migrate dev --name add_business_hero_avatar_urls`. Prisma compared the **current schema** to the DB and generated a **new** migration (20260208073206) that:
   - Drops the `Section` table
   - Recreates `Business` (drops `groupMode`), `Product` (drops `itemType`, `sectionId`), and other tables
   - That migration failed with: **UNIQUE constraint failed: Business.userId** (SQLite 2067)

The failure occurs during the Business table recreate (CREATE new_Business → INSERT SELECT → DROP Business → RENAME). The UNIQUE error usually means either duplicate `userId` in the source data or a partial apply leaving the DB in a bad state.

## What you need

- You do **not** need migration 20260208073206 to have hero/avatar columns; they are already in the DB from 20260208120000.
- You need to **unblock** Prisma so it stops treating 20260208073206 as a pending failed migration.

## Steps (run from `apps/core/cardbey-core`)

### 1. Mark the failed migration as rolled back

This tells Prisma “this migration was not applied; do not retry it.”

```bash
npx prisma migrate resolve --rolled-back 20260208073206_add_business_hero_avatar_urls
```

### 2. Confirm DB has hero/avatar columns (optional)

```bash
npx prisma migrate status
```

You should see no pending migrations (20260208073206 is now “rolled back”, not pending). Your DB already has the hero/avatar columns from 20260208120000.

### 3. (Optional) Remove the failed migration file so it is never applied

If you want to avoid Prisma ever trying to apply that migration again (it does destructive things like dropping `Section`), you can delete the migration folder:

- Delete the folder:  
  `prisma/migrations/20260208073206_add_business_hero_avatar_urls`

**Warning:** After deleting, if your **schema** still has changes that that migration was trying to apply (e.g. no `Section` model, no `groupMode` on Business), then `prisma migrate status` may report schema drift. In that case you have two paths:

- **Option A:** Restore the schema to match the current DB (re-add Section, groupMode, etc.) so there is no drift, **or**
- **Option B:** Create a **new** migration that only applies the minimal, safe changes you want (e.g. only drop Section / columns) and fix any UNIQUE constraint issues (e.g. ensure no duplicate `userId` in `Business` before recreating the table).

For now, **step 1 alone** is enough to unblock development; the app can use the existing hero/avatar columns.

## Summary

- **Cause:** Migration 20260208073206 tried to recreate `Business` (and other tables). That led to `UNIQUE constraint failed: Business.userId`.
- **Fix:** Run `npx prisma migrate resolve --rolled-back 20260208073206_add_business_hero_avatar_urls`. Hero/avatar columns are already present from 20260208120000.
- **Code safeguard:** The slug fix in `src/utils/slug.js` (using `select: { id: true }` in `generateUniqueStoreSlug`) avoids selecting missing columns and remains a good safeguard.

---

## P2021 / P2022 when publishing (POST /api/store/publish)

### What they mean

- **P2022:** “Column X does not exist in the current database.”  
  Usually: `Business.heroImageUrl` (or `avatarImageUrl`, `publishedAt`) is in the Prisma schema but the DB you’re using hasn’t had the migration that adds those columns applied.
- **P2021:** “Table X does not exist in the current database.”  
  Usually: `Section` — the schema no longer has a `Section` model, but either the DB was partially migrated (e.g. Section was dropped by a failed run of 20260208073206) or you’re pointing at a different DB file that never had Section / no longer has it.

### How to fix

1. **Confirm DB and Prisma point at the same DB**
   - In `apps/core/cardbey-core`: check `prisma/schema.prisma` → `datasource db { provider = "sqlite"; url = env("DATABASE_URL") }`.
   - Ensure `.env` (or env in your run) has `DATABASE_URL` set to the same file you run migrations against (e.g. `file:./prisma/dev.db`). Redact the path when pasting in PR/notes.
2. **Apply migrations**
   - `npx prisma migrate status`  
   - If there are pending migrations: `npx prisma migrate dev`.  
   - If the failed migration 20260208073206 is still pending, run:  
     `npx prisma migrate resolve --rolled-back 20260208073206_add_business_hero_avatar_urls`  
     then run `npx prisma migrate dev` again. Hero/avatar columns come from 20260208120000.
3. **Regenerate client**
   - `npx prisma generate`  
   So the runtime client matches the schema (no stale `Section` or missing columns in generated code).

### How to prevent

- After pulling schema or migration changes: run `npx prisma migrate status` and `npx prisma migrate dev` (and `npx prisma generate` if you don’t run it in postinstall) in `apps/core/cardbey-core` before running the API.
- Use a single local DB file for dev (e.g. `file:./prisma/dev.db`) so you’re not accidentally running against an old or different SQLite file.

### API behavior

- The publish handler now catches **P2021** and **P2022** and returns **409** with a body like:  
  `{ ok: false, error: "Database schema out of date", message: "DB schema out of date — run prisma migrate dev", action: "Run: cd apps/core/cardbey-core && npx prisma migrate status && npx prisma migrate dev" }`  
  so the UI can show a clear message instead of a raw 500/Prisma stack trace.
