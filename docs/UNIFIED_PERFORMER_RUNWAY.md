# Unified Performer Runway — Architecture

## Overview

The Performer Runway is Cardbey's single authoritative execution path for all missions. Every confirmed tool execution, factory run, and orchestration handoff routes through the Runtime Kernel via `unifiedDispatch()`.

## Execution Flow

```
Intent → Context → Memory → Planning → Reasoning → Capability Selection → Kernel → Execution
```

Entry surfaces (Intake V2, confirm/approval, proactive steps, factory router) all converge on:

- `apps/core/cardbey-core/src/lib/intake/unifiedDispatch.js`
- `apps/core/cardbey-core/src/lib/runtime/performerRuntime/executeRuntimeAction.js`

## Execution States

| State | Description | Counts as SLO Success? |
|-------|-------------|------------------------|
| `executed` | Real execution with side effects | Yes |
| `partial` | Partial execution | Yes |
| `planned` | Mission planned but not executed | No |
| `blocked` | Blocked (permission, missing config) | No |
| `stubbed` | Placeholder / honest blocker | No |
| `failed` | Attempted but failed | No |

Telemetry helpers: `apps/core/cardbey-core/src/lib/telemetry/executionStates.js`

## Unified Dispatch Coverage

| Path | Status |
|------|--------|
| Intake V2 confirm / tool dispatch | Unified |
| Factory intent router (`run_factory`) | Unified (Phase 8) |
| Mixed lanes (`create_video`, `scan_card`, `code_fix`, `analyze_store`) | Unified (Phases 4–7) |
| Orchestration (`multi_agent`, `campaign_orchestration`) | Unified |
| Campaign activation (`activate_campaigns`) | Governed + confirmation gate |
| Mini website (`create_mini_website`) | Executor with `executionState` tracking |

## Metrics

Control Center and `/api/reliability/slo/status` expose:

- **Real Success Rate** — only `executed` + `partial` observations
- **Stub Count** — `stubbed` executions (24h window)
- **Blocked Count** — `blocked` executions (24h window)
- **Planned Count** — planning-only observations

Dashboard: `RuntimeMetricsPanel` + `ExecutionStateChart` in Control Center → Reliability section.

## Key Files

| Area | File |
|------|------|
| Unified dispatch | `src/lib/intake/unifiedDispatch.js` |
| Factory router | `src/lib/factoryRuntime/factoryIntentRouter.js` |
| Kernel auth | `src/lib/runtime/kernelMandatory.js` |
| SLO / execution stats | `src/services/reliability/sloTracker.js` |
| Observations | `src/lib/runtime/observationBus.js` |
