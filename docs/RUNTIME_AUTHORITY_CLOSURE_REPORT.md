# RUNTIME AUTHORITY CLOSURE REPORT

**Phase:** F — Runtime Authority Closure  
**Date:** 2026-06-12  
**Type:** Evidence-based audit (read-only; no code changes in this deliverable)  
**Prior baseline:** `docs/RUNTIME_KERNEL_PHASE_EXIT_AUDIT.md` (57/100, RED)

---

## Executive Summary

**Verdict: Performer is NOT the sole execution authority today.**

The Runtime Kernel **exists** and partial closure infrastructure is **landed** (Phase F guards, bypass telemetry, rollout flags A→E). However:

- All authority **block flags default OFF**
- Intake V2 **default path** is `dispatchTool()` direct (legacy bypass)
- `SkillRouter.route()` and `dispatchWithRuntime()` execute **without** `performerRuntime.execute()`
- Orchestra, MCP, UI hero PATCH, and publish APIs remain **parallel runways**
- Dual skill systems (JS `SkillExecutor` + TS `SkillRuntime`) are **not consolidated**
- Generated artifact authority is **not expanded** beyond hero
- Session recovery flags are **OFF**

Phase F is **IN PROGRESS — measurement + flag-gated guards only** (`docs/PHASE_F_LEGACY_BYPASS_CLOSURE_PLAN.md`).

---

## F.1 — Execution Entrypoint Inventory

Legend: **Bypass?** = Does this path reach tool/skill execution without `performerRuntime.execute()` when default flags apply?

