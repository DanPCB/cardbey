# Creator Foundation — Staging Postgres Migration

Run this on **staging** before production deploy. SQLite dev migration is already applied locally.

## Migration

`prisma/postgres/migrations/20260709140000_creator_foundation_p1/migration.sql`

Creates:

- `Creator` (one profile per `User`)
- `CreatorContent` (VIDEO | ARTICLE | LIVESTREAM)

## Staging commands

```bash
cd apps/core/cardbey-core

# Ensure DATABASE_URL points at staging Postgres
export DATABASE_URL="postgresql://..."

npm run db:generate:postgres
npx prisma migrate deploy --schema prisma/postgres/schema.prisma
```

## Verify

```bash
npx prisma db execute --schema prisma/postgres/schema.prisma --stdin <<'SQL'
SELECT tablename FROM pg_tables WHERE tablename IN ('Creator', 'CreatorContent');
SQL
```

Expected: both tables listed.

## Rollback note

This migration is additive only. Rollback = drop tables if no production creator data exists:

```sql
DROP TABLE IF EXISTS "CreatorContent";
DROP TABLE IF EXISTS "Creator";
```

Do **not** run rollback on staging/production after creators have published content.

## Phase 1.5 smoke test (post-migrate)

1. Create creator profile (`POST /api/creator/profile`)
2. Upload video via `POST /api/performer/runtime/ui-action/upload-creator-video`
3. Save draft → submit review → publish
4. Confirm `GET /api/creators/feed` returns item
5. Confirm homepage **Creators** lane shows content
6. Confirm `GET /api/creator/progress` reflects published minutes
