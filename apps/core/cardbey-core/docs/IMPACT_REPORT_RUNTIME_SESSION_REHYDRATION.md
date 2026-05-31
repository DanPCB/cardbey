# Impact Report: Runtime Session Rehydration

## Observed bugs

1. **Mission sequence wrong after Step 1** — `Run next step` falls through to intake (`Please advance my mission to the next step`) when proactive completed steps are lost from React refs; intake creates a new orphan mission instead of executing step 2 on the same mission.
2. **Refresh loses process** — `ActiveMissionContext` clears terminal missions on load (`restore_guard_terminal_mission_row`); proactive step status lives only in ephemeral refs; `completedMissionContextRef` is not persisted.
3. **Store memory failure** — Client store gate uses `effectiveStoreId` from route prop + `activeMission.storeId` only; never falls back to user's `Business` rows; shows "need a store first" despite account stores.

## Audit findings

### 1. Frontend active mission storage

| Layer | Key / location | Persists refresh? |
|-------|----------------|-------------------|
| sessionStorage | `cardbey.console.activeMission.v1` | Yes (same tab) |
| localStorage | `cardbey_active_mission` (2h TTL) | Blocked unless `SESSION_MISSION_KEY` matches |
| sessionStorage | `cardbey_session_mission` | Tab session token |
| sessionStorage | `cardbey_execution_context` | Execution panel only |
| React refs | `activeMissionIdRef`, `completedMissionContextRef`, `proactivePlanCompletedRef` | **No** |

### 2. Recovery after refresh

- `getInitialActiveMission()` merges session + local storage.
- **Bug:** Effect on mount fetches mission detail; if status is terminal (`completed`), **clears all persistence** — destroys proactive plan context after analyze_store.
- Proactive step hydration (`hydrateProactiveStepsFromMission`) only runs on new plan intake, not on mount.
- `refreshActiveMission()` calls `GET /api/missions/active` which **excludes completed** missions.

### 3. activeStoreId after refresh

`effectiveStoreId = storeId ?? activeMission.storeId ?? parentMission artifacts` — no user Business lookup.

Backend `buildRunwayContext` Layer 4 recovers from recent MissionPipeline only; not wired into client store gate.

### 4. Why existing stores ignored

`resolveMissionContextForInput` / `shouldAskStoreClarification` never query `/api/store/context` or Business list. `setNoStoreMessage(true)` fires when `intentRequiresStore()` matches keywords without `effectiveStoreId`.

### 5. Follow-up → queued orphan mission

When proactive `completed` set is empty after refresh, `Run next step` → intake v2 with generic advance text → new `proactive_plan` / pipeline instead of `executeMissionStep` for step 2 or child spawn via continuation.

### 6. Mission status taxonomy

| Class | Statuses |
|-------|----------|
| Terminal | completed, failed, cancelled, done, ended |
| Success terminal (continuation) | completed + runState done |
| Active / recoverable | executing, queued, paused, planned, requested, awaiting_confirmation |
| Blocked | awaiting_input, checkpoint pending |

### 7. MissionContinuationContract persistence

- **Client:** ephemeral ref only (`completedMissionContextRef`).
- **Backend:** recoverable via `resolveContinuationContract(missionId)` from DB when `ENABLE_MISSION_HANDOFF=true`.
- **Not** in localStorage/sessionStorage today.

### 8. Blackboard stream reconstruction

- Events exist (`mission.step.*`, runtime stream) but **not** used to rebuild Performer thread on mount.
- Session rehydration must include `proactiveStepStatus` + `stepOutputs` from `metadataJson` as primary durable source.

## What could break

| Area | Risk | Mitigation |
|------|------|------------|
| Store creation | Low | Session service read-only; flags gate new paths |
| Campaign orchestration | Medium | Resume only for owned missions; flags |
| Performer chat | Low | Session hydrate is additive on mount |
| Device publishing | Low | No change to device routes |
| Mission continuation | Low | Aligns with existing handoff service |

## Smallest safe patch

1. Add `runtimeSessionService.resolveActiveRuntimeSession` behind `ENABLE_RUNTIME_SESSION_REHYDRATION`.
2. Add `GET /api/runtime/session/active` — single hydration authority.
3. Frontend mount hook hydrates mission, store, proactive steps, continuation contract.
4. Stop clearing terminal missions that have recoverable proactive plan / continuation context.
5. `Run next step` prefers session pending step before intake fallback.
6. Store gate uses session `activeStoreId` / `storeCandidates` before "need store first".

## Rollback

Set `ENABLE_RUNTIME_SESSION_REHYDRATION=false` — frontend skips session endpoint; legacy storage paths unchanged.