| Entry Point | File | Runtime Path (default flags) | Mechanisms Used | Bypass? | Status |
|---|---|---|---|---|---|
| **Performer Intake V2** (direct tool) | `routes/performerIntakeV2Routes.js` | Cooperative gate → `dispatchWithRuntime` OR `skillRouter.route` OR `dispatchTool` | `dispatchWithRuntime`, `skillRouter.route` → `skillExecutor.execute`, `dispatchTool`, optionally `performerRuntime.execute` (flag B) | **YES** — default branch is `dispatchTool` L953–964 | Active primary |
| **Performer Intake V2** (store pipeline) | `performerIntakeV2Routes.js` | `executeStoreMissionPipelineRun` → `runMissionUntilBlocked` | `runMissionUntilBlocked` → `executeMissionAction` or `executeRuntimeAction` (flag C) | **YES** — orchestrator uses facade, not kernel entry | Active |
| **Performer Intake V1** | `routes/performerIntakeRoutes.js` | Direct `dispatchTool` L1925 | `dispatchTool` | **YES** | LEGACY_ONLY |
| **Orchestra start** | `routes/miRoutes.js` `POST /orchestra/start` | `createBuildStoreJob` / `runBuildStoreJob` — no runtime | None of the six | **YES** | Active; F1 guard telemetry only |
| **MCP tool dispatch** | `routes/mcpServerRoutes.js` | `executeMissionAction` (if facade flag) OR `dispatchTool` | `executeMissionAction`, `dispatchTool` | **YES** | F2 guard optional block |
| **Mission run / run-until-blocked** | `routes/missionsRoutes.js` | `runMissionUntilBlocked` | `executeMissionAction` / `executeRuntimeAction` | **YES** — no `performerRuntime.execute` wrapper | Active |
| **Mission run-next-step** | `missionsRoutes.js` L804 | `executeMissionAction({ run_pipeline_step })` | `executeMissionAction` | **YES** | Active |
| **Mission dispatch (agent chat)** | `missionsRoutes.js` L853 | Agent runners (planner/research) — no tool dispatch | N/A | Partial | Chat-only agents |
| **Plan decision (video approval)** | `missionsRoutes.js` L1515 | `handlePlanDecision` → `skillExecutor.resume` | `skillExecutor.resume` | **YES** | Active; ownership marked in ctx |
| **Mission respond (checkpoint)** | `missionsRoutes.js` | `runMissionUntilBlocked({ forceExecuting })` | Pipeline runner | **YES** | Active |
| **SkillRouter (any caller)** | `lib/skills/SkillRouter.js` L48 | `skillExecutor.execute` | `skillExecutor.execute` → `dispatchTool` per step | **YES** | Active |
| **SkillRuntime cooperative gate** | `lib/skill_runtime/dispatchWithRuntime.ts` | `runtimeRegistry.dispatch` → `SkillRuntime.start` | `runtimeRegistry.dispatch` → executors → `dispatchTool` | **YES** | Fallback when legacy no match |
| **Document ingestion vision** | `lib/vision/documentIngestionFromVision.js` | Direct `dispatchTool` loop | `dispatchTool` | **YES** | Active |
| **Vision intake** | `lib/vision/visionIntakeService.js` | `dispatchTool` ×3 | `dispatchTool` | **YES** | Active |
| **Document ingest routes** | `routes/performerIngestDocumentRoutes.js` | `dispatchTool` per step | `dispatchTool` | **YES** | Active |
| **Execution gateway** | `lib/intake/executionGateway.js` | Injected `dispatchTool` | `dispatchTool` | **YES** | Active |
| **Agent orchestrator** | `lib/agentPlanning/agentOrchestrator.js` | `executeMissionAction` | `executeMissionAction` | **YES** | Active |
| **Proactive step routes** | `routes/performerProactiveStepRoutes.js` | Legacy fallback OR kernel step | `executeProactiveRunwayStep` / kernel | **YES** when kernel OFF | F3 guard |
| **Maintenance intake** | `performerIntakeV2Routes.js` | `dispatchTool` (operator session) | `dispatchTool` | **YES** | Gated by secret |
| **Analyze store capability** | `executeAnalyzeStoreCapability.js` | Direct `dispatchTool` | `dispatchTool` | **YES** | Partial ownership mark |
| **Living document → video** | `toolExecutors/document/generate_living_document.js` | `skillRouter.route('generate_video')` | `skillExecutor` | **YES** | Active |
| **Dev orphan probe** | `routes/devBrokerRuntimeProofRoutes.js` | `dispatchTool` | `dispatchTool` | **YES** | Dev only |
| **Dashboard: Intake V2** | `useIntakeV2.ts` → `/api/performer/intake/v2` | Server paths above | Via server | Depends on flags | Primary console |
| **Dashboard: Intake V1** | `ConsoleCentreColumn.tsx` L819 | `/api/performer/intake` | Legacy | **YES** | OCR path only |
| **Dashboard: Orchestra start** | `quickStart.ts`, `useOrchestraJob.ts`, `missionOrchestra.ts`, `FeaturesPage.tsx` | `POST /api/mi/orchestra/start` | Bypasses intake | **YES** | Active |
| **Dashboard: Hero PATCH** | `heroMediaPersist.ts`, `useHeroUpdate.ts`, `StoreDraftReview.tsx` | `PATCH /stores/:id/draft/hero` | Direct API mutation | **YES** — not execution, state write | Active |
| **Dashboard: Publish store** | `api/storeDraft.ts` | `POST /api/store/publish` | Direct publish service | **YES** — state write | Active |
| **Dashboard: Signage** | Via intake tool `signage.publish-to-devices` | Intake → server paths | Tool dispatch chain | Depends on intake branch | Partial |
| **Dashboard: Content Studio upload** | `uploadVideo.ts`, `uploadImage.ts` | Media upload APIs | Direct storage | **YES** — asset write | Active |
| **Dashboard: Phase F viewer gate** | `phaseFBypassRuntime.ts` | Client early-return on capability plan | UI-only | Partial | Flag `VITE_PHASE_F_VIEWER_ONLY_CAPABILITY_PLAN` |
| **Runtime session APIs** | `routes/runtimeSessionRoutes.js` | Rehydration / resume (no execution) | Session service | N/A | 503 when flags OFF |
| **Broker authority API** | `GET /api/broker/runtime-authority` | Read-only metrics | N/A | N/A | Telemetry |
| **Phase F bypass API** | `GET /api/broker/phase-f-bypass` | Read-only metrics | N/A | N/A | Telemetry |

