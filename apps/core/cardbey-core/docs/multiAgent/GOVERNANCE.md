# Multi-Agent Orchestration Governance

## Purpose

Multi-agent and campaign orchestration missions spawn specialist agents that can generate persistent artifacts (graphics, copy, campaign packages). Under PIL and Safe Execution Governance, these paths must follow:

**Observe → Infer → Suggest → Confirm → Execute**

## Confirmation gate

When `MULTI_AGENT_REQUIRE_CONFIRMATION=true` (default), the following require explicit user confirmation before `AgentCoordinator` runs:

| Trigger | Mission type / action |
|---------|------------------------|
| Intake `body.missionType` | `multi_agent`, `campaign_orchestration` |
| Unified dispatch type | `multi_agent`, `campaign_orchestration` |
| High-impact tools | `create_campaign`, `setup_loyalty_program`, `launch_campaign`, etc. |

### First request (not confirmed)

- `unifiedDispatch` returns `status: pending_confirmation`
- Intake maps to `action: approval_required` with `multiAgentStatus: pending_approval`
- **No mission pipeline is created** and agents do not run
- Server records `safeExecutionTrace` with `proposedAction: multi_agent_orchestration`

### Confirmed request

Send `confirmed: true` on the intake body (same pattern as other governed tools).

- Pipeline is created via `createOrchestrationMissionPipeline`
- `runMissionUntilBlocked` starts wave execution
- Trace `confirmationState` is `confirmed`

## Feature flag

```env
# Default: true — require confirmation before orchestration AUTO_RUN
MULTI_AGENT_REQUIRE_CONFIRMATION=true

# Optional: log every governance trace to stdout
MULTI_AGENT_GOVERNANCE_LOG=true
```

Set `MULTI_AGENT_REQUIRE_CONFIRMATION=false` only in controlled dev/staging environments.

## Confirm via API

After a pending orchestration proposal returns `missionId` / `pipelineId`:

```http
POST /api/pipeline/confirm
Authorization: Bearer …
Content-Type: application/json

{ "pipelineId": "<mission-pipeline-id>" }
```

Status check:

```http
GET /api/pipeline/:id/status
```

Alternatively, resubmit intake with `confirmed: true` and the same `missionId`.

## Trusted internal override

Operators with `super_admin`, `platform_admin`, or `admin` may pass `skipConfirmation: true`.

Users listed in `MULTI_AGENT_SKIP_CONFIRMATION_USERS` (comma-separated) may also bypass when `skipConfirmation: true`.

## Server-side audit

Traces are appended via `appendOrchestrationGovernanceTrace` in `src/lib/orchestration/multiAgentGovernance.js`.

Each trace includes:

| Field | Purpose |
|-------|---------|
| `sourceIntent` | User goal / message |
| `missionId` | Pipeline id when created |
| `targetId` | Store id when known |
| `proposedAction` | Always `multi_agent_orchestration` for orchestration handoffs |
| `confirmationState` | `pending` \| `confirmed` \| `not_required` |
| `executedBy` | Actor id |
| `timestamp` | ISO time |

Traces are also stored on mission `metadataJson.safeExecutionTrace` when a pipeline is created.

## Code map

| Module | Role |
|--------|------|
| `src/lib/orchestration/multiAgentGovernance.js` | Confirmation rules + audit trace |
| `src/lib/orchestration/createMissionPipeline.js` | Orchestration pipeline creation with `requiresConfirmation` |
| `src/lib/intake/unifiedDispatch.js` | `dispatchOrchestrationViaKernel` gate |
| `src/routes/performerIntakeV2Routes.js` | Intake entry for `missionType` orchestration |

## Related

- [API Reference](./API_REFERENCE.md)
- [Architecture audit — performer layers](../../../../docs/ARCHITECTURE_AUDIT_PERFORMER_CLEAN_LAYERS.md)
