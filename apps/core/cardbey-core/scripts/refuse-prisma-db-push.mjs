#!/usr/bin/env node
/**
 * Guards accidental `prisma db push --accept-data-loss`.
 * Prefer focused migrations under prisma/sqlite|postgres/migrations.
 *
 * Override (explicit, reviewed): ALLOW_PRISMA_DB_PUSH_ACCEPT_DATA_LOSS=1
 * then use npm run db:push:dangerous
 */
console.error(`
[prisma-safety] Refusing broad prisma db push.

Device V2 Phase 1 uses focused migrations only:
  prisma/sqlite/migrations/20260715120000_device_installation_id
  prisma/postgres/migrations/20260715120000_device_installation_id

Safe commands:
  npm run prisma:sqlite:validate
  npm run prisma:postgres:validate
  npm run prisma:device:audit
  npx prisma migrate deploy --schema prisma/sqlite/schema.prisma
  npx prisma migrate deploy --schema prisma/postgres/schema.prisma

Do NOT run:
  npx prisma db push --accept-data-loss
against prisma/schema.prisma or against populated DBs.

If you truly need a legacy test DB wipe, use:
  npm run db:push:dangerous
with ALLOW_PRISMA_DB_PUSH_ACCEPT_DATA_LOSS=1 (test DBs only).
`);
process.exit(1);
