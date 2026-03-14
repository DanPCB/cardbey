# Impact Report: LLM Provider Abstraction (Kimi K2.5 + LLM_GENERATE_COPY)

**Date:** 2026-03-01  
**Scope:** New LLM provider abstraction in `apps/core/cardbey-core`, Kimi provider, OrchestratorTask type `LLM_GENERATE_COPY`, LLM cache, admin health endpoint.

---

## (a) What could break current store creation workflow

1. **Store creation path unchanged**
   - **Risk:** Low. The new work is additive: a new `entryPoint` (`llm_generate_copy`), new provider module, cache table, and admin route. The existing flow is `orchestra/start` → `createBuildStoreJob` (entryPoint `build_store`) → `runBuildStoreJob` → `generateDraft` → draft `ready`. None of that is replaced or gated on LLM.

2. **If LLM task were in the critical path**
   - **Risk (mitigated by design):** Store readiness would depend on LLM. If we required `LLM_GENERATE_COPY` to complete before marking draft ready or job completed, then Kimi 429/5xx or `KIMI_DISABLED` would block store creation.
   - **Mitigation:** `LLM_GENERATE_COPY` is **non-blocking**. Store readiness is determined only by the `build_store` task and `DraftStore.status === 'ready'`. LLM tasks are best-effort; on failure we only mark the LLM task failed and write an AuditEvent. No change to `runBuildStoreJob`, `generateDraft`, or GET `/api/mi/orchestra/job/:jobId` for the main job.

3. **Kernel transitions and audit**
   - **Risk:** If we updated `OrchestratorTask.status` without going through `transitionOrchestratorTaskStatus`, we would bypass AuditEvent and break the doctrine.
   - **Mitigation:** All status changes for `LLM_GENERATE_COPY` tasks use `transitionOrchestratorTaskStatus` (queued→running→completed/failed). Every transition creates an AuditEvent.

4. **New Prisma model and migration**
   - **Risk:** Adding `LlmCache` and running migrations can fail or conflict on existing DBs.
   - **Mitigation:** New table only; no changes to existing models. Rollback = revert migration and code.

5. **Admin route and auth**
   - **Risk:** `/api/admin/llm/health` must be auth-protected; otherwise info leakage.
   - **Mitigation:** Use `requireAuth` + `requireAdmin` (existing middleware). No change to public or store-creation routes.

---

## (b) Why

- Store creation today depends only on `build_store` and draft generation. Introducing an optional LLM step that is not in that path and fails independently keeps that behavior.
- Status must stay behind the kernel so all changes are auditable and consistent with existing OrchestratorTask and DraftStore lifecycle.

---

## (c) Mitigation summary

| Area | Mitigation |
|------|------------|
| Store readiness | LLM_GENERATE_COPY is never a prerequisite for draft ready or job completed. |
| Status writes | Use only `transitionOrchestratorTaskStatus` for LLM task status; no direct `prisma.orchestratorTask.update` for status. |
| Kimi outages | `KIMI_DISABLED` kill switch; timeouts and retries for 429/5xx; on failure only the LLM task fails. |
| Admin health | `requireAuth` + `requireAdmin` on GET `/api/admin/llm/health`. |

---

## (d) Rollback plan

1. Revert commits that add: LLM provider, Kimi provider, LLM cache usage, `runLlmGenerateCopyJob`, admin LLM health route, and any wiring that enqueues `llm_generate_copy` tasks.
2. Optionally revert Prisma migration that adds `LlmCache` (or leave table unused).
3. No rollback of existing store creation or orchestra logic required; they are unchanged.

---

## Implementation checklist

- [x] Provider interface `generateText()` (and optional `health()`): `src/lib/llm/types.js`, `kimiProvider.ts` + `kimiProvider.js`.
- [x] Kimi provider: env (`KIMI_API_KEY`, `KIMI_BASE_URL`, `KIMI_DISABLED`), timeouts, retry on 429/5xx: `src/lib/llm/kimiProvider.ts`.
- [x] Kernel transitions for LLM task: every status change via `transitionOrchestratorTaskStatus` in `runLlmGenerateCopyJob.js` (AuditEvent on every change).
- [x] LLM cache table keyed by prompt hash: `LlmCache` in schema; `src/lib/llm/llmCache.js`; used in `runLlmGenerateCopyJob.js`.
- [x] OrchestratorTask `entryPoint: 'llm_generate_copy'`; runner runs in background via `setImmediate` (does not block store readiness).
- [x] GET `/api/admin/llm/health` (requireAuth + requireAdmin): `src/routes/adminRoutes.js`, mounted at `/api/admin`.
