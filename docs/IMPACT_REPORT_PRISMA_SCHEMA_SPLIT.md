# Impact Report: Prisma Schema Split (SQLite + Postgres)

**Date:** 2026-03-01  
**Scope:** Split single `prisma/schema.prisma` into `prisma/sqlite/` (local + unit tests, db push) and `prisma/postgres/` (contract tests + staging/prod, migrate deploy). No runtime logic changes except Prisma config and CI.

---

## (a) What could break

| Area | Risk | Mitigation |
|------|------|-------------|
| **Store creation workflow** | Low. No code paths changed; only schema file location and which schema is used to generate the client. DATABASE_URL and client usage unchanged. | None beyond using correct `--schema` when generating. |
| **Existing Prisma client imports** | Low. Code imports from `@prisma/client` or `node_modules/.prisma/client-gen`. Generator `output` remains `../node_modules/.prisma/client-gen` in both schemas, so import paths stay the same. | Generate the appropriate schema (SQLite for local/dev, Postgres for contract tests) before run. |
| **LlmCache model usage** | Medium. Postgres schema uses `@@unique([promptHash, provider, model])` and `model String @default("")` (required). SQLite keeps `promptHash @unique` and `model String?`. So `findUnique({ where: { promptHash } })` works for SQLite; Postgres requires composite `findUnique({ where: { promptHash_provider_model: { promptHash, provider, model } } })`. | Align both schemas: use composite unique and required `model` in both, so one codebase works (see Step 2). |
| **Migration history** | Medium. Current migrations under `prisma/migrations/` are SQLite. Postgres gets a new `prisma/postgres/migrations/` with a single baseline migration. No reuse of SQLite migrations for Postgres. | Do not move or mix SQLite migrations into Postgres. Run `prisma migrate dev --schema prisma/postgres/schema.prisma --name baseline_postgres` once to create baseline. |
| **CI workflows** | Low. tests.yml and contract-tests.yml updated to pass explicit `--schema`. Unit tests use SQLite + db push; contract tests use Postgres + migrate deploy. | Use `prisma generate --schema prisma/sqlite/schema.prisma` then `db push` in tests.yml; `prisma generate --schema prisma/postgres/schema.prisma` then `migrate deploy` in contract-tests.yml. |
| **postinstall / pretest** | Low. package.json `postinstall` currently runs `npx prisma generate` (no schema). After split, it must target one schema (e.g. SQLite for dev). `pretest` must use `--schema prisma/sqlite/schema.prisma` for db push. | Update scripts to use explicit `--schema`. |

---

## (b) Why

- **Two DBs:** Local/dev and unit tests use SQLite (file DB, no server). Contract tests and staging/prod use Postgres. One schema file cannot serve both when provider differs.
- **LlmCache:** Postgres needs a composite unique for cache key (promptHash + provider + model) and required `model` for consistency. Aligning SQLite the same way avoids two code paths in `llmCache.js`.

---

## (c) Rollback

- Restore `prisma/schema.prisma` from git; remove `prisma/sqlite/` and `prisma/postgres/`.
- Revert package.json and workflow changes.
- No data migration; schema files and CI only.

---

## (d) Verification (no store/LLM regressions)

- Local dev works with SQLite (`db:generate` → sqlite schema; start API).
- Unit tests pass (SQLite schema + db push).
- Contract tests pass (Postgres schema + migrate deploy).
- LlmCache get/set works in both environments (composite unique in both schemas).
- Store creation flow unchanged (no code change).
- LLM task and admin LLM health route unchanged.
