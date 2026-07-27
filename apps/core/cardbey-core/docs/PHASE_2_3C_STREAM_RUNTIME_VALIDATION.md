# Phase 2.3-C — Stream-First Runtime Observability Validation

Status: implemented, default OFF. Read-only / additive. No execution authority changes.

## Goal

Move runtime observation from **poll-first + stream-secondary** to **stream-first + polling-fallback**,
reducing polling amplification, repeated SQLite reads, and repeated mission-state reconstruction —
**without** changing execution authority, the Mission FSM, dispatch, or pipeline semantics.

Performer Runtime remains the ONLY execution authority. Single Runway is untouched.

## Non-goals (hard constraints honored)

- No dispatch / pipeline / execution / orchestration-authority changes.
- No Redis (in-memory only).
- No autonomous execution; every response carries `{ executable: false, advisoryMode: "read_only" }`.
- Observability modules do **not** import `dispatchTool`, `executeMissionAction`,
  `performerRuntime.execute`, or pipeline-mutation modules (verified — see "Hard separation").

## Feature flags (default OFF)

| Flag | Effect |
|------|--------|
| `PERFORMER_STREAM_FIRST_RUNTIME` | Enables RuntimeSnapshot read model, the blackboard→snapshot stream hook, and `/api/broker/runtime-observability` + `/api/broker/runtime-snapshot/:missionId`. |
| `PERFORMER_RUNTIME_SNAPSHOT_CACHE` | Enables the in-memory mission snapshot cache + bounded reconnect replay buffer. |
| `PERFORMER_ADAPTIVE_POLLING` | Emits `pollingMode` guidance (`STREAM_PRIMARY` / `POLL_FALLBACK` / `RECOVERY_MODE`). |

When all are OFF, behavior is byte-for-byte the previous Stage E behavior:
the stream hook short-circuits, the cache returns null, and the routes return `403 stream_first_runtime_disabled`.

## New modules (`src/lib/runtime/observability/`)

| Module | Responsibility |
|--------|----------------|
| `runtimeSnapshotReadModel.js` | `buildRuntimeSnapshot(missionId, opts)` — materializes mission status, runtime/orchestration state, recent blackboard events, reasoning/execution/governance summaries, coordination pressure, active agents, latest artifacts. Tolerates partial data; never throws. Coalesced + cached. |
| `missionRuntimeSnapshotCache.js` | Mission-scoped in-memory cache: TTL (15s), entry cap (200), bounded replay ring buffer (100/mission), cleanup interval. `getCachedSnapshot`/`setCachedSnapshot`/`recordStreamEvent`/`getReplaySince`. |
| `runtimeQueryCoalescer.js` | In-flight promise dedupe — multiple simultaneous identical reads share one producer (counts avoided DB reads). |
| `runtimeObservabilityMetrics.js` | In-process counters: cache hits/misses, coalesced queries, avoided DB reads, replay served, SSE healthy/unhealthy, polling-mode activations, hit rate, polling reduction rate. |
| `adaptivePollingGuidance.js` | `buildAdaptivePollingGuidance({ sseHealthy, lastSseEventAgeMs, orchestrationActive, terminal })` → `pollingMode` + interval. |
| `runtimeSnapshotStreamHook.js` | `onRuntimeEventAppended(missionId, event)` — fire-and-forget, flag-gated, try/catch-wrapped hook invoked from `missionBlackboard.appendEvent` / `appendEventBatch`. Pushes events into replay buffer + invalidates snapshot (stream-first). |

## Stream-first wiring

- `missionBlackboard.appendEvent` and `appendEventBatch` call `onRuntimeEventAppended(...)` after a
  successful write. The hook is a no-op unless `PERFORMER_STREAM_FIRST_RUNTIME=true`, never awaits the
  DB, and never throws into the write loop.
- Each appended event updates the mission's replay buffer and marks the cached snapshot stale, so the
  next read rebuilds **incrementally** instead of from scratch.

## APIs (`/api/broker`, gated by `PERFORMER_STREAM_FIRST_RUNTIME`)

| Route | Auth | Returns |
|-------|------|---------|
| `GET /runtime-observability` | `requireAuth` | Process metrics: cache hit/miss, hit rate, coalesced queries, avoided DB reads, polling reduction rate, SSE health, cache stats, in-flight coalesced count. |
| `GET /runtime-snapshot/:missionId?eventWindow=&force=&afterSeq=` | `requireAuth` + mission access (admin/super_admin bypass) | RuntimeSnapshot + SSE health + adaptive `pollingGuidance`. |
| `GET /runtime-snapshot/:missionId/replay?afterSeq=` | `requireAuth` + mission access | Bounded reconnect replay (recent events only, no full history). |

## Dashboard SSE-first bridge (additive, opt-in)

`apps/dashboard/.../src/app/mission/executionRuntimeStreamBridge.ts`

- Subscribes a mission to a single agent-chat SSE stream + coalesced `runtime-snapshot` endpoint.
- `STREAM_PRIMARY`: snapshot refreshed on stream activity, slow safety poll (~20s).
- `POLL_FALLBACK`: SSE down → resume normal polling (~4s).
- `RECOVERY_MODE`: SSE recovered → brief catch-up (~1.5s) then stream-primary.
- Existing pollers (`missionProjectionSource`, `BlackboardFeed`) are untouched; components opt in.

