# Broker Telemetry Coverage Report

**Generated:** 2026-05-27  
**Scope:** `apps/core/cardbey-core` execution paths  
**Probe tag:** `broker.execution` (via `emitHealthProbe` / `TelemetryProbe`)

## Summary

| Category | Count |
|----------|-------|
| Primary execution entry points audited | 12 |
| Paths with `broker.execution` on success path | 8 |
| Paths with partial / conditional telemetry | 3 |
| Paths without broker telemetry (by design) | 4+ |
| Duplicate telemetry risk (nested wrappers) | 2 patterns |

Telemetry is **enabled by default** (`BROKER_EXECUTION_TELEMETRY=true`). Runtime kernel path now sets `skipNestedBrokerTelemetry` on inner `dispatchTool` to avoid double-counting when `executeRuntimeAction` already records start/complete.

---

## Covered execution paths

### 1. `dispatchTool` (`lib/toolDispatcher.js`)

| Check | Status |
|-------|--------|
| `broker.execution` started/completed | Yes (`withExecutionTelemetry`) |
| `actionId` | Yes (`tool:{toolName}`) |
| `missionId` | Yes when present in context |
| `intentId` | Yes when present |
| `runtimeId` | On record when passed via runtime-owned context (facade metadata) |
| Nested skip | Yes when `context.skipNestedBrokerTelemetry === true` |

**Early exits without telemetry (silent):**

- Ownership block (`PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true`)
- Invalid / empty tool name
- Tool not registered
- Missing executor
- Proactive-only passthrough (`code_fix`)
- `device.sendInput` validation failure

These return structured errors but **do not emit** `broker.execution`. Use `broker.runtime.violation` for ownership blocks.

### 2. `executeMissionAction` (`lib/execution/executeMissionAction.js`)

| `actionType` | Telemetry |
|--------------|-----------|
| `dispatch_tool` | Delegates to `dispatchTool` (full telemetry) |
| `run_pipeline_step` | `withExecutionTelemetry` on `pipeline:run_next_step` |

### 3. `executeRuntimeAction` (`lib/runtime/performerRuntime/executeRuntimeAction.js`)

| Check | Status |
|-------|--------|
| `recordExecutionTelemetry` started + terminal | Yes |
| `runtimeId` | Yes |
| `executionSource` | `performer_runtime` |
| Inner `dispatchTool` | Skips nested telemetry via `skipNestedBrokerTelemetry` |
| Duplication detect | `detectExecutionDuplication` (staging) |

### 4. Mission pipeline (`missionPipelineRunner` → `dispatchTaskWithAgentHint`)

| Step | Telemetry |
|------|-----------|
| Pipeline step advance | `pipeline:run_next_step` when via `executeMissionAction` |
| Tool dispatch (`agentHint: dispatchTool`) | `tool:*` via `executeMissionAction` → `dispatchTool` |
| OpenClaw (`agentHint: openclaw`) | **Added:** `withExecutionTelemetry` source `openclaw_bridge` |
| LangChain (`agentHint: langchain`) | **Added:** `withExecutionTelemetry` source `langchain_executor` |

### 5. `runMissionUntilBlocked` (`missionPipelineOrchestrator.js`)

Uses `executeMissionAction` or `executeRuntimeAction` (when `PERFORMER_RUNTIME_PIPELINE_FACADE=true`). Inherits telemetry from facade choice.

### 6. Performer intake V2 direct tools (`performerIntakeV2Routes.js`)

| Branch | Telemetry |
|--------|-----------|
| `PERFORMER_RUNTIME_ENABLED` | Runtime + nested skip |
| `BROKER_DIRECT_VIA_FACADE` | Facade → dispatchTool |
| Default (legacy) | dispatchTool only; bypass probe `broker.runtime.bypass` |

### 7. Performer intake V1 (`performerIntakeRoutes.js`)

Direct `dispatchTool` — telemetry via dispatcher; **no runtime ownership** unless caller sets flags.

