# Impact Report: Durable Worker Queue + Lease Recovery (Phase E)

**Date:** 2026-05-31  
**Trigger:** Evolve single-process worker execution into durable recoverable execution semantics.

## Pre-implementation audit summary

| Area | Current state (Phase D) | Gap addressed |
|------|------------------------|---------------|
| **Worker persistence** | `metadataJson.runtimeWorkerState.workers[]` | Orphan detection + recovery candidates |
| **Lease persistence** | `runtimeWorkerState.leases[]`; `expireStaleLeases` marks expired | Recovery eligibility + reclaim + requeue |
| **Heartbeat** | Single touch before `executeMissionStep` | Periodic scan; stale → recovery candidate |
| **Retry** | Skill executor + graph node retries | Durable `retry_scheduled` queue items |
| **Graph node lifecycle** | `runtimeMissionGraph.nodes[].status` | Stuck `running` → requeue after recovery |
| **Restart recovery** | Graph/workers persist in metadata | Queue + replay protection survive reload |
| **Artifact lineage** | Append-only on node completion | Dedupe by `artifactRef` per node |
| **Blackboard** | Worker/skill/graph events | Additive queue/recovery/replay events |
| **Failure modes** | Lease conflict, direct fail | Crash/stale/orphan → reclaim without duplicate exec |

## What could break

| Area | Risk | Why |
|------|------|-----|
| **Phase D direct execution** | Low | Queue path gated behind 4 flags (default OFF) |
| **Graph scheduler** | Low | Scheduler unchanged; only enqueue hook added post-schedule |
| **Completed node re-exec** | Medium | Replay protection blocks unless retryable/forceRetry |
| **Queue ordering** | Low | FIFO by priority + enqueuedAt within mission metadata |

## Smallest safe patch

1. Add queue/recovery modules in `metadataJson` (no schema migration).
2. Graph orchestrator: when flags ON → enqueue → claim → Phase D skill execute → complete queue item.
3. Heartbeat monitor runs at start of each graph orchestration tick.
4. Rollback: disable flags → Phase D unchanged.

## Rollback

Set all Phase E flags to `false`:
`ENABLE_RUNTIME_EXECUTION_QUEUE`, `ENABLE_RUNTIME_LEASE_RECOVERY`, `ENABLE_RUNTIME_REPLAY_PROTECTION`, `ENABLE_RUNTIME_HEARTBEAT_MONITOR`
