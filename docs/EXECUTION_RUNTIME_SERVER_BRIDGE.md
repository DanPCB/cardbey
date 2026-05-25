# Execution runtime server bridge (Phase 6)

Phase 6 connects the dashboard **ExecutionIntent** + **ExecutionPlan** skeleton to Cardbey Core `performerRuntime` in **dry-run mode only**. No capabilities are executed, no artifacts are mutated, and no child agents are spawned.

## Purpose

- Validate plans end-to-end against the Core **broker action registry**
- Report **supported** vs **missing** capabilities before real runtime execution (Phase 7+)
- Record **dry_run** telemetry for observability and staging checks

## Flow

```
Next-step chip
  → buildExecutionIntent()
  → planExecution() (local advisory plan)
  → [flag ON] POST /api/performer/runtime/dry-run
  → Core validates registry + prerequisites
  → telemetry: performer_runtime_dry_run
  → [bridge ON] onExecutionDryRunAdvisory → readiness card (Phase 7)
  → dispatchPerformerNextStepAction() — unchanged actionType routing
```

## Dry-run API

**POST** `/api/performer/runtime/dry-run`

Request:

```json
{
  "missionId": "…",
  "intent": { "intentId", "missionId", "actionType", … },
  "plan": { "planId", "status", "steps": […] }
}
```

Response (success):

```json
{
  "ok": true,
  "executionId": "uuid",
  "status": "planned | blocked | unsupported",
  "supportedCapabilities": […],
  "missingCapabilities": […],
  "blockedPrerequisites": […],
  "telemetry": { "mode": "dry_run", … },
  "timestamp": "ISO-8601"
}
```

Core **never** calls `executeRuntimeAction` on this path.

## Dashboard bridge

File: `executionRuntimeBridge.ts`

- `dryRunExecutionPlan(intent, plan)` — HTTP client; returns structured result; never throws
- `scheduleDryRunAdvisory()` — fire-and-forget after intent build; does not block dispatch
- `shouldShowDryRunReadinessCard()` — when to surface a user-facing card (Phase 7)

## Phase 7 — readiness cards

When `VITE_PERFORMER_EXECUTION_SERVER_BRIDGE=1`, dry-run results can render **one** structured Performer message:

| Dry-run status | User-facing card |
|----------------|------------------|
| `planned` | Silent (no card) |
| `blocked` | `execution_capability_readiness` setup/readiness card |
| `unsupported` | Unsupported capability card |
| `missing` broker capability | Capability setup card (e.g. domain not connected) |
| HTTP / bridge error | Swallowed — no card, dispatch unchanged |

### Card type: `execution_capability_readiness`

Fields on `readiness` payload:

- `executionId`, `intentId`, `actionType`, `status`
- `missingCapabilities`, `blockedPrerequisites`, `suggestedSetup`, `detail`, `ctaLabel`

Rendering rules:

- Empty assistant text bubble (`shouldSuppressAgentTextBubble`)
- Dedupe by `executionId + status + actionType` message id
- **Skip** if a `next_step_setup_required` card already exists for the same `actionType` / prerequisite (no duplicate surfaces)

Examples:

- “Domain setup is not connected yet”
- “Store analytics needs a published store”
- “Offer creation capability is not enabled”
- “This capability is not available in this environment”

Files:

- `executionCapabilityReadiness.ts` — map dry-run → payload
- `executionCapabilityReadinessCard.tsx` — stream UI
- `injectExecutionCapabilityReadinessMessage` in `usePerformerConsole`

## Feature flags

| Env | Default | Effect |
|-----|---------|--------|
| `VITE_PERFORMER_EXECUTION_INTENTS` | ON | Build intent before dispatch |
| `VITE_PERFORMER_EXECUTION_PLANNER` | OFF | Attach `advisoryPlan` on intent |
| `VITE_PERFORMER_EXECUTION_SERVER_BRIDGE` | **OFF** | Call Core dry-run after intent build |

Unset or `0` on the server bridge restores **zero** HTTP bridge behavior.

## Rollback

1. Remove or unset `VITE_PERFORMER_EXECUTION_SERVER_BRIDGE` in dashboard env.
2. No Core config change required — route is inert if never called.
3. Dispatch, intake forcing, artifact actions, and lifecycle rows behave as Phase 4–5.

## What is NOT in Phase 6–7

- Real capability execution (`executeRuntimeAction`)
- Child agent spawning (`ExecutionAgentHost`)
- Artifact mutations from the bridge
- Replacing `dispatchPerformerNextStepAction` routing
- AI planner
- Blocking dispatch when dry-run fails

## Related docs

- [EXECUTION_CAPABILITY_SKILL_MODEL.md](./EXECUTION_CAPABILITY_SKILL_MODEL.md) — capability / skill / planner model
