# Runway program — final report (store build unification)

**Canonical copy (same content):** `apps/core/cardbey-core/docs/RUNWAY_AGENT_FINAL_REPORT.md`  
**Related:** `apps/core/cardbey-core/docs/RUNWAY_AGENT_BACKLOG.md`, `RUNWAY_INVENTORY.md`, `CONTRACT_V1.md` (under `cardbey-core/docs/`).

**Date:** 2026-04-19  
**Scope:** P0 backlog (trace + mission metadata + tests + docs). P1/P2 deferred (see below).

---

## Executive summary

| Backlog | Status | What was done |
|---------|--------|----------------|
| **P0-A** MI orchestra trace | **Done** | `handleOrchestraStart` sets `x-cardbey-trace-id`, passes `cardbeyTraceId` into `createBuildStoreJob` and `runBuildStoreJob` (`miRoutes.js`). |
| **P0-B** Mission metadata | **Done** | `executeStoreMissionPipelineRun` merges `cardbeyTraceId` into `MissionPipeline.metadataJson` when moving pipeline to `executing`. |
| **P0-C** Tests | **Done** | `apps/core/cardbey-core/src/routes/__tests__/missionsStoreRunTrace.test.js` (2 tests). |
| **P0-D** Docs | **Done** | `CONTRACT_V1.md` §4 (trace implemented); `RUNWAY_INVENTORY.md` drift note (business `location`). |
| **P1-A** Optional env validator | **Not done** | `CARDBEY_VALIDATE_BUILD_STORE_V1`-style flag not added (defer to avoid prod surprise). |
| **P2** Phase 2b orchestra draft → factory | **Not done** | Epic: R4 draft creation still MI-specific (guest + template/OCR/AI); needs its own PR series. |

---

## Prior phases (already shipped before this report)

- **Phase 0:** Runway inventory, `CONTRACT_V1`, golden fixtures, `validateContractV1`, golden tests.  
- **Phase 0.5:** `cardbeyTraceId` / `x-cardbey-trace-id` on Intake V2, confirm, pipeline, jobs.  
- **Phase 1:** `BuildStoreInputV1` embedding, `createBuildStoreJob` shape, orchestra request merge, business API + operator.  
- **Phase 2 (task only):** R4 uses `createBuildStoreJob({ skipDraft: true })` for `OrchestratorTask`; draft still created in MI handler.  
- **Trace parity:** `POST /api/missions/:id/run`, legacy performer intake store path.  
- **Test fixes:** Orchestra Prisma teardown; planner / `executeIntent` expectations.

---

## Test evidence (this batch)

```bash
cd apps/core/cardbey-core
npx vitest run src/routes/__tests__/missionsStoreRunTrace.test.js
# ✓ 2 tests (missions trace header + body.cardbeyTraceId)
```

### Pre-merge verification (full suite)

Full `npm test` in `apps/core/cardbey-core` was run before merge claim: **710 tests passed** (~99 files). That satisfies the backlog requirement to run the full suite, not only the new trace file. Watchlist items called out in review (`performerIntakeV2Confirm.test.js`, `orchestra-job-contract.test.js`) were included in that run.

---

## Drift checklist — `orchestratorTask.create` grep audit

Command: `rg "orchestratorTask\.create" apps/core/cardbey-core/src` (or equivalent).

| File | `entryPoint` / purpose | `build_store`? |
|------|-------------------------|----------------|
| `services/draftStore/orchestraBuildStore.js` | `build_store` via `createBuildStoreJob` | **Yes — canonical factory** |
| `routes/miRoutes.js` (~1090) | Non–build-store orchestra branch (`finalEntryPoint`, not `build_store`) | No |
| `routes/miRoutes.js` (~1517) | `LLM_ENTRY_POINT` (generate-copy) | No |
| `routes/campaignRoutes.js`, `routes/threadsRoutes.js`, `lib/chatScope.js`, `orchestrator/api/orchestratorRoutes.js`, `orchestrator/lib/runPlannerReply.js`, e2e | Other orchestrator flows | No |

**Conclusion:** No stray `build_store` task creation outside `createBuildStoreJob`. The only `entryPoint: 'build_store'` + `create` path in `src` is `orchestraBuildStore.js`. `miRoutes` uses `entryPoint: 'build_store'` only in `orchestratorTask.count` (guest limit), not in `create`.

---

## Risks & notes

1. **`metadataJson`** — Transition to `executing` may rewrite `metadataJson` as a shallow merge (previous + orchestration dual-write + `cardbeyTraceId`). Downstream: `missionPipelineRunner` does `Object.assign(input, mission.metadataJson)` (additive keys are usually safe); `missionPipelineResolver` parses metadata as JSON object. Risk remains if any code assumed **reference stability** or “no write” on this transition — review was shallow-merge to preserve prior keys.  
2. **Orchestra** — Header is set at the start of `handleOrchestraStart`, so error responses (e.g. missing `goal`) still include `x-cardbey-trace-id`.  
3. **Execution model** — Work was done in one implementation pass, not parallel Cursor subagents (avoids merge conflicts).

---

## Files touched (P0 batch)

- `apps/core/cardbey-core/src/routes/miRoutes.js`
- `apps/core/cardbey-core/src/lib/storeMission/executeStoreMissionPipelineRun.js`
- `apps/core/cardbey-core/src/routes/__tests__/missionsStoreRunTrace.test.js`
- `apps/core/cardbey-core/docs/CONTRACT_V1.md`
- `apps/core/cardbey-core/docs/RUNWAY_INVENTORY.md`
- `apps/core/cardbey-core/docs/RUNWAY_AGENT_FINAL_REPORT.md`
- `docs/RUNWAY_PROGRAM_FINAL_REPORT.md` (this file)

---

## Open follow-ups

- [x] Full `npm test` in `cardbey-core` (710 passed).  
- [x] Grep audit: `orchestratorTask.create` — no stray `build_store` outside factory (see table above).  
- [ ] P2b: unify orchestra **draft** creation with factory when safe (see `RUNWAY_AGENT_BACKLOG.md`).

---

_End of report._
