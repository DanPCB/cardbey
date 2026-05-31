# Impact Report: Runtime Mission Orchestrator (Phase B)

**Date:** 2026-05-31  
**Trigger:** Move proactive mission sequencing from Performer Console to Runtime Kernel.

## What could break

| Area | Risk | Why |
|------|------|-----|
| **Proactive plan "Run all"** | Medium | Single backend loop replaces frontend for-loop; stop conditions must match prior UX (failure stops plan). |
| **Step retry / forceRetry** | Medium | Retry must pass `forceRetry` to kernel; without it completed steps skip silently. |
| **Mini-website / create_store branch** | Low | Orchestrator only handles runway steps in metadata; non-runway paths stay on legacy `runProactivePlanStepInternal`. |
| **Prerequisite child missions** | Low | Orchestrator stops on `PREREQUISITE_REQUIRED`; frontend still handles child spawn UI (unchanged). |
| **Campaign confirm (Phase B)** | Low | `awaiting_product_selection` still blocks terminal complete inside step executor; orchestrator treats as blocked. |
| **Pipeline missions (non-GUIDED_RUN)** | Low | Orchestrator requires proactive plan in metadata; returns `NO_PROACTIVE_PLAN` otherwise. |
| **Session rehydration** | Low | Adds `orchestrationState` to metadata; session service reads existing fields. |

## Why

Frontend `runProactivePlanAll` loops `runProactivePlanStepInternal` per step, maintaining `proactivePlanCompletedRef` as authority. Backend already owns single-step execution via `executeMissionStep` but not sequencing.

## Impact scope

- New: `runtimeMissionOrchestrator.js`, routes, status helpers
- `runtimeCapabilitiesService.js` — new capability key
- `usePerformerConsole.ts` — flag-gated delegation (legacy loop retained)
- `ProactivePlanThreadCard.tsx` — no logic change (handlers from parent)
- `performerConsoleIntegration.ts` — comment-only; `waitForMissionCompletion` unchanged for pipeline missions

## Smallest safe patch

1. Add orchestrator behind `ENABLE_RUNTIME_MISSION_ORCHESTRATOR=false` (default OFF).
2. Route `run-all` / `run-next` to backend only when capability true.
3. Keep legacy frontend loop when flag OFF.
4. Persist plan to `metadataJson.proactivePlanSteps` on first orchestrator call if missing.
5. UI refs hydrate from backend response only (cache, not authority).

## Rollback

Set `ENABLE_RUNTIME_MISSION_ORCHESTRATOR=false`. Frontend falls back to existing step buttons and client-side loop.