### Dispatch chain when `PERFORMER_RUNTIME_ENABLED=false` (production default)

```
Intake V2 direct tool:
  dispatchWithRuntime?  (only if legacy SkillRegistry miss)
  → skillRouter.route?  (if trigger match) → skillExecutor → dispatchTool
  → dispatchTool        (default fallback) ← BYPASS
```

### Dispatch chain when `PERFORMER_RUNTIME_ENABLED=true` (Stage B)

```
Intake V2 direct tool (after skill miss):
  performerRuntime.execute()
    → executeRuntimeAction()
      → executeMissionAction()
        → dispatchTool()   ← still reaches dispatcher; ownership marked
```

**Note:** Even Stage B routes through `executeMissionAction`, not a hard block on other gateways. SkillRouter still bypasses `performerRuntime.execute()`.

---

## F.2 — Single Execution Authority

**Target:** `performerRuntime.execute()` as the only legal execution gateway.

### Current state vs requirements

| # | Requirement | Current | Gap |
|---|---|---|---|
| 1 | All `dispatchTool()` via `performerRuntime.execute()` | `dispatchTool` called from 15+ sites directly | No central interceptor |
| 2 | All `executeMissionAction()` via `performerRuntime.execute()` | `executeMissionAction` called from missions, MCP, orchestrator **without** runtime wrapper | Facade is parallel entry, not child-only |
| 3 | All `runtimeRegistry.dispatch()` via runtime | `dispatchWithRuntime` calls registry directly from intake | Bypasses `performerRuntime.execute()` |
| 4 | Orchestra via runtime | `miRoutes.js` → `orchestraBuildStore.js` — no runtime | F1 telemetry + optional block with missionId |
| 5 | Future APIs via runtime | Documented intent only | No compile-time or runtime enforcement |

### Existing enforcement (partial)

| Mechanism | File | Effect today |
|---|---|---|
| `guardBrokerDirectAction()` | `broker/brokerRunwayGuard.js` | Blocks when `BROKER_BLOCK_DIRECT_ACTION=true` |
| `assertRuntimeOwnership()` | `runtime/performerRuntime/runtimeOwnership.js` | Warn or block orphan dispatch when `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true` |
| `guardPhaseFOrchestraStart` | `broker/phaseFBypassGuards.js` | Telemetry + broker block when mission-bound |
| `guardPhaseFMcpDispatch` | `phaseFBypassGuards.js` | Optional MCP block / facade hint |
| `recordRuntimeBypass()` | `runtimeAuthorityStaging.js` | Metrics + health probe `broker.runtime.bypass` |

### Required work (not done)

1. **Hard gateway:** `dispatchTool` must assert `ctx.performerRuntimeOwned === true` in production (fail closed).
2. **SkillRouter shim:** `skillRouter.route()` must delegate to `performerRuntime.execute({ actionType: 'run_skill', ... })` or mark ownership before `skillExecutor.execute`.
3. **Orchestra facade:** `POST /api/mi/orchestra/start` must create IntentRequest + pipeline, not parallel `OrchestratorTask` lifecycle.
4. **Remove `skipDirectGuard: true`** on intake runtime path (`performerIntakeV2Routes.js` L921).

---

## F.3 — Bypass Detection

### What exists

