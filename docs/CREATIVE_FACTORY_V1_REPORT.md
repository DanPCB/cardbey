# Creative Factory V1 — Performer Console Surface Report

**Date:** 2026-06-12  
**Scope:** Expose `creative_asset_factory_v1` through Performer Console as the first Factory-powered user workflow.

---

## Verdict: Can Creative Factory V2 begin?

**YES**

Creative Factory V1 completes the Performer Console surface on top of Factory Runtime V1. V2 may begin with scope:

- Research → Script → Asset search → Video plan

Still **NOT** in V2:

- Subtitles
- Music engine
- Publishing
- Multi-scene compositor

---

## Changed files

### Core (`apps/core/cardbey-core`)

| File | Change |
|------|--------|
| `src/lib/factoryRuntime/factoryIntentRouter.js` | Intent detection, `FACTORY_INTENT_ROUTED`, `run_factory` routing, duplicate guard |
| `src/lib/factoryRuntime/factoryIntentRouter.test.js` | Unit tests |
| `src/lib/factoryRuntime/factoryRegistry.js` | `CREATIVE_ASSET_FACTORY_V1_ID` export |
| `src/lib/factoryRuntime/index.js` | Export intent router |
| `src/routes/performerIntakeV2Routes.js` | Factory routing before `skillRouter.route` (VideoGenerationSkill fallback when flag off) |
| `src/routes/performerRuntimeRoutes.js` | Enriched `factory-approval` response with `factoryExecution` + `generatedArtifacts` |
| `.env.example` | `ENABLE_CREATIVE_FACTORY_V1=true` |

### Dashboard (`apps/dashboard/cardbey-marketing-dashboard`)

| File | Change |
|------|--------|
| `src/lib/runtime/factoryRuntimeClient.ts` | `run-factory` / `factory-approval` client |
| `src/lib/runtime/factoryExecutionModel.ts` | Stage mapping + artifact authority resolution |
| `src/lib/runtime/factoryExecutionModel.test.ts` | Unit tests |
| `src/components/console/cards/FactoryConsoleCard.tsx` | Factory console card (5 states) |
| `src/app/console/performer/PerformerConsole.types.ts` | `factory_execution` FormCard |
| `src/app/console/performer/useIntakeV2.ts` | Factory intake response → FormCard |
| `src/app/console/ConsoleCentreColumn.tsx` | Render `FactoryConsoleCard` |
| `src/app/console/performer/factorySessionHydration.ts` | Refresh recovery from mission context |
| `src/app/console/performer/usePerformerConsole.ts` | Mount-time factory hydration |
| `src/lib/dashboard/readPersistedActiveMission.ts` | `awaiting_factory_approval` blocked status |
| `tests/e2e/creative-factory-v1.spec.ts` | Playwright E2E |

---

## UX flow

1. User opens Performer Console (`/console`).
2. User asks: *"Create a promotional video for my store"*.
3. Intake V2 classifies as `create_video` → `dispatchIntakeV2DirectTool`.
4. **Factory intent router** intercepts (when `ENABLE_CREATIVE_FACTORY_V1=true`):
   - Emits `FACTORY_INTENT_ROUTED`
   - Calls Performer Runtime `run_factory` → `creative_asset_factory_v1`
5. Console shows **FactoryConsoleCard**:
   - `planning` → `awaiting_factory_approval` (plan summary + Approve/Cancel)
6. User clicks **Approve** → `POST /api/performer/runtime/factory-approval`
   - Resumes from stored `stageIndex` (does **not** restart stage 1)
7. Card transitions to `executing` → `artifact_ready`
8. Artifact preview uses **generatedArtifactAuthority** record (`artifactId` + `url`); no orphan URLs
9. Browser refresh → `fetchFactoryHydrationMessage` loads mission context; same artifact, no duplicate run

---

## Runtime flow

```
User intent (intake/v2)
  → factoryIntentRouter.tryRouteCreativeFactoryIntent
  → executeRuntimeAction({ actionType: 'run_factory' })
  → runFactoryExecution(creative_asset_factory_v1)
      1. creative_plan (video_plan)
      2. approval (awaiting_factory_approval — pause)
      3. creative_execute (video_generate_multimodal)
      4. artifact_finalize (registerGeneratedArtifactV1)
  → Mission.context.factoryRuntimeExecution + generatedArtifacts
```

**Fallback:** `ENABLE_CREATIVE_FACTORY_V1=false` → existing `VideoGenerationSkill` path via `skillRouter.route` (not deleted).

---

## Telemetry

| Event | Where |
|-------|--------|
| `FACTORY_INTENT_ROUTED` | `factoryIntentRouter` → mission blackboard |
| `FACTORY_EXECUTION_STARTED` | `factoryRuntimeExecutor` |
| `FACTORY_STAGE_STARTED` | `factoryRuntimeExecutor` |
| `FACTORY_EXECUTION_PAUSED` | Approval checkpoint |
| `FACTORY_EXECUTION_RESUMED` | `factoryApprovalService` |
| `FACTORY_EXECUTION_COMPLETED` | `factoryRuntimeExecutor` |
| `RUNTIME_AUTHORITY_PATH_USED` | All factory paths via `recordRuntimeAuthorityPathUsed` |

Console card exposes telemetry in a collapsible **Factory telemetry** section. No `RUNTIME_AUTHORITY_BYPASS` on factory paths.

---

## E2E result

**Spec:** `tests/e2e/creative-factory-v1.spec.ts`

| Step | Criteria |
|------|----------|
| Factory route selected | Intake mocked with `dispatchedVia: factory_runtime` |
| Plan card appears | `factory-console-card` + `awaiting_factory_approval` stage |
| User approves | `factory-approval` called once |
| Artifact appears | `factory-artifact-preview` with authority `artifactId` |
| Refresh recovery | Mission GET hydrates same artifact |
| No duplicate mission | Single intake dispatch |

**Run:**

```bash
cd apps/dashboard/cardbey-marketing-dashboard
CORE_BASE_URL=http://localhost:3001 DASHBOARD_TOKEN=<jwt> pnpm run e2e tests/e2e/creative-factory-v1.spec.ts
```

Requires `DASHBOARD_TOKEN` for live auth checks; flow uses route mocks for deterministic factory stages.

**Unit tests (PASS):**

```bash
cd apps/core/cardbey-core
npx vitest run src/lib/factoryRuntime/factoryIntentRouter.test.js src/lib/factoryRuntime/factoryRuntimeExecutor.test.js

cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/runtime/factoryExecutionModel.test.ts
```

---

## Known limitations

1. **Regenerate plan** — UI stub only; factory V1 does not expose plan regeneration (skill path had regenerate via plan-decision).
2. **Retry on failure** — Button present; full retry orchestration deferred.
3. **Live E2E** — Full Kling/video generation not run in CI; E2E mocks intake + approval + mission context.
4. **Processing progress** — Legacy `video_generation` thinking progress may still show for video-like goals until factory card replaces it in thread.
5. **Content Studio deep link** — Video/graphic opens Content Studio home; slideshow uses artifact route.

---

## Success criteria checklist

| Criterion | Status |
|-----------|--------|
| Performer routes creative intents to Factory Runtime | ✅ |
| Console displays factory execution state | ✅ |
| Factory approval works from UI | ✅ |
| Artifact previews through artifact authority | ✅ |
| Refresh recovery works | ✅ |
| E2E spec created | ✅ |
| Report + V2 verdict | ✅ |
