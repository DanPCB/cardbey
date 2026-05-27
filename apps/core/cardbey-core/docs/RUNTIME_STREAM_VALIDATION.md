# Unified Runtime Stream Validation

**Generated:** 2026-05-27  
**Module:** `lib/runtime/performerRuntime/unifiedRuntimeStream.js`  
**Flag:** `PERFORMER_RUNTIME_UNIFIED_STREAM` (default **true**)

## Design intent

Blackboard (`missionBlackboard.js`) is an **event source**, not a parallel execution authority. Runtime-owned events are prefixed `runtime.*` and merged with legacy blackboard rows via `normalizeStreamEvent`.

---

## Validation checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Blackboard not executing tools | Pass | Execution only via `dispatchTool` / facade |
| Runtime events prefixed | Pass | `emitRuntimeStreamEvent` enforces `runtime.` prefix |
| SSE broadcast on append | Pass | `broadcastSse('agent-chat', 'runtime.stream', …)` |
| Merge via `getUnifiedRuntimeStream` | Pass | Normalizes all rows |
| Stream disable safe | Pass | Returns `{ ok: false, reason: 'stream_disabled_or_no_mission' }` |
| Category taxonomy | Pass | `categorizeStreamEvent` |

---

## Event ordering

- Blackboard assigns monotonic `seq` per mission (`appendEvent`).
- `getUnifiedRuntimeStream` returns events in seq order from `getEvents`.
- Runtime events and legacy events share the same seq space → **total order preserved**.

**Gap:** No cross-mission ordering (by design).

---

## Event categories

| Category | Examples |
|----------|----------|
| execution | `runtime.execution.*`, `completed_action`, `step_output` |
| telemetry | `runtime.telemetry.*`, `reasoning_line` |
| approval | `approval_required`, `runtime.approval.*` |
| pipeline | `plan_proposed`, `runtime.pipeline.*` |
| orchestration | `handoff`, `runtime.orchestration.*` |
| artifact | `runtime.artifact.*` |
| failure | `runtime.failure.*` |
| lifecycle | default |

---

## Duplicate emission risks

| Source | Risk | Mitigation |
|--------|------|------------|
| Intake `completed_action` + runtime `execution.completed` | Duplicate execution signals | Acceptable during staging; UI should prefer `runtime.*` when present |
| Pipeline `step_output` + runtime execution events | Overlap | Categorize differently; document in dashboard stream merge |
| Retry same tool | Duplicate seq events | `detectExecutionDuplication` probe |

---

## Failure propagation

| Path | Behavior |
|------|----------|
| `executeRuntimeAction` failure | `runtime.execution.failed` emitted |
| `dispatchTool` blocked | May not emit runtime event if outside runtime | Gap: intake-only blocks |
| Stream append failure | Returns `{ ok: false }`; execution continues |

---

## Replay consistency

- `getUnifiedRuntimeStream(missionId, { afterSeq, limit })` supports incremental replay.
- Normalized shape includes `source: 'performer_runtime' | 'blackboard'`.
- Payload includes `unifiedStream: true` for runtime-emitted events.

**Staging test:** Subscribe SSE `runtime.stream`, run one direct tool with runtime enabled, verify seq monotonicity.

---

## Artifact lifecycle continuity

- `recordRuntimeExecutionNode` links artifact refs in `runtimeStateGraph` (preparatory).
- `executionRecords` persist to mission context when `PERFORMER_EXECUTION_RECORDS_PERSIST=true`.
- Blackboard `completed_action` still used by intake for artifact hints — **dual write during migration**.

---

## Parallel authority check (stream logic)

| Check | Result |
|-------|--------|
| Stream module invokes executors | No |
| Stream module mutates mission state beyond append | No |
| Blackboard append triggers execution | No |

**Conclusion:** Stream layer does not retain parallel execution authority.

---

## Recommendations before production trust

1. Dashboard: prefer `getUnifiedRuntimeStream` over raw blackboard for Performer console.
2. Add staging test: mission with 3 steps → verify seq order matches execution order.
3. When Stage B enabled, assert every tool run has preceding `runtime.execution.started`.
4. Document `completed_action` deprecation timeline for UI consumers.
