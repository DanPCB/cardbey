# Orchestrator RAG Wiring

RAG (Retrieval-Augmented Generation) is a standard step in the Cardbey orchestrator for missions where retrieval is useful. This doc describes how it is wired and how to control it.

## 1. Entry points that use RAG by default

Defined in `apps/core/cardbey-core/src/orchestrator/api/insightsOrchestrator.js`:

```js
ENTRY_POINTS_USING_RAG = new Set([
  'agent_chat_reply',
  'gtm_plan',
  'content_strategy',
  'store_audit',
  'campaign_optimization',
  'campaign_strategy_review',
  'content_calendar_builder',
  'studio_goal_planner',
]);
```

- If the run **does not** pass `useRag`, the orchestrator uses this set: when `entryPoint` is in the set, RAG is run before planning; otherwise it is skipped.
- RAG is **currently implemented** only for the `agent_chat_reply` flow (Research Agent + Planner). Other entry points in the set will use RAG once their handlers are updated to accept `ragContext`.

## 2. Override per run: `OrchestratorRunOptions.useRag`

- **Agent Chat** (POST agent-messages → `runPlannerReplyForMission`):  
  `runPlannerReplyForMission(missionId, userId, tenantId, lastUserMessage, { useRag: true | false })`  
  Omit `options` or `options.useRag` to use the default (RAG for `agent_chat_reply`).

- **Insights execute** (POST `/api/orchestrator/insights/execute`):  
  Request body can include:
  - `useRag: boolean`, or
  - `runOptions: { useRag: boolean }`  
  to force RAG on or off for that run.

## 3. RAG helper: `runRagForMission(ctx)`

- **File:** `apps/core/cardbey-core/src/orchestrator/lib/ragForMission.js`
- **Context:** `{ query, missionId, tenantId, scope? }`
- **Behavior:** Calls existing `buildRagContext(question, scope, tenantId)` from `services/ragService.js` (vector store, retriever). Builds a short summary, posts an **AgentMessage** with `senderId: 'research-agent'`, `channel: 'research'`, `content: { text: summary, data: { docs, query } }`, and returns `{ retrievedDocs, summary, context }`.
- **Planner:** The planner input includes this as `ragContext`; the reply text is grounded in `ragContext.summary` when present.

## 4. Flow (agent_chat_reply)

1. `executeTask('agent_chat_reply', payload, context, runOptions)`.
2. `useRag = shouldUseRag(entryPoint, { useRag: payload.useRag ?? runOptions?.useRag })`.
3. If `useRag`: `ragContext = await runRagForMission({ query: lastUserMessage, missionId, tenantId })` (posts Research Agent message).
4. If not `useRag`: call existing `runResearchAgent(missionId, lastUserMessage)` (mock research, posts Research Agent message).
5. `replyText = generatePlannerReplyText(lastUserMessage, ragContext)` (includes “Based on the research: …” when `ragContext` is set).
6. Planner reply is posted as an AgentMessage.

No changes to auth or SSE; only orchestrator logic and RAG integration.
