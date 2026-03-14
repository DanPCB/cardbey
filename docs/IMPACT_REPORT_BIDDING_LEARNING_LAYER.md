# Impact Report: Bidding/Matching + Learning Layer for Multi-Agent Orchestrator

## 1. What could break

- **Existing orchestrator flow**: If we route all work through the new Task → Bid → Assignment path by default, any bug in bidding or missing AgentProfile could prevent runs from being created (e.g. no candidates, no assignment).
- **AgentRun creation**: Today AgentRun is created directly (e.g. from dispatch or maybeAutoDispatch). Adding an optional `assignmentId` and a path that creates AgentRun from Assignment is additive, but if we change existing call sites to require Assignment, those paths could fail.
- **Mission/AgentMessage**: New models reference missionId and userMessageId; no schema change to existing AgentMessage or Mission. Joins are via application code.

## 2. Why

- New bidding layer inserts Task → Bids → Assignment before (or instead of) direct AgentRun creation. If we make that path mandatory, existing flows that create AgentRun directly would need to create a Task and run the auction first, or we keep two paths (direct run vs assigned run).
- RAG integration is optional; if retrieval fails or is unimplemented, we must not block the orchestrator.

## 3. Impact scope

- **Core**: New Prisma models (AgentTask, AgentProfile, Bid, Assignment, InteractionFeedback). New modules: bidding, reward computation, profile update.
- **Orchestrator**: Optional “bidding path”: when enabled, user message → Task creation → auction → Assignment → AgentRun; when disabled, current behavior unchanged.
- **RAG**: Optional. If no RAG store or indexing, bidding still works using AgentProfile and historical Assignment stats only.
- **APIs**: New or extended endpoints for feedback (e.g. POST feedback), and optionally for Task/Assignment inspection. Existing dispatch and agent-messages unchanged unless we explicitly route through bidding.

## 4. Smallest safe approach

- **Additive only**: Introduce all new models and modules without changing existing AgentRun creation. Add a feature flag or config (e.g. `BIDDING_LAYER_ENABLED=false`) so the current orchestrator path remains default.
- **Dual path**: When a user message is processed, if bidding is enabled: create AgentTask(s), run auction, create Assignment(s), then create AgentRun from Assignment and link `run.input.assignmentId`. If bidding is disabled: keep creating AgentRun as today (no Task/Assignment).
- **AgentProfile seed**: Seed initial profiles for planner, research, ocr so the auction always has candidates.
- **Feedback**: New endpoint to record InteractionFeedback; existing “like/dislike” or rating UI can post to it. Reward computation and profile updates run in a background step or on feedback receipt.
- **RAG**: Stub interface (e.g. `indexTaskOutcome`, `retrieveSimilarTasks`) that no-ops when RAG is not configured; inject retrieved context into prompts only when available.

This report satisfies the development safety rule. Implementation will follow the additive, dual-path approach above.
