# Fix Prisma migration P3006 — clean migration story

## Current state

- **Failed migration:** `20260208073206_add_business_hero_avatar_urls` was replaced with a **no-op** (SELECT 1) so the shadow DB applies cleanly; hero/avatar columns come from `20260208120000_add_business_hero_avatar_published`.
- **New migration:** `20260217120000_add_ai_credits_and_welcome_bundle` adds User columns: `aiCreditsBalance`, `welcomeFullStoreRemaining`, `aiCreditsUpdatedAt`.

## Option A: Clean DB (recommended for dev)

**Warning: This destroys all data in the database. Use only on a development database.**

1. From `apps/core/cardbey-core` run:
   ```bash
   npx prisma migrate reset
   ```
2. Confirm when prompted. All migrations will reapply from scratch, including the new AI credits migration.
3. Verify: `npx prisma migrate status` → "Database schema is up to date."

## Option B: Keep existing DB (no reset)

If your DB already has the 3 User columns (e.g. from `db push`) and you do **not** want to reset:

1. Mark the new migration as applied without running it:
   ```bash
   npx prisma migrate resolve --applied 20260217120000_add_ai_credits_and_welcome_bundle
   ```
2. Verify: `npx prisma migrate status` → "Database schema is up to date."

If you see **drift** or "migration was modified after it was applied", your dev DB was altered (e.g. `db push`) and does not match migration history. Use Option A for a clean state, or fix drift manually.

## GET /api/billing/balance returns 500 "Unknown field aiCreditsBalance"

This means the **Prisma Client** was generated before the User model had `aiCreditsBalance` / `welcomeFullStoreRemaining`, or the migration was not applied.

1. **Stop the API server** (so the Prisma client DLL is not locked).
2. From `apps/core/cardbey-core` run:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```
   (Or `npx prisma migrate reset` for a clean dev DB per Option A above.)
3. Restart the API server.

The billing route now returns `{ ok: true, aiCreditsBalance: 0, welcomeFullStoreRemaining: 0 }` when this validation error occurs, so the UI no longer 500s; fix the client/migration for real balance.

## Acceptance

- On a **clean DB**, `npx prisma migrate reset` runs without errors and all migrations apply, including `20260217120000_add_ai_credits_and_welcome_bundle`.
- No dependency on `db push` for the 3 User fields; they are added by that migration.