- `recordRuntimeBypass(kind, details)` → increments metrics, emits `broker.runtime.bypass` health probe
- `incrementRuntimeAuthorityMetric()` counters: `bypassDirectDispatch`, `bypassFacade`, `bypassRuntimeKernel`, `orphanWarnings`, `ownershipBlocks`
- `GET /api/broker/runtime-authority` and `GET /api/broker/phase-f-bypass`
- `scripts/phase-f-bypass-audit.mjs` — baseline snapshot script
- `detectExecutionDuplication()` — 15s window duplicate tool warning

### What F.3 requires but does NOT exist

| Requirement | Status |
|---|---|
| Event name `RUNTIME_AUTHORITY_BYPASS` | **Missing** — uses `broker.runtime.bypass` probe instead |
| Stack trace capture | **Missing** |
| Fail loudly in development | **Partial** — `BROKER_TELEMETRY_REQUIRED` only; no dev throw on bypass |
| Structured fields: source, route, userId, missionId, executionPath, file, caller | **Partial** — ad hoc in `recordRuntimeBypass` details |

---

## F.4 — Dual Skill System Consolidation

### Architecture

| System | Location | Execution model | Checkpoints | Ownership |
|---|---|---|---|---|
| **JS SkillExecutor** | `lib/skills/SkillExecutor.js` | Multi-step, plan approval pause, blackboard snapshots | Plan approval (`awaiting_plan_approval`), resume | Marks `runtimeOwned` in intake ctx |
| **TS SkillRuntime** | `lib/skill_runtime/` | Single registry, confidence patterns, checkpoint via `getCheckpoint()` | No plan approval; different checkpoint shape | Sets `runtimeOwned` in `dispatchWithRuntime` metadata only |

### Intake resolution order (`performerIntakeV2Routes.js`)

1. If `skillRegistry.findByTrigger(intent)` → **JS SkillRouter wins** (side-effect execute)
2. Else if runtime pattern match → **TS SkillRuntime**
3. Else → tool dispatch chain

### Capability overlap matrix

| Capability | JS Skill (`lib/skills/definitions/`) | TS Skill (`skill_runtime/`) | Canonical Owner (today) | Notes |
|---|---|---|---|---|
| **Video generation** | `VideoGenerationSkill.js` — plan → approve → execute → audio | `videoGenerationSteps()` — brief → script → queue only | **JS SkillExecutor** | Legacy trigger match prevents TS path; TS lacks approval + audio steps |
| **Campaign generation** | `CampaignSkill.js` — 6-step package | `createPromotionSteps()` — stub only | **JS SkillExecutor** | TS explicitly defers to legacy |
| **Promotion / create_promotion** | Triggers on `CampaignSkill` | `PROMOTION_INTENT` stub | **JS SkillExecutor** | TS records `pending_campaign_executor` |
| **Loyalty program** | `LoyaltyCampaignSkill.js` | `loyaltyCampaignSteps()` — real executors | **JS** (when triggered) / **TS** (novel phrases) | Split by trigger match |
| **Booking management** | `BookingManagementSkill.js` | `bookingManagementSteps()` | Split | Same pattern |
| **Store health** | `StoreHealthSkill.js` | `storeHealthSteps()` | Split | Same pattern |
| **Analytics report** | `AnalyticsReportSkill.js` | `analyticsReportSteps()` | Split | Same pattern |
| **Document ingestion** | `DocumentIngestionSkill.js` | None | **JS only** | |
| **Vision intake** | `VisionIntakeSkill.js` | None | **JS only** | |

### Consolidation requirements (not implemented)

- One registry: **Not met** — two registries (`SkillRegistry.js` vs `runtimeRegistry.ts`)
- One execution model: **Not met**
- One checkpoint model: **Not met** — plan approval only on JS path
- One ownership path: **Partial** — both can set ownership flags inconsistently

**Recommended adapter (no rewrite):** TS `SkillRuntime` becomes a **pattern router only**; on match, delegate to JS `SkillExecutor` via thin adapter. Deprecate TS executor factories for overlapping intents.

---

## F.5 — Artifact Authority Expansion

### Current authority model

