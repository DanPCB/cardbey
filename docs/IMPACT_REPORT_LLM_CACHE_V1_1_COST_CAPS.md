# Impact Report: LLM Cache v1.1 (Cost Caps + LRU Eviction)

**Date:** 2026-03-01  
**Scope:** Response/prompt caps, per-tenant LRU eviction, reduced hit writes. No schema or API changes.

---

## (a) What could break

| Risk | Mitigation |
|------|------------|
| **Eviction deletes rows** | Eviction runs only after a cache write (setCached), in try/catch; job never depends on eviction success. Deleted rows are LRU (oldest lastAccessedAt); next request for that prompt will miss and re-fetch. |
| **hitCount / lastAccessedAt write frequency** | We only update on hit when `now - lastAccessedAt > 5 min`. Reduces write load; hitCount becomes an approximate “recent hits” metric. Non-fatal if update fails. |
| **Query performance** | `enforceTenantCap` does count + findMany (orderBy lastAccessedAt, take N) + deleteMany. Index `(tenantKey, lastAccessedAt)` exists; batch size capped (200). If a tenant has many rows, count + findMany may be slower but runs only on cache miss and in try/catch. |
| **Prompt skip heuristic** | UUID regex may false-positive on normal text containing UUIDs; we skip caching for that prompt only. Task still completes via provider. |
| **Response cap** | Responses > 32KB are not cached; same prompt later will call provider again. No functional break. |

---

## (b) Summary

- All new behavior is best-effort and wrapped in try/catch where it could fail.
- No schema, API, or orchestrator/kernel changes.
- Tuning: constants in llmCache.js; optional env vars (already wired): `LLM_CACHE_MAX_RESPONSE_BYTES`, `LLM_CACHE_MAX_PROMPT_CHARS`, `LLM_CACHE_MAX_ROWS_PER_TENANT`, `LLM_CACHE_EVICT_BATCH_SIZE`, `LLM_CACHE_ACCESS_UPDATE_MIN_MS`.

**Why eviction is safe and non-blocking:** Eviction runs only after a successful `setCached` (cache write), inside a try/catch. If it throws (e.g. DB timeout), the job has already completed and the catch is silent. Deleted rows are the least-recently-accessed; the next request for that prompt will miss and call the provider again. No orchestration or API contract depends on cache presence.
