# Impact Report: Topology Executor Node Instrumentation

**Date:** 2026-07-09  
**Scope:** Emit per-node execution telemetry and surface ✓/✗ + reason in TopologyReview UI.

## Problem

Loyalty (and other) topology approve/execute fails with a generic client error:

`400 Bad Request Execution plan approved — topology execution failed`

Node-level status already exists in `MissionPipeline.metadataJson` (`topologyNodeStatus` / `topologyNodeOutputs`), but:

1. Topology runner does not emit blackboard / reasoning / timeline events.
2. TopologyReviewCard steps tab shows labels only (no ✓/✗).
3. `POST …/topology-decision` returns HTTP 400 when `ok: false` after approve+execute, so the UI catch path stringifies status text.

## What could break

| Risk | Why | Scope |
|------|-----|--------|
| Extra blackboard writes under load | One event per node lifecycle stage | All topology executions (campaign + loyalty) |
| Reasoning feed noise | One line per node start/finish | SSE / reasoning log consumers |
| Approve HTTP semantics | Failed execution returns 200 + `ok:false` / `status:failed` instead of 400 | TopologyReviewCard approve/retry |
| UI shows failed reason from metadata | Requires refresh after execute | TopologyReviewCardSlot failed mode |

## Smallest safe patch

1. Add `topologyExecutionTelemetry.js` — emit blackboard events, reasoning lines, and append `executionTimeline[]` via metadata.
2. Instrument `runTopologyNodes` / `dispatchTopologyNode`: started, tool invoked, input, output, validation errors, exceptions, finished.
3. Topology-decision: return **200** when plan was approved but execution failed (`status: 'failed'`), keep **400** for validation-only failures; include `nodeRun` / human message with first failure reason.
4. UI: pass `nodeStatus` / `nodeOutputs` into card; Steps + Summary show ✓/✗ and reason; prefer API `execution.nodeRun` on approve failure before refresh.

## Out of scope

- Redesigning loyalty tool collapse (N× `setup_loyalty_program`)
- Routing topology through `toolDispatcher`
- OCR / intake spine changes
