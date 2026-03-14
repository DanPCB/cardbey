# Impact Report: LLM Budget Guard v1.1 (Reserve Out Tokens + Strict Postgres CAS)

**Date:** 2026-03-02  
**Scope:** Token cap correctness (reserve in+out, true-up), strict Postgres CAS update, provider default; no schema/API/orchestrator changes.

---

## Impact analysis (pre-implementation)

### What changes
- **llmBudget.js:** New env knobs (reserve-out ceiling, true-up decrement); reserve = tokensIn + tokensOutCeiling (constant ceiling); commitBudget supports optional decrement and never-negative tokensOut; Postgres path uses single atomic `UPDATE ... WHERE ... AND ... RETURNING`; SQLite keeps transactional read+update.
- **runLlmGenerateCopyJob.js:** Provider default `'kimi'` when missing; pass `actualTokensOut` / `reservedTokensOut` to commitBudget; derive actualTokensOut from `result?.usage?.outputTokens` or estimate.

### What stays the same
- No API contract changes; no store creation changes; no orchestrator/kernel transition logic changes.
- Budget logic remains best-effort and never crashes the process (FAIL_OPEN/FAIL_CLOSED unchanged).
- No schema changes; no new migrations.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Estimation conservativeness** | Constant ceiling (e.g. 1200) may over-reserve for short outputs; tenant hits token cap earlier. Optional decrement (TRUE_UP_ALLOW_DECREMENT=1) improves accuracy; default 0 avoids undercount if true-up fails. |
| **Undercount/overcount** | If provider doesn't return usage, we use estimated tokensOut; true-up can only add (or subtract when decrement enabled). Never decrement below zero. |
| **SQL portability** | Postgres path only when `DATABASE_URL` starts with `postgres`; otherwise SQLite/fallback. Raw SQL uses Prisma parameterized API; table/column names match Prisma schema. |
| **Concurrency correctness** | Postgres: single UPDATE with guards ensures exactly one writer wins; no read-then-write race. SQLite: existing transaction; limits may be slightly exceeded under concurrency (documented). |
| **Migrations** | None required for v1.1; existing LlmUsageDaily table unchanged. |

---

## Minimal safe patch
- Limit edits to `llmBudget.js` and `runLlmGenerateCopyJob.js`.
- Detect Postgres via `process.env.DATABASE_URL?.startsWith('postgres')`; keep detection minimal and documented.
- All budget calls remain in try/catch in the job; no new throw paths.

---

## Implementation summary (post-implementation)

### Updated llmBudget.js (v1.1)
- **Reserve:** Reservations now use `reservedTokensIn = estimateTokens(prompt).tokensIn` and `reservedTokensOut = estimateTokensOutCeiling(prompt)` (constant ceiling from env). Reserved total = in + out; daily row updated with both.
- **True-up:** `commitBudget(prisma, { actualTokensOut, reservedTokensOut, ... })` computes `delta = actualTokensOut - reservedTokensOut`. If delta > 0: increment `tokensOut` by delta. If delta < 0 and `LLM_BUDGET_TRUE_UP_ALLOW_DECREMENT=1`: set `tokensOut = max(0, tokensOut + delta)` (never negative). If delta < 0 and decrement disabled: no-op.
- **Postgres CAS:** When `DATABASE_URL` starts with `postgres`, use: upsert row, then single `UPDATE "LlmUsageDaily" SET calls = calls+1, tokensIn = tokensIn+$in, tokensOut = tokensOut+$out WHERE key AND (calls+1) <= maxCalls AND (tokensIn+tokensOut+$in+$out) <= maxTokens RETURNING id`. If RETURNING returns a row → allowed; else blocked.
- **SQLite path:** Unchanged transactional flow: upsert → read → check calls/token cap → update (increment calls, tokensIn, tokensOut).

### Updated runLlmGenerateCopyJob.js
- `const provider = request?.provider || 'kimi'` at cache-check; used for getCached, checkAndReserveBudget, commitBudget, setCached (usage rows never get `provider = ''`).
- After successful provider call: `actualTokensOut = result?.usage?.outputTokens ?? estimateTokens(prompt, result?.text).tokensOut`; `commitBudget(prisma, { tenantKey, purpose, provider, model: '', day, actualTokensOut, reservedTokensOut: budgetReservation.reservedTokensOut })`.

### Env vars and defaults (including v1.1)

| Env var | Default | Description |
|--------|--------|-------------|
| `LLM_BUDGET_ENABLED` | 1 | Set to 0 to disable budget guard. |
| `LLM_BUDGET_MAX_CALLS_PER_TENANT_PER_DAY` | 200 | Max LLM calls per tenant per UTC day. |
| `LLM_BUDGET_MAX_TOKENS_PER_TENANT_PER_DAY` | 200000 | Max estimated tokens (in+out) per tenant per day. |
| `LLM_BUDGET_RESERVE_OUT_TOKENS_CEILING` | 1200 | v1.1: Per-call output token reserve ceiling (constant). |
| `LLM_BUDGET_TRUE_UP_ALLOW_DECREMENT` | 0 | v1.1: If 1, allow subtracting unused reserved out tokens on true-up; never go negative. |
| `LLM_BUDGET_FAIL_OPEN` | 0 | 0 = block on budget check error; 1 = allow (best-effort). |

### Strictness: Postgres vs SQLite
- **Postgres:** One atomic UPDATE with guards; only one concurrent reservation can succeed when at the cap. Strict enforcement.
- **SQLite:** Read-then-update in a transaction; under concurrency, multiple workers can pass the check before any update. Limits may be slightly exceeded (best-effort). Behavior from the caller’s perspective (allowed vs blocked, task result) is the same; only strictness of the cap differs.
