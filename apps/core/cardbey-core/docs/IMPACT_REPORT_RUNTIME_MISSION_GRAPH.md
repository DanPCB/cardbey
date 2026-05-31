# Impact Report: Runtime Mission Graph (Phase C)

**Date:** 2026-05-31  
**Trigger:** Evolve linear proactive orchestration into persistent mission graph foundation.

## What could break

| Area | Risk | Why |
|------|------|-----|
| **Phase B linear orchestrator** | Low | Graph path gated behind `ENABLE_RUNTIME_MISSION_GRAPH` + `ENABLE_RUNTIME_GRAPH_SCHEDULER`; flags OFF → Phase B unchanged. |
| **Proactive plan metadata** | Low | Graph stored additively in `metadataJson.runtimeMissionGraph`; linear `proactivePlanSteps` preserved. |
| **Step execution mapping** | Medium | Graph nodes map to `executeMissionStep` via `metadata.stepNumber`; idempotency relies on existing kernel. |
| **Blackboard volume** | Low | Additional `runtime.graph.*` events; same append path. |
| **Artifact memory** | Low | Graph lineage is additive metadata; existing artifact memory unchanged. |

## Why

Phase B owns sequencing but uses linear step order. Multi-agent campaigns require durable DAG primitives before distributed execution.

## Impact scope

- New: `runtimeMissionGraphService`, `runtimeGraphScheduler`, `runtimeGraphExecutionState`, `runtimeGraphArtifactLineage`, `runtimeGraphBlackboardBridge`, `runtimeMissionGraphOrchestrator`
- Modified: `runtimeMissionOrchestrator.js` (delegates when graph flags ON), `runtimeCapabilitiesService.js`, `unifiedRuntimeStream.js`
- No frontend orchestration changes; graph events flow through existing blackboard stream.

## Smallest safe patch

1. Add graph modules behind dual flags (default OFF).
2. Auto-convert linear proactive plans to sequential graph on first graph orchestration call.
3. Scheduler returns executable nodes only; tool dispatch remains `executeMissionStep`.
4. Rollback: disable flags → Phase B linear path.

## Rollback

Set `ENABLE_RUNTIME_MISSION_GRAPH=false` and `ENABLE_RUNTIME_GRAPH_SCHEDULER=false`.
