# Runway program — final report (agent batch)

**Also at repo root:** `docs/RUNWAY_PROGRAM_FINAL_REPORT.md` (same program; use either path).

**Date:** 2026-04-19 (workspace clock)  
**Execution:** Implemented in a **single coordinated pass** in the main workspace agent (no separate Cursor subagent processes were spawned — avoids merge conflicts and duplicate Prisma/runtime assumptions).

---

## Summary

| Backlog ID | Status | Notes |
|------------|--------|--------|
| **P0-A** MI orchestra trace | **Done** | `handleOrchestraStart`: `getOrCreateCardbeyTraceId`, `res.setHeader(CARDBEY_TRACE_HEADER)`, `cardbeyTraceId` on `createBuildStoreJob` and `runBuildStoreJob` options (`miRoutes.js`). |
| **P0-B** Mission metadata trace | **Done** | `executeStoreMissionPipelineRun`: merges `cardbeyTraceId` into `MissionPipeline.metadataJson` when transitioning to `executing` (shallow merge with prior metadata + orchestration dual-write slice). |
| **P0-C** Tests | **Done** | `src/routes/__tests__/missionsStoreRunTrace.test.js` — header echo + `body.cardbeyTraceId` passed to `executeStoreMissionPipelineRun` (mocked). |
| **P0-D** Docs | **Done** | `CONTRACT_V1.md` §4 updated to implemented state; `RUNWAY_INVENTORY.md` business/location drift row adjusted for Phase 1. |
| **P1-A** Optional `CARDBEY_VALIDATE_BUILD_STORE_V1` | **Not implemented** | Deferred: no env-gated validator to avoid production surprise; can add in a follow-up. |
| **P2** Phase 2b (orchestra draft via factory) | **Not implemented** | Epic: guest + template/OCR/AI/seed `baseInput` must remain behavior-identical; needs dedicated PR series per `RUNWAY_AGENT_BACKLOG.md`. |

---

## Test evidence

```text
npx vitest run src/routes/__tests__/missionsStoreRunTrace.test.js
# ✓ 2 tests passed (missions trace)
```

**Full suite (pre-merge):** `cd apps/core/cardbey-core && npm test` — **710 tests passed** (~99 files), including `performerIntakeV2Confirm` and `orchestra-job-contract` paths in the run.

---

## Drift checklist — `orchestratorTask.create` grep audit

`rg "orchestratorTask\.create" src` under `cardbey-core`:

| Location | Notes |
|----------|--------|
| `services/draftStore/orchestraBuildStore.js` | Only `entryPoint: 'build_store'` + `create` — **factory** |
| `routes/miRoutes.js` (~1090) | Non–`build_store` orchestra branch (`else` of `isBuildStoreGoal`); build-store path uses `createBuildStoreJob` |
| `routes/miRoutes.js` (~1517) | `LLM_ENTRY_POINT` (generate-copy) |
| Other (`campaignRoutes`, `threadsRoutes`, `chatScope`, `orchestratorRoutes`, `runPlannerReply`, e2e) | Not store-build |

**Conclusion:** Single-factory invariant holds — no duplicate `build_store` `create` outside `createBuildStoreJob`.

---

## Risks & behavior notes

1. **`metadataJson` update** — When `executeStoreMissionPipelineRun` runs, metadata is now merged from `prev ∪ orchestrationWrites.metadataJson ∪ { cardbeyTraceId? }`. If `dualWrite` is off but the mission already had metadata, the update may **rewrite** `metadataJson` with a shallow copy of the same content (plus trace). Downstream readers include `missionPipelineRunner` (`Object.assign(input, mission.metadataJson)`) and `missionPipelineResolver` (`parseJsonObject`); adding `cardbeyTraceId` is additive. Watch for code that relied on **reference stability** or “no metadata write” on this transition.
2. **Orchestra early errors** — `x-cardbey-trace-id` is set at the start of `handleOrchestraStart` before the `try`, so validation errors (e.g. missing `goal`) still return the header.
3. **Subagents** — Requested “agent team” distribution was **not** used as parallel Task workers; implementation was centralized. Future batches can split P2 subtasks across agents if desired.

---

## Drift checklist

- [x] P0 trace surfaces extended (orchestra + mission metadata + missions route test)
- [x] Grep audit: `orchestratorTask.create` — no stray `build_store` outside factory
- [ ] P2: R4 draft column still “MI-local” — factory unification pending

---

## Files touched (this batch)

- `src/routes/miRoutes.js`
- `src/lib/storeMission/executeStoreMissionPipelineRun.js`
- `src/routes/__tests__/missionsStoreRunTrace.test.js` (new)
- `docs/CONTRACT_V1.md`
- `docs/RUNWAY_INVENTORY.md`
- `docs/RUNWAY_AGENT_FINAL_REPORT.md` (this file)

---

_End of report._