### 8. MCP server (`mcpServerRoutes.js`)

`dispatchTool` with `missionId: null`, `source: external_mcp_client`. Telemetry fires; missionId often **missing**.

### 9. Capability executors (runtime API)

| Executor | dispatchTool? | Telemetry |
|----------|---------------|-----------|
| `executeAnalyzeStoreCapability` | Yes (owned context) | Yes |
| `executeCreateOfferDraftCapability` | No (builder only) | Artifact path separate |
| `executeReviseOfferDraftCapability` | No | Artifact path separate |

### 10. Dry-run (`dryRunExecutionPlan.js`)

Records single `broker.execution` with status `planned` / advisory — **no tool execution**.

### 11. `missionsRoutes` manual step

`executeMissionAction` — covered.

### 12. `agentOrchestrator.runAgentOrchestratedMissionUntilBlocked`

Delegates to `runMissionUntilBlocked` — covered.

---

## Missing or weak telemetry paths

| Path | Issue | Risk | Recommendation |
|------|-------|------|----------------|
| `publishDraft` / store routes | Service-level, not `dispatchTool` | Silent vs broker index | Document as **non-broker**; optional future `broker.publish` probe |
| `performerProactiveStepRoutes` | Direct `promotionContentGenerator` / deployer | Campaign bypass | WARN; Stage D+ review |
| Orchestra `/api/mi/orchestra/start` | Separate job runner | Bypass when `missionId` in body | Guard exists (`guardBrokerOrchestraStart`) |
| Ownership-blocked dispatch | No `broker.execution` | Under-count failures | Emit `broker.execution` status `blocked` (future) |
| Pre-telemetry validation failures | No probe | Silent failures | Optional `broker.execution` blocked record |

---

## Duplicated telemetry risks

| Pattern | Layers | Mitigation |
|---------|--------|------------|
| `executeRuntimeAction` → `dispatchTool` | Runtime started/complete + tool started/complete | **`skipNestedBrokerTelemetry`** on inner context (implemented) |
| `run_pipeline_step` + tool dispatch | `pipeline:run_next_step` + `tool:*` | **Acceptable layered** for staging; document as parent/child |
| Retry / double-click UI | Same mission + tool within 15s | **`detectExecutionDuplication`** → `broker.runtime.duplication` |

---

## Orphan execution sources (no runtime ownership)

Sources that call `dispatchTool` without `markRuntimeOwnedContext`:

- Default intake V2 direct path
- Intake V1 direct path
- MCP external client
- Mission pipeline (until runtime facade enabled)
- `executionGateway` (injected dispatchTool)

See `RUNTIME_OWNERSHIP_GAP_MAP.md` for classification.

---

## Verification commands

```bash
# Registry counts
node -e "import { listBrokerActions, listAgentCapabilities } from './src/lib/broker/index.js'; console.log(listBrokerActions().length, listAgentCapabilities().length)"

# Staging snapshot
curl -s http://localhost:3001/api/broker/runtime-authority | jq .

# Unit tests
npx vitest run src/lib/broker src/lib/runtime/performerRuntime/runtimeAuthorityStaging.test.js
```

---

## Staging rollout telemetry expectations

| Stage | Env | Expected probe pattern |
|-------|-----|------------------------|
| A | `BROKER_DIRECT_VIA_FACADE=true` | Intake direct → `performer_intake_facade` source |
| B | `PERFORMER_RUNTIME_ENABLED=true` | `performer_runtime` + single tool telemetry (nested skip) |
| C | `PERFORMER_RUNTIME_PIPELINE_FACADE=true` | Pipeline steps via `executeRuntimeAction` |
| D | `BROKER_BLOCK_DIRECT_ACTION=true` | Blocked intake; `broker.execution` status `blocked` |
| E | `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true` | Orphan sources fail with `RUNTIME_OWNERSHIP_REQUIRED` |
