# Mission Engine – Phase A (Mission table)

## What the Mission table is for

The **Mission** model is a registry for agent-chat missions. It exists so we can:

- Attach stable metadata (title, status, context) to a mission id.
- Use the same id format as today (e.g. `OrchestratorTask.id` or any string id).
- Keep tenant and creator (createdByUserId) for permissions and listing.

Phase A is **additive only**: we add the table and a **getOrCreateMission(missionId, user, { title? })** helper. No routes or existing behavior (Agent Chat, Threads, SSE, store creation) are changed. Agent Chat and Threads continue to use `missionId` as before; the Mission table is available for future use (e.g. mission list, status, context).

## Schema (summary)

- **Mission**: id (string, primary key; no default — reuse existing missionId), tenantId, createdByUserId, title (nullable), status (default `active`), context (JSON, nullable), createdAt, updatedAt.
- **tenantId**: derived from user via the shared **getTenantId(user)** helper in `src/lib/tenant.js`. Use that same helper across the API so tenant is defined in one place (align routes that use `req.user.tenantId` or ad-hoc derivation when you touch them).
- **status**: String for v0. When adding logic, convert to a Prisma enum to prevent typo-states (e.g. `actve`).
- Indexes: (tenantId, updatedAt), (createdByUserId, updatedAt).

## Helper

- **getOrCreateMission(missionId, user, { title? })**: looks up Mission by id; if missing, creates a row with tenantId from **getTenantId(user)** and createdByUserId from user, and optional title. Does not update existing rows. **missionId is trimmed inside the helper**; callers may pass untrimmed.

## AgentRun (mission executions)

- **AgentRun** model: id (cuid), missionId (FK → Mission.id), tenantId, agentKey (e.g. `research`, `planner`), triggerMessageId (optional), status (default `queued`; v0 string, later enum), input/output (JSON), error (string), createdAt, updatedAt.
- Indexes: (missionId, createdAt), (tenantId, createdAt), (status, updatedAt).
- Helpers in `src/lib/agentRun.js`:
  - **createAgentRun({ missionId, tenantId, agentKey, triggerMessageId?, input? })**: creates run with status `queued`.
  - **updateAgentRunStatus(runId, status, { error?, output? })**: updates run; returns updated run or null.

## No changes yet (to existing flows)

- Agent Chat, Threads, and SSE remain missionId-based with existing flows.
- Dispatch and in-process executor are additive (see Phase A.3 / A.4).

## Phase A.3 – POST /api/missions/:missionId/dispatch (manual test)

- **Endpoint**: POST `/api/missions/:missionId/dispatch`, body `{ triggerMessageId?, targetAgent?: "auto"|"research"|"planner", intent? }`.
- **Auth**: requireAuth; same permission as agent-messages (`canAccessMission`). Returns 403 if user cannot access mission.
- **Behavior**: Ensures Mission row (getOrCreateMission), creates AgentRun (status `queued`), returns `{ ok, missionId, runId, agentKey, status: "queued" }`. Does not execute agents.
- **Manual test**: With a valid missionId and auth, POST dispatch → 201 with runId. POST with another user’s missionId → 403.

## Phase A.4 – In-process executor (Research and Planner)

- **Research**: `MISSION_RUN_INPROCESS=true`. **Planner**: `MISSION_PLANNER_INPROCESS=true` (dev-safe; no execution when unset).
- **executeAgentRunInProcess(runId)** (in `src/lib/agentRunExecutor.js`): loads run; if status !== `queued` returns. Supports `agentKey === 'research'` and `agentKey === 'planner'` (each gated by its env flag). Sets status `running`, posts run_lifecycle "Run started", runs the agent, sets `completed` or `failed`, posts run_lifecycle result. All errors caught; does not block.
- **Planner executor** (`src/lib/plannerExecutor.js`): Loads last N agent messages and Mission.context. Builds a minimal plan (title, steps as `[{ id, label, status: "todo" }]`, optional assumptions/risks). If missing essentials (budget/target), emits **approval_required** with options (Provide budget / Provide target customers / Use defaults). Otherwise emits **plan_update**; existing createAgentMessage hook then appends **execution_suggestions**. Deterministic; no chat echo. On failure, run marked failed and short system message posted.
- **Dispatch**: When agentKey is `research` and `MISSION_RUN_INPROCESS=true`, or agentKey is `planner` and `MISSION_PLANNER_INPROCESS=true`, triggers executeAgentRunInProcess(runId) fire-and-forget after responding.
- **Verification**: Dispatch research with env set → timeline shows "Run started: research", research_result card, "Run completed: research". Dispatch planner with `MISSION_PLANNER_INPROCESS=true` → plan_update card, then execution_suggestions (or approval_required if essentials missing).

