# Impact Report: LLM Cache v1 (Tenant-Scoped + TTL + Safe Eviction)

**Date:** 2026-03-01  
**Scope:** Upgrade LlmCache model and llmCache.js to support tenantKey, purpose, TTL (expiresAt), lastAccessedAt, hitCount, and opportunistic purge. No changes to store creation, provider, or kernel transitions.

---

## (a) Migration effects on Postgres

- **New columns:** `tenantKey`, `purpose`, `expiresAt`, `lastAccessedAt`, `hitCount`.
- **Unique constraint change:** From `@@unique([promptHash, provider, model])` to `@@unique([tenantKey, purpose, promptHash, provider, model], name: "LlmCache_key")`. Prisma will generate a migration that alters the table (add columns, drop old unique, add new unique). Existing rows must get defaults: `tenantKey = 'global'`, `purpose = 'llm'`, `expiresAt = createdAt + 14 days` (or similar), `lastAccessedAt = createdAt`, `hitCount = 0`. If the migration is generated as "recreate table", existing cache rows may be lost unless we add a data-migration step.
- **Mitigation:** Use `prisma migrate dev` to generate the migration; if it produces a destructive change, edit the migration SQL to add columns with defaults and backfill `expiresAt` from `createdAt` before dropping the old unique.

---

## (b) SQLite db push behavior

- **No migrations for SQLite.** Unit tests and local dev use `db push`. Push will apply the new schema: add columns, change unique. SQLite may recreate the table if the unique constraint change requires it; existing rows could be lost on push. For local dev this is usually acceptable (cache is ephemeral). If the table is recreated, existing cache entries disappear.

---

## (c) Breaking changes to unique constraints

- **Yes.** The compound unique key name in the Prisma client changes from `promptHash_provider_model` to `tenantKey_purpose_promptHash_provider_model` (Prisma derives the name from the field list). Any code using the old `findUnique`/`upsert` where shape breaks until updated.
- **Mitigation:** llmCache.js is the only consumer; we update it to use the new compound key in getCached and setCached.

---

## (d) Updates to llmCache.js where clause names

- **Required.** Replace all `promptHash_provider_model` with `tenantKey_purpose_promptHash_provider_model` and pass `tenantKey` and `purpose` in the where object. Signatures change to include `tenantKey` and `purpose` (with defaults).

---

## (e) Whether existing cache rows become invalid

- **Postgres (after migration):** If we backfill `tenantKey='global'`, `purpose='llm'`, and `expiresAt = createdAt + 14 days`, existing rows remain valid until 14 days after their original `createdAt`. Rows older than 14 days from migration time will be expired and purged on next `purgeExpired`.
- **SQLite (after db push):** If the table is recreated, all existing rows are lost. If the migration adds columns with defaults and alters the unique in place, existing rows can be preserved with defaults (SQLite may require a table copy for the new unique).
- **Recommendation:** Treat cache as best-effort; no data migration required for existing rows if acceptable to lose or re-key them.

---

## (f) Summary

| Area | Effect |
|------|--------|
| Store creation | No change |
| Provider / kernel | No change |
| API /api/mi/llm/generate-copy | No change (same request/response) |
| getCached/setCached callers | Must pass tenantKey + purpose (runLlmGenerateCopyJob updated) |
| Existing cache rows | May be lost on SQLite push; on Postgres can be backfilled to stay valid for 14 days |