## Hard separation (verified)

`runtimeSnapshotReadModel.js` imports only: `missionBlackboard.getEvents`, `brokerFlags`, the
coalescer/cache/metrics, and lazy dynamic imports of read-only resolvers
(`missionPipelineResolver.resolveMissionState`) and governance read models
(`buildCoordinationGraph`, `summarizeGovernance`, `computeCoordinationPressure`). No execution/dispatch/
pipeline-mutation imports anywhere in `src/lib/runtime/observability/`.

## Tests

`src/lib/runtime/observability/*.test.js` — 11 tests, all passing:

- `adaptivePollingGuidance.test.js` — flag gating + STREAM_PRIMARY / POLL_FALLBACK / RECOVERY_MODE.
- `missionRuntimeSnapshotCache.test.js` — flag gating, store/read, stream-first invalidation, bounded replay, stats.
- `runtimeQueryCoalescer.test.js` — concurrent reads coalesced to one producer; avoided-DB-read metrics.

## Soak

Run with Stage E stable flags + Phase 2.3-C flags ON:

```
PERFORMER_STREAM_FIRST_RUNTIME=true
PERFORMER_RUNTIME_SNAPSHOT_CACHE=true
PERFORMER_ADAPTIVE_POLLING=true
PERFORMER_AGENT_GOVERNANCE=true
PERFORMER_ORCHESTRATION_STABILITY=true
PERFORMER_BLACKBOARD_BATCHING=true
PERFORMER_DEVICE_PRESENCE_DEBOUNCE=true
```

```
node scripts/stage-e-soak.mjs
SOAK_USER_ID=... node scripts/stage-e-governance-soak.mjs
```

### PASS conditions

- `orphanWarnings=0`
- `ownershipBlocks=0`
- `duplicationWarnings=0`
- `bypassDirectDispatch=0`

PLUS:

- snapshot cache hit rate visible (`/runtime-observability` → `metrics.cacheHitRate > 0`)
- coalesced queries / avoided DB reads visible
- adaptive `pollingMode` returned on `/runtime-snapshot/:missionId`
- SSE reconnect replay returns recent events after a seq cursor
- no runtime authority regression, no duplicate execution, no mission corruption

## Results

Soak executed with all Phase 2.3-C + Stage E stability flags ON
(`node scripts/stage-e-soak.mjs` and `SOAK_USER_ID=... node scripts/stage-e-governance-soak.mjs`).

### `stage-e-governance-soak.mjs` — PASS

```
[gov-soak] ✅ coordination-graph { events: 27 }
[gov-soak] ✅ agent-governance { pressure: 'LOW', spawnAmplification: 0.667, retryAmplification: 0, warnings: {…all empty} }
[gov-soak] ✅ coordination-pressure LOW 22
[gov-soak] ✅ blackboard batching reduced write amplification { batchCountDelta: 7, batchEventCountDelta: 25 }
[gov-soak] ✅ runtime-snapshot { latestSeq: 27, orchestrationState: 'complete', activeAgents: 7, pollingMode: 'STREAM_PRIMARY' }
[gov-soak] ✅ runtime-observability { cacheHits: 1, cacheMisses: 1, cacheHitRate: 0.5, pollingReductionRate: 0.5, trackedMissions: 1, sseHealthy: true }
[gov-soak] ✅ runtime-snapshot replay { bufferedEvents: 27, lastSeq: 27, replayAvailable: true }
[gov-soak] PASS governance + stability probe
```

### `stage-e-soak.mjs` — PASS

```
[soak] metrics(delta) { bypassDirectDispatch: 0, bypassFacade: 0, bypassRuntimeKernel: 0,
                        orphanWarnings: 0, ownershipBlocks: 0, duplicationWarnings: 0, executionFailures: 0 }
[soak] PASS Stage E soak (normal flows): no orphan/ownership/duplication/bypass deltas
```

### Summary

| Metric | Result |
|--------|--------|
| Snapshot cache hit rate | 0.5 (1 hit / 1 miss on the 2 probe reads) — cache functioning |
| Stream-first replay buffer | 27 events buffered, `replayAvailable: true` — stream hook fed buffer |
| `pollingMode` | `STREAM_PRIMARY` (SSE healthy) — adaptive guidance working |
| Polling reduction rate | 0.5 (fraction of reads served from cache) |
| SSE health | healthy |
| Stage E orphan/ownership/duplication/bypass | 0 / 0 / 0 / 0 — no authority regression |
| Blackboard batching | 25 logical events in 7 writes (ratio 3.57) — still reducing amplification |
| Coordination pressure | LOW (22), no spawn/retry/orphan warnings |

Notes: `coalescedQueries`/`avoidedDbReads` were 0 in this single-client soak because reads were
sequential (coalescing only fires under concurrent identical reads, e.g. multiple dashboard panels
hitting a hot mission simultaneously). The cache hit + replay paths are exercised and verified.
Pre-existing environment gaps (`QR create+resolve` 404, `store publish` skipped) are unrelated to
this phase and do not affect the authority metrics.