## Phase A.5 – UI: call dispatch when user selects research

- After successful POST `/api/agent-messages`, if the user had **targetAgent "research"**, the UI calls POST `/api/missions/:missionId/dispatch` with `{ triggerMessageId: createdMessage.id, targetAgent: "research" }`. On dispatch failure, a toast is shown; chat send flow is unchanged (message already sent).
- **Manual test**: In Agent Chat, choose "Research Agent" in Send to, send a message. Message appears; if backend has `MISSION_RUN_INPROCESS=true`, you should see "Run started: research" and research result (and "Run completed: research"). If dispatch fails (e.g. 403), toast appears but the sent message remains.

## Timeline system messages (lifecycle visibility)

- **Executor** writes lifecycle messages via **createAgentMessage** (same path as other agent messages): `senderType="system"`, `messageType="system"`, `text="Run started: <agentKey>"` / `"Run completed: <agentKey>"` / `"Run failed: <agentKey> — ..."`. Same SSE event (`broadcastAgentMessage`) so they appear in real time.
- **GET /api/agent-messages** explicitly includes system messages in the list (`OR senderType: 'system'`).
- **MessageRenderer** does not filter out system messages: `rowToDisplayMessage` maps `senderType === 'system'` to `authorType: 'system'` and does not return null (only planning-status planner messages are excluded).
- **MessageBubble** renders system messages as centered, muted timeline entries (`text-center text-xs text-muted-foreground`).

### Manual verification checklist

- [ ] With `MISSION_RUN_INPROCESS=true`, send a message to Research in Agent Chat. Timeline shows **"Run started: research"** (centered, muted) before the research result card.
- [ ] Timeline shows **"Run completed: research"** (centered, muted) after the research result.
- [ ] On research failure, timeline shows **"Run failed: research — …"** (centered, muted).
- [ ] Refresh the page: lifecycle messages still appear in the list (GET includes them).
- [ ] Other message types (user, agent, research_result, etc.) still render as before; no regression.

## Timeline run lifecycle badges (v1)

- **Payload**: System lifecycle messages include `payload: { kind: "run_lifecycle", runId, agentKey, status: "running"|"completed"|"failed", error? }`. `text` unchanged for older UIs.
- **Executor**: Emits run_lifecycle payload on run start (status running), completion (completed), and failure (failed + short error).
- **UI**: RunLifecycleTimelineItem in MessageRenderer: compact centered row with ⏳ Running / ✅ Completed / ❌ Failed; label "<AgentKey> • Running/Completed/Failed"; timestamp; in debug, failed messages show collapsible error details.
- **Dedupe**: By runId, only the latest status is shown (completed/failed over running; same status by latest createdAt).

### Manual verification checklist (lifecycle badges)

- [ ] Dispatch research with `MISSION_RUN_INPROCESS=true` → timeline shows ⏳ "Research • Running" then ✅ "Research • Completed" (or deduped to only ✅).
- [ ] Force research failure → see ❌ "Research • Failed" with label; in dev, "Show error" reveals short reason.
- [ ] Reload page → timeline persists; badges still correct (GET returns payload; dedupe applied).
- [ ] SSE live: new lifecycle message arrives → timeline updates in place or appends; no layout shift or composer move.

## Execution suggestions (after plan_update)

- **messageType**: `execution_suggestions` with `payload: { suggestions: [{ label, agentKey, intent }] }`.
- **inferExecutionSuggestions(planPayload)** (in `orchestrator/lib/inferExecutionSuggestions.js`): v0 heuristic on `plan_update.payload.steps`: "Research|Explore|Visit suppliers" → research; "Contact|Email" → planner + `generate_contact_template`; "Marketing" → planner + `campaign_plan`; "Layout" → planner + `store_layout_plan`.
- **Hook**: When `createAgentMessage` is called with `messageType: 'plan_update'` and `payload.steps`, it appends (fire-and-forget) an `execution_suggestions` message if `inferExecutionSuggestions(payload)` returns non-empty. No change to existing plan_update or agent logic.
- **UI**: ExecutionSuggestionsCard renders buttons per suggestion; on click calls POST `/api/missions/:missionId/dispatch` with `{ triggerMessageId: messageId, targetAgent, intent }`. No auto-run; user must click.
- **API**: `validatePayloadByMessageType('execution_suggestions', payload)` normalizes `suggestions` array.

### Manual verification checklist (execution suggestions)