| Asset type | `artifactContract.js` | Persisted record | missionId lineage | Lifecycle enforced |
|---|---|---|---|---|
| Hero image/video | Yes | Draft preview + publish snapshot | Partial | **Yes** — canonical hero pipeline |
| Generated video | Yes (SSE) | `/uploads/media` URL in step output | Optional in artifact | **No** |
| Generated slideshow | Yes (SSE) | SSE artifact only | Optional | **No** |
| Campaign package | Yes (in-memory) | `package_campaign_artifact` UUID in outputsJson | storeId only | **No** |
| Generated graphics | Partial | Search results in step output | No | **No** |

### F.5 requirements vs reality

Required fields (`artifactId`, `missionId`, `owner`, `status`, `createdAt`, `source`) are defined in `OperationalArtifact` type but **not persisted to DB** for generated assets.

Required lifecycle `requested → processing → ready → failed → published`:

- Implemented in `artifactContract.js` helpers (`artifactProcessing`, `artifactReady`, etc.)
- **Not wired** to durable storage or publish transition for video/slideshow/campaign

**No second artifact system exists** — correct foundation, but authority enforcement stops at hero.

---

## F.6 — Surface Write Elimination

**Principle:** Surfaces display state; Runtime changes state.

### Verified violations

| Surface | Violation | File | Current path | Required path |
|---|---|---|---|---|
| Hero media picker | Direct `PATCH /stores/:id/draft/hero` | `heroMediaPersist.ts`, `StoreDraftReview.tsx`, `useHeroUpdate.ts` | UI → API | UI → Intake → Runtime → hero tool |
| Homepage Quick Start | `POST /api/mi/orchestra/start` | `quickStart.ts`, `FeaturesPage.tsx` | UI → Orchestra | UI → Intake V2 → Runtime → pipeline |
| Mission Console launcher | Orchestra start | `NextMissionLauncher.tsx`, `missionOrchestra.ts` | UI → Orchestra | UI → Intake / mission pipeline |
| Draft review publish | `POST /api/store/publish` | `api/storeDraft.ts`, `StoreDraftReview.tsx` | UI → publish service | UI → governed mission confirm → runtime |
| Content Studio | Direct media upload | `uploadVideo.ts`, `uploadImage.ts` | UI → storage API | UI → runtime asset tool (or governed upload) |
| Performer console | `autoSubmit: true` handoffs | `ConsoleCentreColumn.tsx`, `submitPerformerIntent.ts` | Skips confirmation | Governance checkpoint before execution |
| Client capability plan loop | `executeCapabilityPlan` | Dashboard performer modules | Frontend step loop | Viewer-only; backend `run-until-blocked` |
| Explore handoff | `openProactiveIntelligenceIntent` | Partially governed | Mixed | All via intake with `autoSubmit: false` |

### Compliant paths (examples)

- Performer Intake V2 chat → server dispatch chain (ownership varies)
- Plan approval UI → `POST /api/missions/:id/plan-decision` → `skillExecutor.resume`
- Checkpoint respond → `POST /api/missions/:id/respond` → `runMissionUntilBlocked`

---

## F.7 — Session Authority

### Built capabilities

| Capability | Service | Route | Flag | Default |
|---|---|---|---|---|
| Session rehydration | `runtimeSessionService.js` | `GET /api/runtime/session/active` | `ENABLE_RUNTIME_SESSION_REHYDRATION` | **OFF** |
| Mission resume | `runtimeSessionService.js` | `POST /api/runtime/session/resume-mission` | `ENABLE_RUNTIME_MISSION_RESUME` | **OFF** |
| Store recovery | `runtimeSessionService.js` | `POST /api/runtime/session/select-store` | `ENABLE_RUNTIME_STORE_FALLBACK` | **OFF** |
| Checkpoint hydration | `runtimeSessionCheckpointHydration.ts` (dashboard) | Client-side | Depends on session API | Partial |

