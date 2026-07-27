# Factory Runtime Reusability Audit

**Date:** 2026-06-12  
**Scope:** Can Factory Runtime support additional factories (Campaign, Store, Profile, Booking) without forking orchestration?  
**Auditor:** Automated code + gauntlet review post Creative Factory V1/V2.

---

## Executive verdict

| Dimension | Rating | Summary |
|-----------|--------|---------|
| **Orchestration core** | **REUSABLE** | Sequential stage runner, pause/resume, persistence, telemetry, Performer entry are factory-agnostic. |
| **Stage execution** | **PARTIAL** | Tool-mapped stages are reusable; builtin stages are Creative V2–coupled. |
| **Intent routing** | **NOT REUSABLE** | Single creative/video router; no pluggable factory intent registry. |
| **Console UI** | **PARTIAL** | `FactoryConsoleCard` is factoryId-aware but Creative-centric panels. |
| **Authority / bypass** | **PASS** | All factory paths use Performer Runtime + `RUNTIME_AUTHORITY_PATH_USED`. |

### Overall: **PARTIALLY REUSABLE — safe for tool-pipeline factories; not yet plug-and-play for arbitrary domains**

A new factory that is **definition + tool stages + approval + artifact_finalize** can be added today with ~3 files and no executor fork. A factory needing **custom stage logic** or **new intent surfaces** still requires executor/router/UI edits.

---

## Audit execution

```bash
cd apps/core/cardbey-core
node scripts/factory-runtime-v1-gauntlet.mjs          # OVERALL PASS
npx vitest run src/lib/factoryRuntime/                # 12/12 PASS
```

| Check | Result |
|-------|--------|
| V1 gauntlet (static + authority) | PASS |
| `factoryRuntimeExecutor` unit tests (V1 + V2 pause/resume) | PASS |
| `creativeFactoryV2Stages` unit tests | PASS |
| `factoryIntentRouter` unit tests | PASS |
| `runtimeAuthorityBypass` during factory telemetry | 0 |

**Gap:** Gauntlet validates only `creative_asset_factory_v1`; V2 and multi-factory registration are not in gauntlet scope.

---

## Reusable layers (keep as shared platform)

### 1. FactoryDefinition contract

`lib/factoryRuntime/factoryDefinition.js`

- Zod-validated `factoryId`, `version`, `stages[]`, `approvalPolicy`, `artifactPolicy`
- `inputMapping` / `outputMapping` via `$.path` envelope resolution
- `builtinStage` flag (V2 extension) for stages without external tools
- **Reusable for any factory** that fits the stage graph model

### 2. Registry

`lib/factoryRuntime/factoryRegistry.js`

- `registerFactory(definition)` at bootstrap
- `getFactory(factoryId)` / `listFactories()`
- Currently registers: `creative_asset_factory_v1`, `creative_asset_factory_v2`
- **Adding a factory:** new file under `factories/` + one `registerFactory()` line

### 3. Executor loop

`lib/factoryRuntime/factoryRuntimeExecutor.js`

| Capability | Reusable? | Notes |
|------------|-----------|-------|
| Sequential `stageIndex` runner | Yes | |
| `resumeState` / `resumeFromApproval` | Yes | Approval resumes at stored index |
| Duplicate guard (intent router) | Yes | Mission context check before re-run |
| `dispatchTool` + `markRuntimeOwnedContext` | Yes | All tool stages runtime-owned |
| `requiresApproval` pause | Yes | Generic `awaiting_factory_approval` |
| `artifact_finalize` → `generatedArtifactAuthority` | Mostly | See coupling notes below |
| `retryPolicy` on tool stages | Yes | Implemented |
| `timeoutMs` on stages | **No** | Defined in schema, **not enforced** |
| `skillName` stages | **No** | Returns `skill_not_supported_v1` |
| `requiredArtifacts` validation | **No** | Schema only; not checked at pause |

### 4. Approval service

`lib/factoryRuntime/factoryApprovalService.js`

- Persists to `Mission.context.factoryRuntimeExecution`
- Blackboard keys: `factory_runtime:pending`, `factory_runtime:state`
- Resume calls `runFactoryExecution({ resumeState })` — **does not restart stage 1**
- **Reusable** for any factory using the same approval checkpoint pattern

### 5. Performer Runtime gateway