- [ ] Create a plan_update (via any flow that uses createAgentMessage with plan_update and steps containing e.g. "Research" or "Marketing") → an execution_suggestions message appears below with suggestion buttons.
- [ ] Click a suggestion button → dispatch is called; toast on success/failure; no auto-run of the agent (only on explicit click).
- [ ] Reload page → execution_suggestions card still shows; buttons still work.
- [ ] plan_update and other message types still render as before; no regression.

## Risk taxonomy (R0–R3)

Execution suggestions carry a **risk** level used only for auto-chaining policy; **manual dispatch is always allowed** regardless of risk.

- **Payload**: `execution_suggestions` includes per suggestion: `risk: "R0"|"R1"|"R2"|"R3"` and `requiresApproval` (true for R3).
- **Single source of truth**: `src/lib/intentRiskMap.js` maps intent → risk. Default for unknown intents is R1 (permissive for existing flows).
- **Default map**: research→R1, campaign_plan→R1, store_layout_plan→R2, generate_contact_template→R3.
- **requiresApproval**: true when risk is R3; derived from risk in inferExecutionSuggestions and API validation.

## Auto-chaining (v0)

Missions can automatically run the next agent in a chain after a run completes, with pause for R3 (approval) and stop on errors. **Auto-run is opt-in**; manual behavior is unchanged.

### ChainPlan (stored in Mission.context.chainPlan)

- **chainId**: id of the execution_suggestions message.
- **mode**: `"manual"` (default), `"auto_safe"`, or `"auto_drafts"`.
- **suggestions**: `[{ id, agentKey, intent, risk, requiresApproval }]` (risk from intentRiskMap).
- **cursor**, **createdFromMessageId**. Optional **approvalEmittedFor**: suggestionIds for which an R3 approval_required was already emitted.

Mission.context may also have **allowExternalDrafts** (boolean); when true, auto_drafts may auto-dispatch R2.

### Auto-chaining policy (risk)

- **manual**: never auto-dispatch.
- **auto_safe**: only auto-dispatch **R0** and **R1**.
- **auto_drafts**: allow **R0/R1/R2** only if **allowExternalDrafts** is true (otherwise same as auto_safe).
- **R3**: never auto-dispatch; when next step is R3, server emits an **approval_required** message (once per suggestion) explaining the action and why approval is needed, then pauses.

### maybeAutoDispatch(missionId, reason)

**Reasons**: `run_completed`, `decision_recorded`, `chain_plan_created`, `chain_plan_updated`.

**No-op when**:

- Any pending `approval_required` message has no decision.
- There is an AgentRun with `status: "running"` for the mission.
- Last run for the current (chainId, suggestionId) failed (user must retry manually).
- No chain plan or mode is `manual`.
- Next suggestion at cursor is **R3**: emit approval_required (if not already emitted for this suggestionId), then return.
- Next suggestion risk not allowed by policy (e.g. R2 in auto_safe, R3 always).
- Idempotency: a run already exists for (missionId, chainId, suggestionId).
- Rate limit: max 10 auto-dispatches per mission per hour (in-memory).

**Otherwise**: creates AgentRun, triggers in-process execution for research when enabled; executor advances cursor only after successful completion.

### Triggers

- **Run completes**: agentRunExecutor calls `advanceChainCursor(missionId)` then `maybeAutoDispatch(missionId, 'run_completed')` (when run input has chainId + suggestionId).
- **Decision recorded**: agent-messages route calls `maybeAutoDispatch(missionId, 'decision_recorded')`.
- **Chain plan created**: createAgentMessage (after execution_suggestions) calls `maybeAutoDispatch(missionId, 'chain_plan_created')`.
- **Chain mode set to auto_safe or auto_drafts**: PATCH /api/missions/:missionId with `{ chainMode, allowExternalDrafts? }` calls `maybeAutoDispatch(missionId, 'chain_plan_updated')`.

### Safeguards

- One running run per mission; idempotency (missionId, chainId, suggestionId); max 10 auto-dispatches per mission per hour.
- Risk gating: only R0/R1 in auto_safe; R0/R1/R2 in auto_drafts when allowExternalDrafts; never R3.

### API

- **GET /api/missions/:missionId**: returns mission (id, title, status, context) for chain status UI.
- **PATCH /api/missions/:missionId**: body `{ chainMode: "manual" | "auto_safe" | "auto_drafts", allowExternalDrafts?: boolean }`; merges into context.
- **POST /api/missions/:missionId/dispatch**: body may include `chainId`, `suggestionId` for idempotency.

### UI

