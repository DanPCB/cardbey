# ARCHITECTURE AUDIT REPORT

## Date: 2026-07-08
## Scope: Cardbey Performer vs. Clean Target Architecture (“ONE of each layer”)
## Method: Filesystem + import/call-site verification (not existence = used)

---

## Verdict (one line)

The system currently has **~4 active intake entry surfaces**, **≥3 classifiers**, **≥5 planners**, **≥5 executors**, and **dozens of storage writers**. The clean target is **1 of each**. The loyalty-card test path **bypasses Intake V2 / IntentReasoner entirely**.

**Update (2026-07-11):** P0 governance patch — `multi_agent` and `campaign_orchestration` orchestration missions now require explicit confirmation (`MULTI_AGENT_REQUIRE_CONFIRMATION`, default `true`) before `AgentCoordinator` AUTO_RUN. See `apps/core/cardbey-core/docs/multiAgent/GOVERNANCE.md`.

---

## 1. Layer Inventory

| Layer | Current files (active unless noted) | Expected | Gap |
|-------|-------------------------------------|----------|-----|
| **Intake** | `routes/performerIntakeV2Routes.js` (canonical POST `/api/performer/intake/v2`); `routes/performerIntakeRoutes.js` (V1 shim → V2); `routes/performerRuntimeRoutes.js` (`/ui-action`, factory, capabilities); `routes/missionsRoutes.js` (plan/run/dispatch/topology); `routes/performerProactiveStepRoutes.js`; `routes/agentMessagesRoutes.js` | ONE (`intake/index.js`) | **No `src/lib/intake/index.js`.** Intake V2 route is a ~6.5k-line god handler (~120 imports), not a thin layer module. Multiple sibling HTTP entry points still accept user/tool intent. |
| **Classifier** | `lib/intent/intentReasoner.js` + `intentIntegration.js` (+ optional `llmReasonerIntegration.js`); `lib/intake/intakeSystemShortcuts.js` `detectIntent`; `lib/intake/storeWebsiteRunwayClassifier.js`; asset/upload detectors in `assetUploadGuard.js` / `assetIntentIngestService.js`; `lib/agentIntentRouter.js` (agent-messages / orchestrator chat) | ONE (`IntentReasoner`) | Multiple pre-classify / parallel classifiers still run before or beside IntentReasoner. Decision-loop `decideTurn.js` is **already deleted**, but orphan type-refs remain. |
| **Planner** | `lib/agents/compileWithMultiAgent.js` (target); `lib/planner/plannerIntegration.js` + `planner.js`; `lib/intake/reactPlanner.js`; `lib/agentPlanner.js` `planMissionFromIntent`; `services/react/missionPlanner.ts`; checkpoint materializers (`createStoreCheckpointDispatch`, `createCampaignCheckpointDispatch`); skill `SkillExecutor` / planApproval | ONE (`compileWithMultiAgent`) | Multi-agent compiler exists but is **feature-flagged off by default** (`USE_COMPILER_FOR_CAMPAIGNS` / `USE_COMPILER_FOR_STORES` default **false**). Default campaign path still uses checkpoint pipeline. |
| **Executor** | `lib/mission/topologyExecutor.js` (target DAG); `lib/missionPipelineRunner.js` `runNextMissionPipelineStep`; `lib/execution/missionExecutionEngine.js` `executeMission`; `lib/execution/executeMissionAction.js`; `lib/runtime/performerRuntimeKernel.js` `executeMissionStep`; `lib/toolDispatcher.js`; `lib/orchestration/agentCoordinator.js` (also used as **planner** via `decomposeGoal`); skill_runtime / factory / blueprint runners | ONE (`topologyExecutor`) | Topology executor is live for approve-topology flows; most production work still runs through pipeline runner / executeMission / kernel / toolDispatcher. |
| **Store** | `lib/persistence/metadataWriter.js` `writeMetadata` (target for compiler/topology); direct `prisma.missionPipeline.update` in **30+** modules; `lib/missionBlackboard.js` append-only events; `outputsJson` merges in multiple places | ONE (`writeMetadata` → `metadataJson`) | `writeMetadata` is used mainly by topology/compiler path. Parallel writes to `metadataJson` / `outputsJson` / blackboard remain the normal path for intake + pipelines. |
| **Topology templates** | Runtime-compiled `TopologyArtifact` (`lib/artifact/types.ts`, version on artifact); static blueprints `lib/execution/blueprints/store.v1.json`, `launch_campaign.v1.json` via `blueprintLoader.js` | ONE format (`topology.v1`) per mission type | **Two formats:** dynamic topology artifacts **and** declarative workflow blueprints. No static `*.topology.json` template set; topologies are generated at compile time. |