### Gap

Browser refresh can re-enter via **Orchestra**, **direct hero PATCH**, or **legacy intake** — all bypass runtime session reattachment. Session APIs return **503** when flags OFF (`runtimeSessionRoutes.js`).

**F.7 not satisfied.**

---

## F.8 — Enforcement Flags Audit

| Flag | Current Default | Safe For Production? | Notes |
|---|---|---|---|
| `PERFORMER_RUNTIME_ENABLED` | **false** | **Yes** to enable after soak | Stage B — routes intake through `performerRuntime.execute()` |
| `BROKER_DIRECT_VIA_FACADE` | **false** | **Yes** as Stage A interim | Still bypasses runtime entry; marks telemetry only |
| `BROKER_BLOCK_DIRECT_ACTION` | **false** | **Yes** after Stage A–B validated | Stage D — blocks legacy intake direct |
| `PERFORMER_RUNTIME_PIPELINE_FACADE` | **false** | **Yes** after pipeline E2E | Stage C — orchestrator uses `executeRuntimeAction` |
| `PERFORMER_RUNTIME_OWNERSHIP_BLOCK` | **false** | **Yes** after orphan baseline clean | Stage E — hard block orphan `dispatchTool` |
| `ENABLE_PERFORMER_RUNTIME_KERNEL` | **false** | **Yes** after proactive soak | Kernel step authority for proactive runway |
| `ENABLE_RUNTIME_STEP_EXECUTION` | **false** | **Yes** with kernel | Required before blocking proactive legacy |
| `ENABLE_RUNTIME_SESSION_REHYDRATION` | **false** | **Yes** after UI hydration tested | F.7 dependency |
| `ENABLE_RUNTIME_MISSION_RESUME` | **false** | **Yes** with rehydration | Pairs with session API |
| `ENABLE_RUNTIME_STORE_FALLBACK` | **false** | Caution — test store binding | Prevents orphan store context |
| `PHASE_F_BYPASS_TELEMETRY` | **true** | **Yes** | Measurement mode — keep ON |
| `PHASE_F_BLOCK_MCP_DIRECT_DISPATCH` | **false** | **Yes** after MCP facade tested | F2 MCP closure |
| `PHASE_F_BLOCK_DRAFT_STORE_RUNWAY` | **false** | **Yes** after mission-bound draft flows | F4 draft closure |
| `PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY` | **false** | **Yes** after kernel step ON | F3 proactive closure |
| `BROKER_BLOCK_ORCHESTRA_WITH_MISSION` | **false** | **Yes** after intake migration | F1 orchestra closure |
| `VITE_PHASE_F_VIEWER_ONLY_CAPABILITY_PLAN` | **false** | **Yes** for UI loop removal | Frontend F5 |

### Recommended production rollout sequence

```
1. PHASE_F_BYPASS_TELEMETRY=true          (already default)
2. BROKER_DIRECT_VIA_FACADE=true          (Stage A — measure)
3. PERFORMER_RUNTIME_ENABLED=true         (Stage B — intake runtime entry)
4. PERFORMER_RUNTIME_PIPELINE_FACADE=true (Stage C)
5. BROKER_BLOCK_DIRECT_ACTION=true        (Stage D)
6. PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true (Stage E)
7. ENABLE_RUNTIME_SESSION_REHYDRATION + ENABLE_RUNTIME_MISSION_RESUME
8. PHASE_F_* block flags (one per deploy)
9. BROKER_BLOCK_ORCHESTRA_WITH_MISSION + retire orchestra UI paths
```

**Do not enable Step 6 before Steps 2–5 soak clean** (`RUNTIME_OWNERSHIP_GAP_MAP.md`).

---

## F.9 — Runtime Authority Gauntlet

### Existing test / audit infrastructure

