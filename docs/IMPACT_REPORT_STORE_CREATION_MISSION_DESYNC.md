# Impact Report: Store creation stall (mission identity desync)

## Symptom (live)

Performer create-store stops halfway: URL `missionId` ≠ active/runtime mission, `draftStoreId: null`, UI “Generating store…” then jumps to manual next steps without a completed draft.

## What could break

1. **Wrong mission watched in Performer** — blackboard/SSE/next steps attach to a stale `?missionId=` while intake started a new create_store mission.
2. **False “complete” / manual next steps** — terminal hydrate runs against the old mission (no draft for ANOTHER FASHION).
3. **`draftStoreId: null` debug** — expected early on deferred checkpoint pipeline; dangerous when still null because UI never followed the new mission to `structured_store_build`.

## Why

1. Intake deferred path returns `store_mission_started` for **mission B** without draft artifacts yet.
2. `onStoreMissionStartedFromIntakeV2` sets `activeMission` → B but does **not** replace URL `?missionId=`.
3. `SingleRunwayUrlSync` restores active mission from the **stale URL** mission A, overwriting B.
4. Runtime session hydration can similarly reattach to an older session mid.

## Impact scope

- Dashboard Performer: `usePerformerConsole.ts`, `SingleRunwayUrlSync.tsx`, mission blackboard / projection consumers on `/app?missionId=`.
- Does **not** change core create_store pipeline, research, or draft generation semantics.

## Smallest safe patch

1. On store/website `store_mission_started`, `navigate(..., { replace: true })` to `/app?missionId=<newId>` and update mission-access debug context.
2. In `SingleRunwayUrlSync`: if active mission is an in-flight store/website create and differs from URL mid, rewrite URL to active instead of restoring URL over active.
3. In `applyRuntimeSessionHydration`: skip overwriting active mid when console already has a newer in-flight create_store mission distinct from session mid.

## Out of scope for this patch

- Research Evidence Layer (uncommitted; not required for this desync).
- Wrapping `runStoreCreationResearch` try/catch (follow-up hardening).
