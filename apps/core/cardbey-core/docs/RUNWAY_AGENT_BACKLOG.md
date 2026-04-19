# Runway program — agent backlog & final report template

**Audience:** Cursor agents / engineers continuing the store-build runway unification.  
**Workspace:** `apps/core/cardbey-core` unless noted.  
**Rule:** Implement and verify in **local dev** first; see repo `.cursor/rules/staging-dev-first.mdc`.

---

## 1. Already delivered (do not redo)

| Track | Summary |
|--------|---------|
| Phase 0 | `RUNWAY_INVENTORY.md`, `CONTRACT_V1.md`, `validateContractV1.js`, golden JSON + `phase0Golden.contracts.test.js` |
| Phase 0.5 | `src/lib/trace/cardbeyTraceId.js`; `x-cardbey-trace-id` + `cardbeyTraceId` through Intake V2/confirm, `executeStoreMissionPipelineRun`, `createBuildStoreJob`, `runBuildStoreJob`; tests under `src/lib/trace/__tests__/`, `performerIntakeV2Confirm.test.js` |
| Phase 1 | `buildStoreInputV1.js` composer; `createBuildStoreJob` V1 fields + `requestExtras`; MI orchestra `request` merge; business + operator params; `phase1Compose.contracts.test.js` |
| Phase 2 (task only) | R4 uses `createBuildStoreJob({ skipDraft: true, requestExtras })` in `handleOrchestraStart`; draft still MI-local |
| Trace parity | `missionsRoutes.js` `POST /:missionId/run` + `performerIntakeRoutes.js` legacy store path |
| Test hygiene | Orchestra Prisma singleton + drain + global teardown; `agentPlanner.test.js` / `executeIntent.test.js` expectations |

---

## 2. Remaining work — execute in order

### P0 — Quick wins (single PR each)

| ID | Task | Files / area | Acceptance criteria |
|----|------|----------------|---------------------|
| **P0-A** | **MI orchestra trace** | `src/routes/miRoutes.js` `handleOrchestraStart` | On every orchestra/start response: `res.setHeader(CARDBEY_TRACE_HEADER, …)`; pass `cardbeyTraceId` into `createBuildStoreJob` (extend params if needed), `requestExtras`, and/or `runBuildStoreJob` options so logs correlate with Intake/missions. |
| **P0-B** | **Mission run metadata** | `src/lib/storeMission/executeStoreMissionPipelineRun.js` | When `body.cardbeyTraceId` is set, merge `cardbeyTraceId` into `MissionPipeline.metadataJson` on the `auditedPipelineUpdate` that moves mission to `executing` (preserve existing keys; no breaking shape for clients). |
| **P0-C** | **Tests for new surfaces** | `src/routes/__tests__/` or existing patterns | At least: supertest that `POST /api/missions/:id/run` returns `x-cardbey-trace-id` (mock `executeStoreMissionPipelineRun` if needed to avoid full pipeline). Optional: orchestra start trace header smoke. |
| **P0-D** | **Docs sync** | `docs/CONTRACT_V1.md` | Update “Phase 0.5 / Phase 1+” wording to reflect implemented trace + V1 embedding; keep `RUNWAY_INVENTORY.md` drift table accurate (e.g. business `location` — verify vs `business.js`). |

### P1 — Contract enforcement (optional flag)

| ID | Task | Files | Acceptance criteria |
|----|------|--------|---------------------|
| **P1-A** | **Dev/test validate task.request** | New helper or inline in `createBuildStoreJob` / one caller | If `process.env.CARDBEY_VALIDATE_BUILD_STORE_V1 === 'true'` (or `NODE_ENV=test` only), run `validateBuildStoreInputV1` on the V1-relevant slice of `task.request` after create; log warn or throw in test. Default **off** in production. |

### P2 — Phase 2b epic (multi-PR; do not ship as one giant diff)

**Goal:** R4 draft creation goes through the same factory as R1–R3/R5 **without** losing guest mode, template/OCR/AI/seed paths, or `baseInput` richness.

| Sub | Task | Notes |
|-----|------|--------|
| **P2-1** | Extend `createBuildStoreJob` (or add `createBuildStoreJobFromOrchestraDraft`) | Support `guestDraft: { guestSessionId }`, optional `draftMode`, and `draftInput` / merge patch after minimal create. |
| **P2-2** | Refactor `handleOrchestraStart` | Replace inline `createDraft` / `createDraftStoreForUser` with factory when `needDraft`; keep OPENAI / credit / classify order identical (add regression tests). |
| **P2-3** | Update `RUNWAY_INVENTORY.md` R4 row | Draft column should read `createBuildStoreJob` (or wrapper) once true. |

---

## 3. Verification commands (agents must run before claiming done)

From `apps/core/cardbey-core`:

```bash
node --check src/routes/miRoutes.js
node --check src/lib/storeMission/executeStoreMissionPipelineRun.js
npm test
```

For faster iteration:

```bash
npx vitest run src/lib/contracts/__tests__/ tests/orchestra-job-contract.test.js
```

Heavy integration:

```bash
npx vitest run tests/orchestra-job-auto-run.test.js
```

---

## 4. Final report template (fill in when backlog complete)

**Copy this section into the PR description or a comment when P0–P2 scope is finished.**

### Runway final report — _date / agent / PR_

**Latest consolidated report:** see **`RUNWAY_AGENT_FINAL_REPORT.md`** (2026-04-19 batch).

#### Summary (template — copy when doing a new batch)
- **P0-A MI orchestra trace:** [ ] Done — notes: ___  
- **P0-B Mission metadata trace:** [ ] Done — notes: ___  
- **P0-C Tests:** [ ] Done — notes: ___  
- **P0-D Docs:** [ ] Done — notes: ___  
- **P1-A Optional validator flag:** [ ] Done / [ ] Deferred — notes: ___  
- **P2 Phase 2b draft factory:** [ ] Done / [ ] Split across PRs: ___  

#### Test evidence
- `npm test`: [pass / fail — paste summary lines]  
- Extra suites run: ___  

#### Risks / follow-ups
- ___  

#### Drift checklist (from `RUNWAY_INVENTORY.md`)
- [ ] R1–R5 task + draft story still matches inventory  
- [ ] No new `orchestratorTask.create` for `build_store` outside `createBuildStoreJob` (grep)  

---

## 5. Grep helpers for agents

```bash
# Stray build_store task creation
rg "orchestratorTask\.create" apps/core/cardbey-core/src -g'*.js'

# Trace usage
rg "cardbeyTraceId|CARDBEY_TRACE_HEADER" apps/core/cardbey-core/src -g'*.js'
```

---

_End of backlog. After completing tasks, paste the filled “Final report template” (section 4) into the PR or team channel._
