# Impact Report: Multi-agent campaign stall after plan approval

**Date:** 2026-08-10  
**Status:** Implement smallest safe patch (no blanket auto-execute)

## Symptom

After **Approve & Execute**, chat shows “Execution plan approved. Executing…”, but sidebar/header stay on **Waiting for your choice / Needs your approval**, and Execution history shows “No persisted executions… when persistence is enabled.”

## Root cause (code-traced)

1. **UI status desync** — `ConversationMissionStatusBar` often uses only `activeMission.status`. Projection sync can re-pin `awaiting_confirmation` after approve even when metadata shows topology approved/queued/executing.
2. **`pendingTopology` not cleared on promote** — `promotePendingToApproved` copies to `approvedTopology` but leaves `pendingTopology`, so `readTopologyArtifactsFromState` can still treat the plan as pending HITL.
3. **Async topology errors swallowed** — `scheduleTopologyExecution` catch records diagnostics but does not set `multiAgentStatus: failed`, so the UI never reaches Retry chrome.
4. **Misleading inspector copy** — empty state refers to PerformerExecutionRecords persistence (`VITE_PERFORMER_EXECUTION_RECORDS_PERSIST`), not topology DAG runs. There is no `PERSISTENCE_ENABLED` / `HITL_AUTO_EXECUTE`.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Loyalty/campaign remount no longer shows Approve card | Clearing `pendingTopology` | Keep `approvedTopology`; pending mode still uses `approvalStatus` / `multiAgentStatus` / pipeline `awaiting_confirmation` |
| Reopen-completed-for-retry edge case | `canReopenCompletedTopologyMission` required `pendingTopology` | Also accept `approvedTopology` when status is approved/pending |
| False “running” after reject | Optimistic status flip | Only avoid regressing when metadata shows approve/executing; reject path unchanged |
| Governance bypass | “Auto-execute without confirm” | **Out of scope** — plan Approve & Execute remains the confirmation checkpoint |

## Impact scope

- Core: `metadataWriter.promotePendingToApproved`, `topologyReviewService.scheduleTopologyExecution`, `canReopenCompletedTopologyMission`
- Dashboard: topology pending detection, ActiveMission projection sync, ConversationMissionStatusBar + inspector empty copy

## Smallest safe patch

1. Clear pending topology/policy/reasoning on promote; reopen helper uses approved topology too.
2. On async topology failure: write failed metadata (+ best-effort pipeline failed).
3. Dashboard: do not treat approved topology as pending; do not regress active mission to awaiting_confirmation after topology approve; pass projection into status bar; clarify inspector empty hint.

## Explicitly not doing

- Enabling invented `PERSISTENCE_ENABLED` / `HITL_AUTO_EXECUTE`
- Silent campaign publish / bypassing safe-execution governance
- Flipping `MULTI_AGENT_EXECUTE` DeepSeek path as the topology Approve handler
