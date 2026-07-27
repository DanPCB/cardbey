# Creative Factory V2 — Research, Script, Asset Search, Video Plan

**Date:** 2026-06-12  
**Scope:** Extend Creative Factory with a real creative production pipeline before approval and execution.

---

## Verdict: Can Creative Factory V3 begin?

**YES**

V2 delivers the pre-production pipeline (research → script → asset search → video plan) under Factory Runtime with approval, execution, artifact authority, and session recovery intact.

**Allowed V3 scope:**

- Subtitles
- Music selection
- Final asset approval
- Optional publish handoff

**Still NOT in V3:**

- Full multi-scene compositor
- New runtime
- Replacing Content Studio
- Replacing Performer

---

## V2 architecture

```
User intent (intake/v2)
  → factoryIntentRouter (ENABLE_CREATIVE_FACTORY_V2=true → creative_asset_factory_v2)
  → executeRuntimeAction({ actionType: 'run_factory' })
  → runFactoryExecution
      1. research      (builtin — market_research + deterministic fallback)
      2. script        (builtin — llmGateway / generate_video_script / template)
      3. asset_search  (builtin — store catalog + search_hero_media, no mutation)
      4. video_plan    (builtin — assembles videoPlan for approval)
      5. approval      (pause — awaiting_factory_approval)
      6. execute       (video_generate_multimodal with approved videoPlan)
      7. artifact_finalize (generatedArtifactAuthority)
```

**Fallback:** `ENABLE_CREATIVE_FACTORY_V2=false` (default) → `creative_asset_factory_v1` when `ENABLE_CREATIVE_FACTORY_V1=true`.

---

## Stage outputs

| Stage | Output key | Contract |
|-------|------------|----------|
| research | `researchBrief` | audience, offerAngle, seasonalHook, productServiceFocus, recommendedTone, visualDirection, summary |
| script | `scriptDraft` | hook, scenes (3), voiceoverCopy, cta, onScreenText |
| asset_search | `assetCandidates` | assetId/url, type, provider, relevanceReason, usageRole |
| video_plan | `videoPlan` | objective, audience, scenePlan, script, CTA, duration, approvalSummary, assetCandidates |
| execute | artifact + videoUrl | consumed by artifact_finalize |
| artifact_finalize | authority record | `generated_video` in `Mission.context.generatedArtifacts` |

---

## Changed files

### Core

| File | Change |
|------|--------|
| `lib/factoryRuntime/factories/creativeAssetFactoryV2.js` | V2 factory definition (7 stages) |
| `lib/factoryRuntime/creativeFactoryV2Stages.js` | Builtin stage handlers + fallbacks |
| `lib/factoryRuntime/creativeFactoryV2Stages.test.js` | Unit tests |
| `lib/factoryRuntime/factoryDefinition.js` | `builtinStage` support |
| `lib/factoryRuntime/factoryRegistry.js` | Register V2 + `CREATIVE_ASSET_FACTORY_V2_ID` |
| `lib/factoryRuntime/factoryIntentRouter.js` | V2 flag + `resolveCreativeFactoryId()` |
| `lib/factoryRuntime/factoryRuntimeExecutor.js` | Builtin stages, V2 plan pause, execute finalize |
| `lib/factoryRuntime/factoryRuntimeExecutor.test.js` | V2 pause/resume test |
| `lib/factoryRuntime/factoryApprovalService.js` | editedPlan → `video_plan.videoPlan` for V2 |
| `lib/factoryRuntime/factoryTelemetry.js` | V2 stage telemetry events |
| `.env.example` | `ENABLE_CREATIVE_FACTORY_V2=false` |

### Dashboard

| File | Change |
|------|--------|
| `src/lib/runtime/factoryExecutionModel.ts` | V2 stages + outputs in view model |
| `src/lib/runtime/factoryExecutionModel.test.ts` | V2 view model test |
| `src/components/console/cards/FactoryConsoleCard.tsx` | V2 pipeline + rich approval UI |
| `src/app/console/performer/factorySessionHydration.ts` | V2 telemetry events |

### Tests & docs

| File | Change |
|------|--------|
| `tests/e2e/creative-factory-v2.spec.ts` | Playwright E2E |
| `docs/CREATIVE_FACTORY_V2_REPORT.md` | This report |

---

## Telemetry

| Event | When |
|-------|------|
| `CREATIVE_FACTORY_RESEARCH_COMPLETED` | After research stage |
| `CREATIVE_FACTORY_SCRIPT_COMPLETED` | After script stage |
| `CREATIVE_FACTORY_ASSET_SEARCH_COMPLETED` | After asset search |
| `CREATIVE_FACTORY_VIDEO_PLAN_READY` | After video_plan |
| `FACTORY_STAGE_STARTED` / `COMPLETED` | All stages |
| `FACTORY_EXECUTION_PAUSED` | Approval checkpoint |
| `FACTORY_EXECUTION_COMPLETED` | Terminal success |
| `RUNTIME_AUTHORITY_PATH_USED` | All factory paths |

---

## Tests

**Unit (PASS):**

```bash
cd apps/core/cardbey-core
npx vitest run src/lib/factoryRuntime/creativeFactoryV2Stages.test.js \
  src/lib/factoryRuntime/factoryRuntimeExecutor.test.js \
  src/lib/factoryRuntime/factoryIntentRouter.test.js

cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/runtime/factoryExecutionModel.test.ts
```

Coverage includes: research fallback, script template fallback, asset dedupe, V1/V2 routing flags, V2 pause/resume without restarting research.

**E2E:**

```bash
cd apps/dashboard/cardbey-marketing-dashboard
CORE_BASE_URL=http://localhost:3001 DASHBOARD_TOKEN=<jwt> \
  pnpm run e2e tests/e2e/creative-factory-v2.spec.ts
```

Flow: intake → V2 card (research/script/assets/plan) → approve → artifact → refresh preserves state, single intake call.

---

## Limitations

1. **Regenerate plan** — not implemented in V2 approval UI (same as V1).
2. **Asset search** — read-only; does not mutate store hero or publish.
3. **LLM script** — falls back to `generate_video_script` or template when gateway unavailable.
4. **Research** — `market_research` when storeId present; otherwise deterministic brief (never fails).
5. **Execute** — still single-shot `video_generate_multimodal`; no multi-scene compositor.
6. **V2 default off** — requires `ENABLE_CREATIVE_FACTORY_V2=true` on core.

---

## Enable V2

```env
ENABLE_CREATIVE_FACTORY_V1=true
ENABLE_CREATIVE_FACTORY_V2=true
```

Rollback: set `ENABLE_CREATIVE_FACTORY_V2=false` to return to V1 pipeline.
