# Impact Report — Runtime ownership for `executeMissionAction` facade

**Rule:** Development Safety Rule (LOCKED).  
**Status:** Approved via user acknowledgment (“yes”). Minimal patch applied in `executeMissionAction.js`.

**Trigger:** Conditional pipeline steps dispatch `mission_pipeline_stub` via
`missionPipelineRunner` → `dispatchTaskWithAgentHint` → `executeMissionAction` → `dispatchTool`.
With Stage E enabled, `assertRuntimeOwnership` returns `status: 'blocked'` because context lacks
`runtimeOwned` / `performerRuntimeOwned`.

---

## 1. Root cause

| Factor | Detail |
|--------|--------|
| **Block flag** | `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true` in local `.env` (line 69) and documented in `.env.example` Stage E section |
| **Ownership check** | `toolDispatcher.js` calls `assertRuntimeOwnership(ctx, ctx.source ?? 'tool_dispatcher')` |
| **Pass condition** | `ctx.runtimeOwned === true` OR `ctx.performerRuntimeOwned === true` |
| **`source` role** | Audit/telemetry label only (`mission_pipeline`); **does not** whitelist or block by name |
| **Gap** | Pipeline dispatch builds context without `markRuntimeOwnedContext`; only capability executors (`executeRuntimeAction`, analyze/create/revise offer) mark ownership today |

---

## 2. What could break

| Risk | Why | Likelihood |
|------|-----|------------|
| Stage E bypass for orphan `dispatchTool` | Marking all facade dispatches as owned | **Low** — direct `dispatchTool` calls remain unmarked; dev proof route still tests orphans |
| Wrong `runtimeId` on nested runtime path | `executeRuntimeAction` already marks context with `ctx.runtimeId` | **Mitigated** — patch skips re-mark when already owned |
| Over-broad ownership for non-pipeline facade callers | Intake/orchestrator also use `executeMissionAction` | **Intended** — facade doc says “runtime-owned execution requests” |
| Weakened orphan detection telemetry | Fewer `orphan_execution` probes for facade path | **Low** — warn probe was noise for legitimate pipeline traffic |

---

## 3. Impact scope

- **Fixed:** All `dispatch_tool` actions routed through `executeMissionAction` (mission pipeline steps including `mission_pipeline_stub`, conditional branches, missions API facade, orchestrator hints).
- **Unchanged:** Direct `dispatchTool()` without facade; Performer capability paths that already call `markRuntimeOwnedContext`.
- **Env:** No change to `.env` required; Stage E can remain `true` once facade marks ownership.

---

## 4. Smallest safe patch

In `executeMissionAction.js` `dispatch_tool` branch:

1. Build `{ ...toolCtx, source }` as today.
2. If context is **not** already `runtimeOwned` / `performerRuntimeOwned`, wrap with
   `markRuntimeOwnedContext(ctx, missionId ?? source)`.
3. Pass owned context to `dispatchTool`.

Do **not** change `assertRuntimeOwnership`, tool registry, or pipeline runner FSM.

**Alternative (not chosen):** Set `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=false` — disables Stage E globally; does not align facade with runtime authority model.

---

## 5. Verification

- With `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true`, run structured store pipeline through conditional steps; stub should return `status: 'ok'`, step `completed`.
- `devBrokerRuntimeProofRoutes` orphan `dispatchTool` should still return `blocked`.
- `executeRuntimeAction` → `executeMissionAction` path: context already owned; `runtimeId` must remain performer runtime id.