---

## 2. Dead Code to Delete (high confidence)

| Item | Evidence |
|------|----------|
| `routes/_deprecated/performerIntakeRoutes.v1.legacy.js` | Archived; V1 route only forwards to V2. Safe to remove after confirming no scripts import it. |
| `lib/decision/decideTurn.js` | **Already missing.** Orphan JSDoc imports of `./decideTurn.js` in `earlyDecisionLoopGate.js`, `responseBuilder.js`, `turnResultToClassification.js`, `governanceEnforcer.js` — clean up types or delete unused modules. |
| `lib/decision/turnResultToClassification.js`, `governanceEnforcer.js` (and possibly more decision-loop authority remnants) | Typed against deleted `decideTurn`; decision loop flag hard-coded `false` in `config/features.js`. Verify call graph; shadow advisors may still be used — delete only pure authority leftovers. |
| Dashboard dual clients if unused | Confirm whether client `unifiedDispatch` still shadows backend for some UI paths; deprecate client-side execution pipelines where backend is authoritative. |

**Not dead (do not delete without migration):** `unifiedDispatch`, `AgentCoordinator`, `missionPipelineRunner`, `reactPlanner`, checkpoint dispatchers — all have live call sites.

---

## 3. Redundant Code to Consolidate

| Concern | Duplicates |
|---------|------------|
| Intent classification | `IntentReasoner` vs shortcut `detectIntent` vs runway classifiers vs asset-ingest classifiers vs `agentIntentRouter.classifyIntent` |
| Planning | `compileWithMultiAgent` vs `PlannerIntegration` vs `reactPlanner` vs `planMissionFromIntent` vs ReAct `planMission` vs skill plan artifacts vs blueprint materialization |
| Execution facade | `unifiedDispatch` → `executeMission` → `executeMissionStep` / `executeMissionAction` / checkpoint runners / `topologyExecutor` / raw `dispatchTool` |
| Persistence | `writeMetadata` vs ad-hoc `prisma.missionPipeline.update` vs blackboard vs `outputsJson` authority helpers |
| Templates | `TopologyArtifact` (compiler) vs `workflowBlueprint` JSON (`store.v1`, `launch_campaign.v1`) |
| Loyalty setup | Chat path (`Intake V2` → reasoner → skill/tool) vs scan path (`/orchestrator/loyalty-from-card` → `/performer/runtime/ui-action` → `executeSetupLoyaltyProgramRuntimeTool`) |

---

## 4. Parallel Paths Found

### Path A — Canonical chat intake (active default)
`POST /api/performer/intake` **or** `/api/performer/intake/v2`
→ `performerIntakeV2Routes` (shortcuts, upload phases, asset guards, belief shadow…)
→ `IntentIntegration` / `IntentReasoner` (+ optional LLM reasoner)
→ optional `reactPlanner` / `PlannerIntegration`
→ `unifiedDispatch` / `intakeKernelToolDispatch` / skill_runtime
→ usually `executeMission` / checkpoint / `executeRuntimeAction` / `dispatchTool`
→ `prisma.missionPipeline` + blackboard (not solely `writeMetadata`)

### Path B — Deprecated V1 URL (active shim)
`POST /api/performer/intake` → deprecation headers → **same Path A** (`performerIntakeV2Routes`).

