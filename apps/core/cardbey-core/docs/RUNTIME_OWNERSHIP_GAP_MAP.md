# Runtime Ownership Gap Map

**Generated:** 2026-05-27  
**Authority model:** Performer Runtime owns execution when `runtimeOwned` / `performerRuntimeOwned` on dispatch context.  
**Violation probe:** `broker.runtime.violation` (warn by default)

## Legend

| Category | Meaning |
|----------|---------|
| **SAFE** | Owned path or read-only; no runway conflict |
| **WARN** | Executes without ownership; warnings only (default) |
| **BLOCK_CANDIDATE** | Should be blocked after staging validation |
| **LEGACY_ONLY** | Deprecated path; migrate then remove |
| **UNKNOWN** | Needs manual trace in staging |

---

## Entry point matrix

| # | Entry point | File | Runtime kernel? | Ownership | Category |
|---|-------------|------|-----------------|-----------|----------|
| 1 | `performerRuntime.execute()` | `performerRuntime.js` | Yes | Marked | **SAFE** |
| 2 | `executeRuntimeAction()` | `executeRuntimeAction.js` | Facade | Marked inner context | **SAFE** |
| 3 | Intake V2 direct (default) | `performerIntakeV2Routes.js` | No | None | **WARN** → **BLOCK_CANDIDATE** (Stage D) |
| 4 | Intake V2 + `PERFORMER_RUNTIME_ENABLED` | `performerIntakeV2Routes.js` | Yes | Marked | **SAFE** |
| 5 | Intake V2 + `BROKER_DIRECT_VIA_FACADE` | `performerIntakeV2Routes.js` | Facade only | None | **WARN** |
| 6 | Intake V1 direct | `performerIntakeRoutes.js` | No | None | **LEGACY_ONLY** |
| 7 | `executeMissionAction` dispatch_tool | `executeMissionAction.js` | Facade | Caller-dependent | **WARN** |
| 8 | `runMissionUntilBlocked` | `missionPipelineOrchestrator.js` | Optional facade | Pipeline context | **WARN** |
| 9 | `dispatchTaskWithAgentHint` | `agentOrchestrator.js` | Via facade | Mission context | **WARN** |
| 10 | `dispatchOpenClawTask` | `agentOrchestrator.js` | Adapter | No runtime mark | **WARN** |
| 11 | LangChain executor | `agentOrchestrator.js` | Adapter | No runtime mark | **WARN** |
| 12 | MCP `dispatchTool` | `mcpServerRoutes.js` | No | `external_mcp_client` | **WARN** |
| 13 | `executeAnalyzeStoreCapability` | `executeAnalyzeStoreCapability.js` | Partial | Marked | **SAFE** |
| 14 | Offer draft capabilities | `executeCreate/ReviseOfferDraft*.js` | Partial | Marked (no dispatch) | **SAFE** |
| 15 | `executionGateway` | `executionGateway.js` | Injected | Depends on injector | **UNKNOWN** |
| 16 | `publishDraft` / stores | `publishDraftService.js` | N/A | N/A | **SAFE** (non-tool) |
| 17 | Proactive confirm deploy | `performerProactiveStepRoutes.js` | No | Direct services | **LEGACY_ONLY** |
| 18 | Orchestra start + missionId | `miRoutes.js` | No | Guard optional | **BLOCK_CANDIDATE** (Stage D) |

---

## Bypass vs. facade vs. kernel

```
                    ┌─────────────────────────────┐
                    │   performerRuntime.execute   │  Stage B
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   executeRuntimeAction       │
                    └──────────────┬──────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
┌─────────▼─────────┐   ┌─────────▼─────────┐   ┌─────────▼─────────┐
│ executeMissionAction│   │ run_pipeline_step │   │ capability APIs   │
└─────────┬─────────┘   └─────────┬─────────┘   └───────────────────┘
          │                        │
          └────────────┬───────────┘
                       │
              ┌────────▼────────┐
              │   dispatchTool   │  ← ownership assert
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  tool executors  │
              └─────────────────┘

LEGACY BYPASS (default intake V2): intake → dispatchTool (skips both kernel boxes)
```

---

## Staging enforcement sequence

| Stage | Flag | Effect on gaps |
|-------|------|----------------|
| A | `BROKER_DIRECT_VIA_FACADE=true` | Closes #5 partially; still WARN ownership |
| B | `PERFORMER_RUNTIME_ENABLED=true` | Closes #3 → SAFE for intake V2 |
| C | `PERFORMER_RUNTIME_PIPELINE_FACADE=true` | Closes #8 when orchestrator uses runtime |
| D | `BROKER_BLOCK_DIRECT_ACTION=true` | Blocks #3 legacy direct; forces intent/mission path |
| E | `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true` | Blocks all rows without marked context |

---

## Protected workflows (do not block without validation)

| Workflow | Critical paths | Staging note |
|----------|----------------|--------------|
| Store runway | `create_store`, `publishDraft`, catalog tools | Test Stage A–B with store E2E |
| Campaign | proactive routes, offer draft runtime APIs | Keep proactive deploy on LEGACY until facaded |
| Signage | device tools, playlist | MCP + pipeline; test device.sendInput |
| QR | landing / telemetry routes | Non-dispatchTool; SAFE |
| Mission execution | pipeline + orchestra | Stage C before D |
| Artifact lifecycle | execution records, blackboard | Unified stream must stay on |

---

## Metrics and probes (implemented)

| Probe / metric | Purpose |
|----------------|---------|
| `broker.runtime.bypass` | Legacy intake direct dispatch |
| `broker.runtime.violation` | Orphan execution (warn) |
| `broker.runtime.authority` | Snapshot on demand via API |
| `broker.runtime.duplication` | Same mission+tool within 15s |
| In-process counters | `GET /api/broker/runtime-authority` |

---

## Rollback

Unset flags in reverse order (E → D → C → B → A). Keep `PERFORMER_RUNTIME_OWNERSHIP_WARN=true` and `BROKER_EXECUTION_TELEMETRY=true` for observability.
