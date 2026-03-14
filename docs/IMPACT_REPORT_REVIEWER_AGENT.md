# Impact Report: Reviewer Agent Integration

## Summary
Lightweight Reviewer Agent for `plan_update`: optional (off by default), additive only. No refactors to chat or task execution engine.

## What could break
- **If ENABLE_REVIEWER is set to `true` in production**: Reviewer runs after every plan_update; if the reviewer executor throws or the DB/context merge fails, the run fails but task creation and execution_suggestions flow are already done (reviewer is fire-and-forget). So existing workflows are not blocked.
- **Mission.context.review**: New key merged into context; no existing keys removed. Old missions without `context.review` behave as before; UI only gates when `review.status === 'changes_requested'` and `review.planMessageId` matches the current chain’s plan.

## Why
- Reviewer is triggered only when `ENABLE_REVIEWER=true` (default `false`).
- Task creation and maybeAutoDispatch run unchanged; reviewer run is started in parallel and does not block them.
- Gating is UI-only: Execute is disabled when review status is `changes_requested` for the same plan; "Revise plan" dispatches a new planner run.

## Impact scope
- **Core**: New agentKey `reviewer`, new messageType `review_result`, new `reviewerExecutor.js`, `agentRunExecutor.js` (reviewer branch), `agentMessage.js` (trigger when ENABLE_REVIEWER), `missionsRoutes.js` (validation for `review_result`), `chainPlan` already had `createdFromMessageId`.
- **Dashboard**: New `ReviewResultCard`, `GuidedTaskRunner`/`MissionTaskList` accept `reviewGate`/`planMessageId`, `MessageRenderer` renders `review_result` and passes review/chainPlan for gating, `AgentChatView` fetches and passes `missionReview` and `chainPlan` (with `createdFromMessageId`).

## Smallest safe patch (what was done)
- Reviewer off by default: `ENABLE_REVIEWER !== 'true'` → reviewer run is not created and executor returns early.
- All changes are additive: new agent key, new message type, new executor path, new UI card and optional gate.
- No changes to `/api/agent-messages` or SSE contract; no refactor of chat or task execution engine.

## Manual test
1. Set `ENABLE_REVIEWER=true` in Core env.
2. Create a plan that has duplicate steps (e.g. two steps with same normalized label) → expect `review_result` with `changes_requested` and DUPLICATE_STEP issue; banner "Plan needs review changes" and Execute disabled; "Revise plan" dispatches planner.
3. Revise plan (or create a plan with no duplicate steps and with budget/target/hero set) → expect `review_result` with `approved`; no banner, Execute enabled.