### Path C — Loyalty card scan test (verified actual path)
Dashboard `loyaltyCardScan.ts`:
1. `POST /api/orchestrator/loyalty-from-card` — vision extract (`loyaltyFromCardService`) — **not Intake V2**
2. `POST /api/performer/runtime/ui-action` `{ action: 'setup_loyalty_program', source: 'dashboard_loyalty_card_scan' }`
3. `executeUiRuntimeAction` → `executeSetupLoyaltyProgramRuntimeTool` → loyalty executors / mission row
4. **Bypasses:** IntentReasoner, `compileWithMultiAgent`, `topologyExecutor`, `writeMetadata` (uses dedicated loyalty mission helpers + pipeline metadata patterns)

### Path D — Campaign multi-agent compile (optional / flag-gated)
Intake / `unifiedDispatch` CREATE_CAMPAIGN_CHECKPOINT  
→ if `USE_COMPILER_FOR_CAMPAIGNS=true`: `dispatchMultiAgentCompilerFromIntake` → `generateExecutionPlan` → `compileWithMultiAgent` → `writeMetadata` (pending topology)  
→ user approve → `topologyExecutor`  
→ **else (default):** `dispatchCreateCampaignCheckpointPipeline` → `executeMission` → pipeline runner

### Path E — Missions API direct control
`POST /api/missions` / `…/plan` / `…/run` / `…/dispatch` / `…/execute-topology`  
→ `planMissionFromIntent` and/or `executeMission` and/or `topologyExecutor` — parallel to intake.

### Path F — Agent messages / assistant
`agentMessagesRoutes` / `assistant.js` → `agentIntentRouter.classifyIntent` and/or `planMissionFromIntent` — separate classifier/planner stack.

### Path G — Proactive / runtime kernel
`performerProactiveStepRoutes`, runtime graph orchestrators → `executeMissionStep` — another executor entry.

```text
User / UI
 ├─ Intake V2 ──► IntentReasoner ──► (reactPlanner | PlannerIntegration | compiler?) ──► unifiedDispatch ──► executeMission / tools
 ├─ Runtime ui-action ──► executeUiRuntimeAction ──► tools (LOYALTY CARD SCAN)
 ├─ Missions API ──► planMissionFromIntent / executeMission / topologyExecutor
 └─ Agent chat ──► agentIntentRouter ──► …
```

---

## 5. Import dependency check (Intake “index”)

| Check | Result |
|-------|--------|
| Expected `src/lib/intake/index.js` | **MISSING** |
| Actual intake module | `routes/performerIntakeV2Routes.js` |
| Top-level `import` count | **~120** (target ≤ 5) |
| Direct layer dependencies | Shortcuts, classifiers, many domain guards, `unifiedDispatch`, reactPlanner, plannerIntegration, skills, tools, prisma, blackboard, capability stack, OCR, memory, decisions (shadow), etc. |
| Layer bypass | Route **is** classifier+planner+executor orchestration in one file; routinely bypasses `compileWithMultiAgent` / `topologyExecutor` / `writeMetadata` unless flags + mission type align |

Verification notes:
- `decideTurn` — **no import of runtime module** (file gone); only stale type refs.
- `unifiedDispatch` — **actively imported/called** from Intake V2, kernel tool dispatch, checkpoint helpers, runtime factory, dashboard client.
- `AgentCoordinator` — **actively used** by `compileWithMultiAgent` (decompose) and `missionPipelineRunner` (orchestration) — dual role (planner+executor helper).

---

## 6. Cleanup Priority

