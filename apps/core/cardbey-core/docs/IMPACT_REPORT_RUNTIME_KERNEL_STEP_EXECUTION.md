# Impact Report: Runtime Kernel Step Execution Authority

## Trigger

Proactive plan Step 1 displayed `analyze_store` but the dashboard resolved tools against `PERFORMER_INTAKE_ALLOWED_TOOLS`, downgraded to `general_chat`, emitted a fake client-side completion, and never persisted durable step state — causing a repeat loop.

## What could break

| Area | Risk | Why |
|------|------|-----|
| **Store creation** | Low | Store build uses `structured_store_build` / AUTO_RUN pipeline, not proactive runway step POST. Kernel step path is gated behind `ENABLE_RUNTIME_STEP_EXECUTION`. |
| **Campaign orchestration** | Medium | Campaign proactive steps (`create_promotion`, `launch_campaign`) share `performerProactiveStepRoutes` execution core. Extracting to shared executor must preserve confirm-phase routes unchanged. |
| **Proactive plan execution** | High (intended) | Behavior change: unknown/downgraded tools fail loudly; completed steps are idempotent; completion requires backend response. |
| **Performer chat** | Low | `general_chat` remains valid for intake/chat paths. Kernel rejects `general_chat` only for proactive **step** execution. |
| **Device publishing** | Low | Signage tools on runway allowlist; no change to device engine routes. |
| **Mission continuation** | Low | `parentMissionId` handoff is orthogonal; kernel accepts optional `continuationContract` without altering store-build lineage rules. |

## Why

Execution authority is split across six layers with divergent allowlists:

1. Dashboard `resolveProactiveStepTool` → `PERFORMER_INTAKE_ALLOWED_TOOLS` (missing `analyze_store`)
2. Dashboard `PROACTIVE_RUNWAY_TOOLS_LOWER` (includes `analyze_store`, unused by resolver)
3. Backend `PROACTIVE_RUNWAY_TOOL_SET` (authoritative for POST `/api/performer/proactive-step`)
4. Backend intake planner / `normalizePlan`
5. `toolDispatcher` registry
6. Ephemeral React refs for step completion

## Impact scope

- `usePerformerConsole.ts` proactive step runner
- `ProactivePlanThreadCard.tsx` button gating
- New `POST /api/runtime/missions/:missionId/steps/:stepNumber/execute`
- Shared `runtimeToolRegistry.js` + `performerRuntimeKernel.js`
- `performerProactiveStepRoutes.js` delegates to shared executor when flag on

## Smallest safe patch

1. Add backend Runtime Kernel step API behind `ENABLE_RUNTIME_STEP_EXECUTION=true`.
2. Add shared `runtimeToolRegistry.js` (single source; dashboard stops resolving execution tools locally when flag on).
3. Route dashboard proactive steps to kernel endpoint when `VITE_ENABLE_RUNTIME_STEP_EXECUTION=true`.
4. Remove client `general_chat` no-op for proactive steps when flag on.
5. Persist `metadataJson.proactiveStepStatus` + hydrate on mount from `GET /api/missions/:id/state`.
6. Keep legacy `/api/performer/proactive-step` as fallback when flag off.

## Rollback

Set `ENABLE_RUNTIME_STEP_EXECUTION=false` (core) and `VITE_ENABLE_RUNTIME_STEP_EXECUTION=false` (dashboard). Frontend reverts to legacy proactive-step POST and prior resolver behavior.

## Acceptance criteria

See user spec § Acceptance criteria (analyze_store end-to-end, no fake completions, refresh persistence, idempotency, loud rejection, campaign flows behind flags).