| Entry | Path | Reusable? |
|-------|------|-----------|
| `run_factory` | `executeRuntimeAction.js` | Yes — takes `factoryId` in payload |
| HTTP | `POST /api/performer/runtime/run-factory` | Yes |
| HTTP | `POST /api/performer/runtime/factory-approval` | Yes |

No UI or intake path should call factory modules directly — **contract holds**.

### 6. Telemetry + authority

`lib/factoryRuntime/factoryTelemetry.js`

- Generic: `FACTORY_EXECUTION_*`, `FACTORY_STAGE_*`
- Creative-specific: `CREATIVE_FACTORY_RESEARCH_COMPLETED`, etc.
- All events call `recordRuntimeAuthorityPathUsed` — **no bypass observed**

### 7. Dashboard client surface

| File | Reusable? |
|------|-----------|
| `factoryRuntimeClient.ts` | Yes — generic `run-factory` / `factory-approval` |
| `factorySessionHydration.ts` | Mostly — hydrates any `factoryRuntimeExecution` |
| `factory_execution` FormCard | Yes — carries `factoryId` + `execution` blob |

---

## Coupling points (blockers for arbitrary new factories)

### Critical — executor builtin routing

```245:260:apps/core/cardbey-core/src/lib/factoryRuntime/factoryRuntimeExecutor.js
  if (stage.builtinStage || (state.factoryId === CREATIVE_ASSET_FACTORY_V2_ID && ['research', 'script', 'asset_search', 'video_plan'].includes(stage.stageId))) {
    // ...
    const { runCreativeFactoryV2BuiltinStage } = await import('./creativeFactoryV2Stages.js');
    return runCreativeFactoryV2BuiltinStage(stage, state, definition, ownedCtx);
  }
```

**Issue:** `builtinStage` always dispatches to **Creative V2** handler module. A Campaign or Store factory cannot register its own builtin stages without editing the executor.

**Fix (recommended):** `factoryStageHandlerRegistry.register(factoryId, stageId, handler)` resolved before hardcoded import.

---

### High — approval plan output keys

```109:122:apps/core/cardbey-core/src/lib/factoryRuntime/factoryApprovalService.js
  if (editedPlan && typeof editedPlan === 'object') {
    if (pending.factoryId === 'creative_asset_factory_v2' || stageOutputs.video_plan) {
      stageOutputs.video_plan = { ... videoPlan: editedPlan };
    } else {
      stageOutputs.creative_plan = { ... plan: editedPlan };
    }
  }
```

**Issue:** `editedPlan` merge is Creative V1/V2–specific.

**Fix:** Add to `approvalPolicy`: `planStageId` + `planOutputKey` (e.g. `video_plan.videoPlan`).

---

### High — artifact finalize assumptions

```314:328:apps/core/cardbey-core/src/lib/factoryRuntime/factoryRuntimeExecutor.js
  const executeOut = state.stageOutputs?.execute ?? state.stageOutputs?.creative_execute ?? {};
  // artifactType defaults to generated_video / slideshow heuristics
```

**Issue:** Execute stage naming and artifact type inference are video-biased.

**Fix:** `artifactPolicy.executeStageId` + explicit `artifactType` from definition; avoid URL substring heuristics.

---

### High — intent routing is Creative-only

`lib/factoryRuntime/factoryIntentRouter.js`

- `isCreativeFactoryIntent()` — video/creative triggers only
- `resolveCreativeFactoryId()` — V1/V2 toggle only
- Wired exclusively in `performerIntakeV2Routes.js` before skill router

**Issue:** A `campaign_package_factory` has no intent router hook.

**Fix:** `factoryIntentRegistry.register({ match, factoryId, priority })` consumed by intake.

---

### Medium — Console UI Creative panels

`FactoryConsoleCard.tsx` + `factoryExecutionModel.ts`

- V2 pipeline panel (`research`, `script`, `asset_search`) is hardcoded
- `isCreativeFactoryV2()` gates rich approval UI
- Default `factoryId` fallback: `creative_asset_factory_v1` in intake + hydration

**Fix:** Factory metadata on definition (`consoleRenderer: 'creative_v2' | 'generic'`) or per-factory card plugins.

---

### Medium — telemetry namespace

Creative V2 emits `CREATIVE_FACTORY_*` events inside shared `factoryTelemetry.js`.

**Fix:** Factory-scoped event prefix from `definition.factoryId` or `telemetryNamespace` field.

---

### Low — gauntlet scope

`scripts/factory-runtime-v1-gauntlet.mjs` checks V1 creative factory only.