1. **Document & freeze** the target spine: Intake module → IntentReasoner → compileWithMultiAgent → topologyExecutor → writeMetadata. Do not add new bypasses.
2. **Route loyalty card scan through the spine** (or explicitly mark ui-action as a temporary “trusted tool” gateway with a sunset). Today’s loyalty test never exercises clean architecture.
3. **Enable compiler path behind flag, then make it default for campaigns**; delete checkpoint fallback after parity.
4. **Collapse Intake V2** into a thin `lib/intake/index.js` (≤5 layer imports); move fast-paths behind adapters owned by classifier/planner.
5. **Single executor facade**: pick `topologyExecutor` *or* document `executeMission` as the only runtime until topology covers all mission types; stop growing parallel runners.
6. **Force all metadata writes through `writeMetadata`** (or expand it to cover outputsJson contract).
7. **Retire workflowBlueprint JSON** once topologies cover store + campaign, or define blueprints as the *source* that compile into `topology.v1` only.
8. **Delete** V1 legacy archive + decideTurn orphans after import audits.
9. **Merge/remove** `agentIntentRouter` and assistant `planMissionFromIntent` into IntentReasoner + compile path.

---

## 7. Risk Assessment (if we delete/consolidate aggressively)

| Change | What could break | Why | Impact scope |
|--------|------------------|-----|--------------|
| Delete checkpoint fallbacks before compiler default-on | Store/create campaign missions fail or skip HITL cards | Default flags keep checkpoints; compilers only for flagged tenants | Store creation, campaign draft |
| Force all intake through IntentReasoner only (kill shortcuts) | OCR upload, device/poster, website runway, asset-ingest UX regress | Shortcuts currently short-circuit classify for reliability | Upload → create store, device attach, promo graphics |
| Delete `missionPipelineRunner` | Existing in-flight pipelines, structured store/campaign checkpoints stop | Most production missions still use pipeline steps | Missions run/resume/QA |
| Delete `unifiedDispatch` | Intake tool execution + factory + dashboards break | It is the current execution contract for V2 | Performer console, publish, runtime |
| Force loyalty scan through Intake V2 | Dashboard scanner UX / auth / guest differences | Scanner uses orchestrator + ui-action today | Loyalty card scan |
| Collapse metadata to writeMetadata only | Race/shape bugs if outputsJson / stepOutputs conventions diverge | Many writers assume local merge shapes | Blackboard UI, recovery, QA autofix |

**Smallest safe next patch (recommended):**  
(1) Add a thin `lib/intake/index.js` that re-exports the V2 handler without expanding behavior;  
(2) Add telemetry counters for which parallel path handled each turn (`intake_v2 | ui_action | missions_api | agent_chat`);  
(3) Dual-write loyalty scan into IntentReasoner classification telemetry so Architecture vs Reality is measurable — **no deletion yet**.

---

## 8. Verification commands (re-run locally)

```bash
# decideTurn — expect type-only / no real imports of decideTurn.js
# unifiedDispatch — expect live require/import from intake + runtime
# AgentCoordinator — expect new AgentCoordinator in compileWithMultiAgent + missionPipelineRunner
# Intake index — expect "Not found"
# Count top-level imports in performerIntakeV2Routes.js — expect ~120
```

Status as of audit:
- `decideTurn.js`: **MISSING**
- `lib/intake/index.js`: **MISSING**
- `unifiedDispatch`: **USED**
- `AgentCoordinator`: **USED** (planner decompose + pipeline runner)
- Loyalty card: **runtime ui-action path**, not Intake V2 spine

---

## Appendix: Expected vs Reality diagram

```text
TARGET:
  ONE Intake → ONE Classifier → ONE Planner → ONE Executor → ONE Store
  intake/index → IntentReasoner → compileWithMultiAgent → topologyExecutor → writeMetadata

CURRENT (simplified):
  [IntakeV2 god-route | ui-action | missions API | agent chat]
           ↓                    ↓
  [IntentReasoner | shortcuts | agentIntentRouter]
           ↓
  [compileWithMultiAgent? | PlannerIntegration | reactPlanner | agentPlanner | blueprints | skills]
           ↓
  [topologyExecutor? | missionPipelineRunner | executeMission | kernel | toolDispatcher | AgentCoordinator.orchestrate]
           ↓
  [writeMetadata? | prisma.update×30+ | blackboard | outputsJson]
```
