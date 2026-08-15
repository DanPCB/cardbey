# Prisma PostgreSQL Template Library catch-up

**Status:** `PRISMA_PG_TEMPLATE_LIBRARY_CATCHUP_READY`  
**Branch:** `fix/prisma-pg-template-library-catchup`  
**Base:** `origin/staging` `430fc17a724644de53220b375792456c2ea86ddb` (includes #143 pending migrations)

No RTMPS worktree. No SQLite migration. No Render deploy.

## Models / tables (exact Prisma names)

| Prisma model | Table |
|--------------|--------|
| `TemplateLibrary` | `TemplateLibrary` |
| `ContentTemplate` | `ContentTemplate` |
| `ContentTemplateVersion` | `ContentTemplateVersion` |
| `TemplateInstance` | `TemplateInstance` |
| `TemplateAsset` | `TemplateAsset` |
| `TemplateFavorite` | `TemplateFavorite` |

Prompt aliases `ContentTemplateInstance` / `ContentTemplateAsset` / `ContentTemplateFavorite` are **not** the schema names.

## Migration

- **Name:** `20260815180000_template_library_catchup`
- **SQL source:** reviewed extract of CI `prisma migrate diff --from-migrations --to-schema-datamodel` (artifact from PR #140). **All DROP / unrelated CREATE / AlterTable / RenameIndex statements excluded.**
- Additive: `CREATE TABLE`, `CREATE INDEX` / unique indexes, `ADD CONSTRAINT` FKs only.

### SQL summary

Six tables with `TEXT` ids (cuid), `TIMESTAMP(3)`, JSONB on version/instance payloads, string JSON defaults (`[]`, `["en"]`).

Delete behavior:

| FK | On delete |
|----|-----------|
| `ContentTemplate.libraryId` → `TemplateLibrary` | CASCADE |
| `ContentTemplateVersion.templateId` → `ContentTemplate` | CASCADE |
| `TemplateInstance.templateId` → `ContentTemplate` | RESTRICT |
| `TemplateInstance.templateVersionId` → `ContentTemplateVersion` | RESTRICT |
| `TemplateAsset.templateVersionId` → `ContentTemplateVersion` | CASCADE |
| `TemplateAsset.templateInstanceId` → `TemplateInstance` | CASCADE |

`TemplateFavorite` has **no** FK (schema has `userId` / `templateId` strings only).

`TemplateInstance.idempotencyKey` unique (nullable; Postgres allows multiple NULLs).

## Existing-database preflight

`apps/core/cardbey-core/scripts/prisma-template-library-preflight.mjs`  
`npm run prisma:template-library:preflight`

Read-only `psql` against `DATABASE_URL` / `POSTGRES_DATABASE_URL`. Never `migrate resolve`.

| Case | Exit | Proven on disposable Postgres 15 `:55432` |
|------|------|-------------------------------------------|
| Tables absent | 0 `PREFLIGHT_TABLES_ABSENT` | `cardbey_absent` |
| Objects + history | 0 `PREFLIGHT_ALREADY_APPLIED` | `cardbey_empty` after full `migrate deploy` |
| Objects, no history row | 2 `PREFLIGHT_ORPHAN_OBJECTS` | template of empty DB with history row deleted |
| Partial / shape mismatch | 3 | (design; not forced) |

If staging previously received `db push`, run preflight **before** deploy. If exit 2, stop and reconcile that environment by hand.

## Empty-database result

Disposable `cardbey_empty`: full historical chain (85 migrations) including this one **applied successfully**. Second `migrate deploy`: **No pending migrations to apply.**

## Post-migration `migrate diff`

Template Library identifiers **absent** from the remaining drift SQL.

Still present (unchanged product debt; out of scope):

- CREATE `CreatorPayoutAccount`, POS/commerce/inventory tables, `BusinessEvent`, `OAuthConnection`, `teacher_traces`
- DROP `ContentLibraryCollection`, `business_*_events`
- DROP of #143 objects that exist in history but not in the current datamodel (`claim_otp`, `multi_market_*`, `prebuilt_*`, `public_business_card`)
- updatedAt/default cleanup, Live Market index-name truncation

## Schema variants

| Pair | Template Library models |
|------|-------------------------|
| `prisma/postgres` vs `prisma/sqlite` | **Identical** field/index/relation text |
| vs `prisma/schema.prisma` (root sqlite) | Same fields; extra comments only |

**SQLite migration chain remains independently blocked** (`20260711080337_init` / `AccountProfile` shadow failure). Not fixed here. Needs `ACK PRISMA_SQLITE_SHADOW_CHAIN`.

Postgres schema `output` is `client-gen`; root schema uses default `@prisma/client` output. Pre-existing, not this batch.

## Tests

| Suite | Result |
|-------|--------|
| Prisma validate (postgres schema) | pass |
| Prisma generate (postgres) | pass |
| `test:live-market` (76) | pass (CI worktree; no schema runtime change for those tests) |
| Design library ContentTemplate adapter + runway/journeys contracts (26) | pass |
| RTMPS schema delta vs `origin/staging` | **none** (`git diff origin/staging...origin/pr-139 -- prisma` empty) |

## Data risks

- Empty DB: create-only; no data to lose.
- Staging with `db push` tables: **do not** re-run raw SQL; preflight exit 2 then manual `migrate resolve --applied` only if shapes match.
- Unique `idempotencyKey` / `(libraryId, slug)` / `(userId, templateId)` will fail if duplicates already exist from a push — preflight will show extra/missing indexes; do not drop rows automatically.
- No commerce/creator/business-event objects touched.

## Files changed

- `apps/core/cardbey-core/prisma/postgres/migrations/20260815180000_template_library_catchup/migration.sql`
- `apps/core/cardbey-core/scripts/prisma-template-library-preflight.mjs`
- `apps/core/cardbey-core/package.json` (script `prisma:template-library:preflight`)
- `docs/reports/PRISMA_PG_TEMPLATE_LIBRARY_CATCHUP.md` (this file)