**Fix:** Iterate `listFactories()`, validate each definition, run factory-specific test matrix.

---

## What works today without executor changes

### Pattern A — Tool-only factory (recommended next factory)

Example skeleton for a hypothetical `campaign_package_factory_v1`:

```javascript
stages: [
  { stageId: 'research', toolName: 'market_research', inputMapping: {...}, outputMapping: {...} },
  { stageId: 'draft_offer', toolName: 'create_offer_draft', ... },
  { stageId: 'approval', requiresApproval: true },
  { stageId: 'launch_prep', toolName: 'queue_campaign', ... },
  { stageId: 'artifact_finalize' },
]
```

**Requirements:** Intent must reach `run_factory` via explicit API or new intent router entry. Console can use generic `FactoryConsoleCard` approval panel if plan lands in `creative_plan.plan` or `video_plan.videoPlan`.

### Pattern B — Creative factories (current)

| Factory | Stages | Status |
|---------|--------|--------|
| `creative_asset_factory_v1` | plan → approve → execute → finalize | Production (flag on) |
| `creative_asset_factory_v2` | research → script → assets → plan → approve → execute → finalize | Production (flag off by default) |

---

## Reusability scorecard by future factory type

| Factory type | Ready now? | Blockers |
|--------------|------------|----------|
| **Creative asset** (video/graphic) | Yes | — |
| **Campaign package** (research → draft → approve) | **Mostly** | Intent router; plan key in approval; console renderer |
| **Store onboarding** (multi-step tools) | **Mostly** | Same as campaign |
| **Profile / booking** (shorter pipelines) | **Mostly** | Same |
| **Factory with custom LLM stages** | **No** | Need stage handler registry |
| **Factory with skill stages** | **No** | `skillName` unsupported |
| **Multi-approval factories** | **Partial** | `approvalPolicy.mode: per_stage` exists; only one approval stage tested |

---

## Recommended hardening (priority order)

| P | Change | Effort | Unlocks |
|---|--------|--------|---------|
| P0 | `factoryStageHandlerRegistry` — replace Creative V2 hardwire in executor | S | Any builtin-stage factory |
| P0 | `approvalPolicy.planPath` — generic editedPlan merge | S | Any approval UI |
| P1 | `factoryIntentRegistry` — pluggable intent → factoryId | M | Intake routing for non-creative |
| P1 | `artifactPolicy.executeStageId` + explicit artifact type | S | Non-video artifacts |
| P2 | Enforce `timeoutMs` + `requiredArtifacts` at runtime | M | Production safety |
| P2 | `factory-runtime-reusability-gauntlet.mjs` — all registered factories | S | CI confidence |
| P3 | Console factory renderer registry | M | Domain-specific UX without card forks |
| P3 | Implement `skillName` stage dispatch | L | Skill-in-factory composition |

---

## Authority & session reuse (PASS)

| Requirement | Status |
|-------------|--------|
| Single entry: Performer `run_factory` | PASS |
| No direct UI → factory executor bypass | PASS |
| Approval via `/factory-approval` only | PASS |
| State in `Mission.context.factoryRuntimeExecution` | PASS |
| Refresh rehydration (`factorySessionHydration`) | PASS |
| Duplicate execution guard on re-intent | PASS |
| `generatedArtifactAuthority` on finalize | PASS |

---

## Final verdict

**Factory Runtime V1 orchestration is reusable infrastructure** — not a one-off Creative script. The contract, registry, executor loop, approval persistence, API gateway, and artifact authority are correctly abstracted.

**Reusability is capped at ~70%** until:

1. Builtin stage dispatch is registry-based (not Creative V2–hardcoded)
2. Approval plan paths are definition-driven (not `creative_plan` / `video_plan` branches)
3. Intent routing is pluggable beyond creative/video

**Safe to proceed:** Campaign / Store factories using **tool-only stages** + explicit `run_factory` invocation or a small intent-router extension.

**Not safe yet:** New factories with **custom stage logic** without touching `factoryRuntimeExecutor.js`.

---

## Related docs

- [FACTORY_RUNTIME_V1_REPORT.md](./FACTORY_RUNTIME_V1_REPORT.md)
- [CREATIVE_FACTORY_V1_REPORT.md](./CREATIVE_FACTORY_V1_REPORT.md)
- [CREATIVE_FACTORY_V2_REPORT.md](./CREATIVE_FACTORY_V2_REPORT.md)