| Asset | Location | Covers |
|---|---|---|
| `runtimeAuthorityStaging.test.js` | Core unit tests | Metrics, bypass recording |
| `phaseFBypassGuards.test.js` | Core unit tests | F1–F4 guard behavior when flags ON |
| `phase-f-bypass-audit.mjs` | Script | Snapshot `/api/broker/phase-f-bypass` |
| `skill_runtime/__tests__/phase*.test.ts` | Cooperative gate tests | TS runtime routing |
| `missionsRespondPostMissionSummaryOrder.test.js` | Mission respond order | Checkpoint resume |
| `runtimeSessionRehydration.test.js` | Session tests | Rehydration when enabled |
| `fresh-deploy-gauntlet.mjs` | Deploy script | Infra smoke, not authority |

### Required gauntlet (NOT implemented as unified suite)

| # | Scenario | Execution traverses `performerRuntime.execute()`? | FSM verified? | Artifact authority? | Resume? | PASS today? |
|---|---|---|---|---|---|---|
| 1 | Create store | **NO** (orchestra or pipeline bypass) | Partial | Partial | Partial | **FAIL** |
| 2 | Create video | **NO** (skillRouter bypass) | N/A skill FSM | Orphan URL | Plan approval only | **FAIL** |
| 3 | Launch campaign | **NO** | Partial | In-memory package | Partial | **FAIL** |
| 4 | Generate slideshow | **NO** | N/A | SSE only | No | **FAIL** |
| 5 | Publish campaign | **NO** (direct publish API) | N/A | N/A | N/A | **FAIL** |
| 6 | Device publish | Depends on intake branch | Partial | N/A | No | **FAIL** |
| 7 | Resume mission | **NO** | Yes DB | N/A | API 503 flags OFF | **FAIL** |
| 8 | Approval checkpoint | **NO** (skillExecutor.resume direct) | Yes | Plan only | Yes | **PARTIAL** |
| 9 | Browser refresh recovery | **NO** | DB persists | Client state loss | 503 | **FAIL** |

**Gauntlet pass rate: 0/9 full PASS, 1/9 PARTIAL**

---

## F.10 — Exit Report Scores

### Removed bypasses (landed 2026-06-05)

| Bypass | Closure mechanism | Blocking default |
|---|---|---|
| Orchestra + missionId | `guardPhaseFOrchestraStart` + `BROKER_BLOCK_ORCHESTRA_WITH_MISSION` | OFF |
| MCP direct dispatch | `guardPhaseFMcpDispatch` + facade route option | OFF |
| Proactive step legacy | `guardPhaseFProactiveStepLegacy` | OFF |
| Draft-store without mission | `guardPhaseFDraftStoreRunway` | OFF |
| Client capability plan loop | `phaseFBypassRuntime.ts` viewer gate | OFF |
| Intake V2 direct (Stage D) | `guardBrokerDirectAction` when enabled | OFF |

### Remaining bypasses (critical)

1. Intake V2 → `dispatchTool` default path
2. `skillRouter.route()` → `skillExecutor.execute()` without runtime wrapper
3. `dispatchWithRuntime()` without runtime wrapper
4. `POST /api/mi/orchestra/start` (no missionId)
5. MCP dispatch (flags OFF)
6. Mission pipeline → `executeMissionAction` without runtime wrapper
7. Vision/document ingestion direct `dispatchTool`
8. UI hero PATCH, publish, orchestra, content upload
9. Agent chat dispatch (parallel, no tool governance)
10. Maintenance operator `dispatchTool`

### Score table

| Dimension | Before Phase F | After Phase F (current) | Target (closure complete) |
|---|---:|---:|---:|
| **Overall runtime score** | 57 | **58** | 85+ |
| **Single Runway** | 52 | **54** | 90+ |
| **Artifact Authority** | 53 | **53** | 80+ |
| **Session Recovery** | 54 | **54** | 85+ |
| **Production readiness** | 45 | **46** | 80+ |

