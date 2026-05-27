# Execution Duplication Report

**Generated:** 2026-05-27  
**Detection:** `detectExecutionDuplication` in `runtimeAuthorityStaging.js`  
**Flag:** `PERFORMER_RUNTIME_DUPLICATION_DETECT` (default **true**)

## Summary

Duplication risks fall into three classes:

1. **Telemetry duplication** — multiple `broker.execution` probes for one logical action  
2. **Execution duplication** — same tool dispatched twice for same mission  
3. **Stream / artifact duplication** — multiple events or artifacts for one user action  

---

## Telemetry duplication

### Pattern A: Runtime facade + dispatchTool (FIXED)

| Layer | Probes |
|-------|--------|
| `executeRuntimeAction` | started + completed |
| `dispatchTool` | started + completed |

**Mitigation:** Inner context `skipNestedBrokerTelemetry: true` set by `executeRuntimeAction`. Metric: `telemetrySkippedNested`.

### Pattern B: Pipeline step + tool (ACCEPTED)

| Layer | Probes |
|-------|--------|
| `run_pipeline_step` | `pipeline:run_next_step` |
| Tool dispatch | `tool:{name}` |

**Status:** Layered telemetry is intentional for pipeline observability. Do not collapse without Phase 2 graph model.

### Pattern C: Dry-run + execute (SAFE)

Dry-run records advisory telemetry only; no executor run.

---

## Execution duplication

### Detection key

```
{missionId}|{toolName or actionId}|{source}
```

Window: **15 seconds** (in-process; resets on restart).

Probe: `broker.runtime.duplication` with `priorCount`.

### High-risk call sites

| Site | Scenario |
|------|----------|
| Intake V2 double confirm | User double-submit |
| Dashboard `executeCapabilityPlan` retry | Retry button + auto-run |
| `runMissionUntilBlocked` loop | Step retry without idempotency |
| MCP client retry | External client |

### Recommended idempotency (future, not implemented)

- Pass `executionId` from UI through to `dispatchTool` context
- Dedupe on `executionId` in addition to mission+tool window

---

## Stream event duplication

| Event pair | Cause |
|------------|-------|
| `completed_action` + `runtime.execution.completed` | Intake + runtime both emit |
| Duplicate `reasoning_line` | Agent loop steps |

**Mitigation:** UI dedupe by `(eventType, correlationId)` where available.

---

## Artifact duplication

| Path | Risk |
|------|------|
| Offer draft create twice | Client retry without `executionId` |
| Catalog replace + publish | Separate services; not duplication but sequence-sensitive |

**Guard:** Dashboard `executionRecords` upsert by `executionId` when persist enabled.

---

## Race conditions

| Area | Risk | Notes |
|------|------|-------|
| Concurrent pipeline steps | Low | Sequential orchestrator |
| Parallel HTTP direct tools | Medium | Same mission; duplication detect catches |
| OpenClaw child spawn | Medium | Telemetry now wrapped |

---

## Monitoring

```bash
# In-process metrics
curl -s http://localhost:3001/api/broker/runtime-authority | jq '.metrics.duplicationWarnings'

# Health probes (DB)
# Query TelemetryProbe where tag = 'broker.runtime.duplication'
```

---

## Staging acceptance

| Test | Pass criteria |
|------|---------------|
| Single tool via runtime | Exactly 1 logical telemetry pair at tool layer + 1 at runtime layer |
| Double-click intake confirm | `duplicationWarnings` increments; probe emitted |
| Pipeline 3-step mission | Layered pipeline + tool probes; no duplicate tool:* within same step |
