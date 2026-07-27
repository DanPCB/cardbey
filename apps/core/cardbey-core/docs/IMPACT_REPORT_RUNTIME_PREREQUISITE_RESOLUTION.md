# Impact Report: Runtime Prerequisite Resolution

## Summary

Introduces explicit Runtime Kernel prerequisite resolution before proactive step execution. Blocks store-dependent tools (e.g. `analyze_store`) when no valid store is bound, instead of silently auto-creating a store or mutating mission type.

## What could break

1. **Proactive steps without store** — Previously auto-picked latest business or fell through to store creation intake. Now return HTTP 412 `PREREQUISITE_REQUIRED` when `ENABLE_RUNTIME_PREREQUISITE_RESOLUTION=true`.
2. **Legacy fallback disabled** — `proactiveRunwayStepExecutor` no longer auto-fetches latest business when prerequisite resolution is enabled.
3. **Store child missions** — Prerequisite store builds retain `parentMissionId` (unlike handoff store missions that strip lineage).

## Why

- Silent store inference in executor (`findFirst` business) masked missing targets.
- Intake/frontend fallthrough could spawn replacement store missions.
- No persisted blocked state on refresh.

## Impact scope

- Runtime Kernel step execution (`POST /api/runtime/missions/:id/steps/:n/execute`)
- Proactive runway executor store fallback
- Session rehydration (exposes `runtimePrerequisites`, `waitingForPrerequisite`)
- Performer UI (prerequisite card, select/create store actions)
- Prerequisite child store completion → parent resume hook in `missionPipelineRunner`

## Smallest safe patch (implemented)

1. `runtimePrerequisiteResolver.js` — `resolveMissionPrerequisites()`
2. Gate in `executeMissionStep()` before `executeProactiveRunwayStep()`
3. Persist `metadataJson.runtimePrerequisites` with status lifecycle
4. `POST /api/runtime/missions/:id/prerequisites/resolve`
5. Frontend handles 412 + session hydration + `RuntimePrerequisiteCard`
6. Flag: `ENABLE_RUNTIME_PREREQUISITE_RESOLUTION` (capability: `runtimePrerequisiteResolution`)

## Rollback

Set `ENABLE_RUNTIME_PREREQUISITE_RESOLUTION=false`. Legacy business auto-pick resumes when flag is off.

## Acceptance mapping

| Criterion | Status |
|-----------|--------|
| Step 1 without store does not silently create store | Kernel returns 412 |
| Performer shows prerequisite card | `runtime_prerequisite` form card |
| User can create or select store | Resolve API + UI |
| After resolution, original step resumes | `autoResume` on select; child completion hook |
| Mission lineage preserved | Parent type unchanged; child has `parentMissionId` |
| Refresh preserves state | `runtimePrerequisites` in session |
| Runtime Kernel owns resolution | Central resolver + kernel gate |