*Current +1 reflects landed telemetry/guards; no production-default enforcement shift.*

---

## Final Verdict

### Can Performer be considered the sole execution authority?

## **NO**

### Evidence

1. **Default intake path** records `recordRuntimeBypass('legacy_intake')` and calls `dispatchTool` directly (`performerIntakeV2Routes.js:953-964`).
2. **`skillRouter.route()` executes skills without `performerRuntime.execute()`** even when runtime flag is ON (skill path runs before tool fallback, L859-905).
3. **All authority block flags default OFF** — enforcement is opt-in (`runtimeFlags.js`, `brokerFlags.js`, `phaseFBypassFlags.js`).
4. **Orchestra remains a parallel runway** for homepage, mission console, and quick start (`miRoutes.js`, dashboard clients).
5. **UI surfaces mutate state directly** (hero, publish, uploads) violating the three-layer contract.
6. **Dual skill systems** create inconsistent checkpoint and ownership behavior for the same intents.
7. **Generated artifacts lack durable authority** — only hero has canonical enforcement.
8. **Session recovery disabled** — refresh does not reattach to runtime authority.
9. **Phase F prerequisite gate not met** — Phase E staging soak not production-default (`PHASE_F_LEGACY_BYPASS_CLOSURE_PLAN.md`).
10. **Runtime Authority Gauntlet: 0/9 PASS.**

### What must be true to answer YES

- [ ] `PERFORMER_RUNTIME_ENABLED` + `PERFORMER_RUNTIME_OWNERSHIP_BLOCK` production-default
- [ ] All `dispatchTool` calls require `performerRuntimeOwned` context (fail closed)
- [ ] `skillRouter` and `dispatchWithRuntime` delegate through `performerRuntime.execute()`
- [ ] Orchestra UI retired or facaded through intake + pipeline
- [ ] UI write paths (hero, publish, upload) routed through governed runtime tools
- [ ] Dual skill registry consolidated via adapter
- [ ] Generated artifact persist + lifecycle via `artifactContract`
- [ ] Session rehydration + mission resume enabled and validated
- [ ] Runtime Authority Gauntlet 9/9 PASS with flags at production defaults

---

## Appendix — Key Files

| Area | Path |
|---|---|
| Runtime entry | `src/lib/runtime/performerRuntime/performerRuntime.js` |
| Runtime action | `src/lib/runtime/performerRuntime/executeRuntimeAction.js` |
| Execution facade | `src/lib/execution/executeMissionAction.js` |
| Tool dispatch | `src/lib/toolDispatcher.js` |
| Intake V2 dispatch | `src/routes/performerIntakeV2Routes.js` |
| Phase F guards | `src/lib/broker/phaseFBypassGuards.js` |
| Bypass telemetry | `src/lib/runtime/performerRuntime/runtimeAuthorityStaging.js` |
| Ownership assert | `src/lib/runtime/performerRuntime/runtimeOwnership.js` |
| Mission FSM | `src/lib/missionPipelineTransitions.js` |
| JS skills | `src/lib/skills/SkillExecutor.js`, `SkillRouter.js` |
| TS skills | `src/lib/skill_runtime/runtimeRegistry.ts`, `dispatchWithRuntime.ts` |
| Artifact contract | `src/lib/artifacts/artifactContract.js` |
| Ownership gap map | `docs/RUNTIME_OWNERSHIP_GAP_MAP.md` |
| Phase F plan | `docs/PHASE_F_LEGACY_BYPASS_CLOSURE_PLAN.md` |
| Prior audit | `docs/RUNTIME_KERNEL_PHASE_EXIT_AUDIT.md` |
| Bypass audit script | `scripts/phase-f-bypass-audit.mjs` |

---

*Read-only audit. No runtime behavior was modified. Re-run after each closure deploy with `node scripts/phase-f-bypass-audit.mjs` and gauntlet PASS criteria.*