- **Chain mode select** in Agent Chat header (when chain plan exists): "Manual (no auto-run)" | "Auto (Safe: R0/R1)" | "Auto (Drafts: R0/R1/R2)". Label reflects policy.
- **Risk badge** on each suggested action (R0/R1/R2/R3) with distinct styling.
- **Chain status**: "Chain: step X of Y • Next: …".

### Cursor-advance guard

Cursor is advanced only when the completed run matches the current chain step (no advance on manual dispatch of a non-current suggestion).

- **agentRunExecutor.js**: On run success with `run.input.chainId` and `run.input.suggestionId`, load `getChainPlan(missionId)`. Advance only if `plan.chainId === run.input.chainId` and `plan.suggestions[plan.cursor]?.id === run.input.suggestionId`. On mismatch, do not advance; in dev, log `[agentRunExecutor] cursor not advanced (run does not match current step)` with missionId, runId, chainId, suggestionId, expectedSuggestionId.

### Manual verification checklist (auto-chaining)

- [ ] **R1 auto-runs**: Plan with Research (R1) step; set "Auto (Safe: R0/R1)"; chain auto-dispatches research; on completion, cursor advances.
- [ ] **R3 pauses with approval_required**: Plan with Contact (R3) step; set Auto (Safe). When cursor reaches R3, an **approval_required** message is emitted (prompt explains action and why approval needed). No auto-dispatch; user can Run or Skip via approval card.
- [ ] **Manual unchanged**: All suggestion buttons work regardless of risk; manual dispatch always allowed.
- [ ] Risk badges show R1/R2/R3 on suggestions; toggle label shows "Auto (Safe: R0/R1)" or "Auto (Drafts: R0/R1/R2)".
- [ ] Stops on failure; user can retry by clicking suggestion; chain continues after success.
- [ ] **Cursor guard – normal run advances**: Chain at step 1; auto or manual run for step 1 completes → cursor advances to step 2.
- [ ] **Cursor guard – manual non-current does not move cursor**: Chain at step 2; user manually dispatches step 1 (or another suggestion). When that run completes → cursor does **not** advance; in dev, debug log shows expectedSuggestionId vs suggestionId.

### Chain state (status)

- **chainPlan.status**: One of `running` | `waiting_approval` | `blocked_error` | `completed`. Additive: if missing, UI infers (e.g. cursor >= len → completed).
- **computeChainStatus(missionId, plan)** (in `src/lib/chainPlan.js`): Returns **completed** when cursor >= suggestions.length; **blocked_error** when last run for current step failed; **waiting_approval** when next step requiresApproval or any pending approval_required without decision; **running** otherwise.
- **Persisted** after: saving chain plan, run completed/failed (executor), decision recorded (agent-messages), skip/retry (PATCH chain). advanceChainCursor merges status from computeChainStatus.
- **UI**: Status pill near chain mode (Running / Waiting approval / Blocked / Completed) and chain line shows "• Status: &lt;status&gt;".

### Retry/Skip when chain blocked by failed run

- **chainPlan.status**: Set via computeChainStatus when a chain run fails (blocked_error). Cleared when cursor advances (success or skip).
- **PATCH /api/missions/:missionId/chain**: Body `{ action: "retry"|"skip", chainId, suggestionId }`. requireAuth + canAccessMission. Verifies chainId and suggestionId match current step. **Retry**: creates AgentRun for current step and triggers in-process execution. **Skip**: blocked if step.requiresApproval and no approval decision recorded; otherwise advances cursor, posts "Chain step skipped: &lt;label&gt;", calls maybeAutoDispatch(missionId, "chain_step_skipped").
- **UI**: When chainPlan.status === "blocked_error", show [Retry] [Skip]. Skip disabled when current step requiresApproval and no decision. Skip shows confirm: "Skip this step? This may reduce quality." Buttons disabled while request pending.

### Manual verification checklist (Retry/Skip)

- [ ] **Force research failure → chain blocked → Retry works**: Cause a research run to fail (e.g. invalid key). Chain status becomes blocked_error; Retry and Skip appear. Fix the issue (e.g. key); click Retry. Run is re-dispatched; when it completes, cursor advances and status clears.
- [ ] **Skip advances cursor and continues**: With chain blocked, click Skip; confirm. Cursor advances, "Chain step skipped: …" message appears. If mode is auto_safe and next step is R0/R1, maybeAutoDispatch runs the next step.
- [ ] **Skip disabled for requiresApproval without decision**: Current step is R3 (e.g. Contact); chain blocked. Skip is disabled until user records a decision on the approval_required message; then Skip is enabled.
