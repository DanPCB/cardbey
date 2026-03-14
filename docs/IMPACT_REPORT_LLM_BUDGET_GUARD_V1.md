# Impact Report: LLM Budget Guard v1 (Per-tenant daily caps)

**Date:** 2026-03-01  
**Scope:** Per-tenant daily caps (max calls, max estimated tokens); new `LlmUsageDaily` model; budget check before provider call; no API/store/orchestrator contract changes.

---

## (a) Risks

| Risk | Mitigation |
|------|------------|
| **False positives from token estimation** | Heuristic (chars/4) can over-estimate; tenant may hit "limit" before true token cap. Use conservative defaults; document as approximation; optional env tuning. |
| **Multi-worker race** | Reserve uses transaction read-then-update. Under concurrency, two workers can both pass the check and both call the provider (slight over-count). v1 accepts this; document. Future: CAS update or DB-level CHECK. |
| **Migration risk** | New table only; no alter to existing tables. Postgres: migrate dev/deploy. SQLite: db push only. CI that runs migrations must use Postgres schema for migrate. |
| **CI workflow differences** | Tests using SQLite (db push) get the new table without a migration. Contract/CI that runs `prisma migrate deploy` (Postgres) must include the new migration. |
| **Budget guard throws** | All budget calls in try/catch. `FAIL_OPEN=1`: on error allow provider. `FAIL_OPEN=0`: fail task with `LLM_BUDGET_CHECK_FAILED`. Process never crashes. |

---

## (b) Summary

- New table `LlmUsageDaily`; no changes to store creation, API, or kernel transitions.
- Budget check runs only when cache is missed and before calling the provider; cache hits do not touch budget (zero budget spend).
- **Token cap:** Reserve includes both tokensIn and a conservative tokensOut ceiling (`min(LLM_BUDGET_EST_OUT_PER_CALL, estTokensIn)`); commit true-up adds only `(actualTokensOut - reservedTokensOut)` so the in+out cap is enforced.
- Provider default: `'kimi'` when request omits provider so usage rows are never created with `provider = ''`.
- Concurrency: best-effort read+update in transaction; limits may be slightly exceeded under heavy concurrency (documented).

---

## (c) Env vars and defaults

| Env var | Default | Description |
|--------|---------|-------------|
| `LLM_BUDGET_ENABLED` | 1 (enabled) | Set to 0 to disable budget guard. |
| `LLM_BUDGET_MAX_CALLS_PER_TENANT_PER_DAY` | 200 | Max LLM calls per tenant per UTC day. |
| `LLM_BUDGET_MAX_TOKENS_PER_TENANT_PER_DAY` | 200000 | Max estimated tokens (in+out) per tenant per day. |
| `LLM_BUDGET_EST_OUT_PER_CALL` | 1500 | Conservative output token ceiling per call at reserve time (cap enforced on in+out). |
| `LLM_BUDGET_FAIL_OPEN` | 0 | 0 = block on budget check error; 1 = allow (best-effort). |

---

## (d) Concurrency limitations and future improvements

- **v1:** Reserve uses a transaction: upsert row, read row, then update (increment calls + tokensIn + reserved tokensOut). Under concurrent workers, two requests can both pass the read check and both get allowed, so the daily count can slightly exceed the cap. Acceptable for v1.
- **v1.1 strictness (Postgres):** For strict enforcement in contract tests/prod, use one atomic SQL update with guard on the Postgres path only; keep SQLite as transaction read+update. Example: `UPDATE "LlmUsageDaily" SET calls=calls+1, tokensIn=tokensIn+$x, tokensOut=tokensOut+$y WHERE key=... AND calls < maxCalls AND (tokensIn+tokensOut+$x+$y) <= maxTokens RETURNING id`; if no row returned → blocked. Use `prisma.$executeRaw` / `$queryRaw`.

---

## (e) Verification additions

- **Token cap test:** Set `LLM_BUDGET_MAX_TOKENS_PER_TENANT_PER_DAY=1000`, generate a prompt that yields a long output (or use a long prompt so reserved in+out exceeds 1000). Ensure a second call is blocked (or the first if reserve already exceeds cap).
- **Provider field test:** Confirm no `LlmUsageDaily` rows have `provider = ''` (default is `'kimi'` when request omits provider).
