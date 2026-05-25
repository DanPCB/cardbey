# Execution capability / skill model (Performer runtime)

Phase 5 introduces a **read-only planner skeleton** for Cardbey Performer next-step execution. User-visible behavior is unchanged; dispatch still routes by `actionType` as in Phase 4.

## Concepts

| Concept | Role |
|--------|------|
| **ExecutionIntent** | Structured goal envelope: mission, artifacts, prerequisites, capability hints, optional `advisoryPlan`. |
| **Planner** | Maps `ExecutionIntent` → `ExecutionPlan` (deterministic, no AI in Phase 5). |
| **Capability** | Single deterministic primitive the runtime can invoke (modal, intake tool, core API, integration). |
| **Skill** | Reusable multi-step workflow composed of capabilities (e.g. launch first offer). |
| **Agent** | Future runtime host for delegated child runs (QA, sub-planner); not invoked yet. |
| **Artifact** | Execution target and mutation surface (preview, publish flow, capability bridge). |

## Layering

```
User chip / suggestion
    → ExecutionIntent (Phase 4)
    → planExecution() → ExecutionPlan (Phase 5, advisory)
    → [future] ExecutionRuntime.execute()
        → CapabilityRunner | WorkflowSkill | ExecutionAgentHost
    → Artifact mutations + lifecycle events
```

Today only the first three steps exist for intents; **dispatch does not execute plans**.

## Capability catalog

Defined in `executionPlanner/capabilityCatalog.ts`.

| ID | Kind | Maps from next-step |
|----|------|---------------------|
| `replace_catalog` | `client_action` | `update_product_catalog` |
| `publish_store` | `client_action` | `connect_custom_domain` (step 1) |
| `connect_domain` | `client_action` | `connect_custom_domain` (step 2) |
| `analyze_store` | `intake_tool` | `review_store_performance` |
| `create_offer` | `intake_tool` | `launch_first_offer` (via skill) |

Kinds: `client_action` | `intake_tool` | `core_runtime` | `external_integration` | `skill`

## Skill catalog

Defined in `executionPlanner/skillCatalog.ts`.

| Skill ID | Status |
|----------|--------|
| `launch_first_offer` | Active — template steps use `create_offer` capability |
| `setup_online_presence` | Placeholder |
| `optimize_storefront` | Placeholder |

## Planner

`executionPlanner/planExecution.ts`:

- `planExecution(intent)` — deterministic steps, `ready` | `blocked` | `unsupported`
- Prerequisites on the plan mirror intent prerequisites (advisory only)
- Unknown `actionType` → unsupported plan with empty steps

## Runtime interfaces (skeleton)

`executionRuntime/types.ts` defines:

- `ExecutionRuntime`, `ExecutionContext`, `ExecutionHandle`
- `CapabilityRunner`, `WorkflowSkill`, `ExecutionAgentHost`

No `execute()` implementation is wired in Phase 5.

## Feature flags

| Env | Default | Effect |
|-----|---------|--------|
| `VITE_PERFORMER_EXECUTION_INTENTS` | ON | Build `ExecutionIntent` before dispatch |
| `VITE_PERFORMER_EXECUTION_PLANNER` | **OFF** | Attach `advisoryPlan` on intent at build time |

Dispatch behavior is identical with or without the planner flag.

## File layout

```
performer/
  executionIntent.ts
  executionRuntime/types.ts
  executionPlanner/
    capabilityCatalog.ts
    skillCatalog.ts
    planExecution.ts
```

## Phase 6+ (not started)

- `ExecutionRuntime.execute(plan)` routing to capability runners
- Server `executeRuntimeAction` bridge
- Child agent host behind `ExecutionAgentHost`
- AI planner replacing deterministic `planExecution` mapping
