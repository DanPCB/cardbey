# IMPACT REPORT — Live Specialist Agents + Typed Schema

Date: 2026-08-25  
Branch: `fix/multi-agent-capability-e2e`  
Status: Phases A–E committed; Phase F (BusinessLearning) + gate tests landing

## Data flow (actual)

1. Coordinator `createAgent(type)` → `new AgentClass({ context: this.baseContext })`
2. `baseContext` includes `storeKnowledge`, `storeId`, `missionId` (SKP Phase 2)
3. `agent.execute(task)` → envelope `{ taskId, agentType, result, summary, confidence }`
4. Blackboard: `appendEvent(missionId, eventType, payload)` — **do not change signature**
5. verifyStep reads artifacts from merged envelopes (type/content/graphicUrl)
6. MultiAgentMissionCard polls blackboard events + campaign package

## Adaptations vs master prompt

| Prompt assumption | Repo reality |
|-------------------|--------------|
| `agent.run(context)` | Class `execute(task)` + `this.context` |
| `blackboard.appendEvent(type, data)` | `appendEvent(missionId, type, payload)` |
| `blackboard.getEvents()` | `getEvents(missionId, eventType?)` |
| Raw Anthropic SDK | Use `llmGateway` + `withAgentRetry` (existing) |
| `toolDispatcher.dispatch` | `dispatchTool(toolName, input, context)` |
| BusinessContextService | `BusinessLearning` Prisma model (new) |

## Risks

- Live Claude in agents increases latency/cost and may flake offline tests → mock llmGateway in unit tests; stub fallback when LLM unavailable
- Passing blackboard into agent context requires coordinator to put `blackboard` on `baseContext` (additive, no signature change)
- Prisma BusinessLearning must be additive on postgres + sqlite (+ root if present)

## Smallest safe approach

Override `execute()` on each specialist to call live Claude when available; keep stub fallback on LLM failure so local boot does not break.

## Completion notes (2026-08-25)

- Agents keep `execute(task)` + stub fallback on LLM failure.
- LLM path: `llmGateway` + `withAgentRetry` (not raw Anthropic SDK).
- Action graphic path: `dispatchTool('generate_promotion_asset', …)`.
- Learn: Prisma `BusinessLearning` preferred; JSON sidecar fallback when table/client unavailable.
- Unit gate: `src/lib/orchestration/__tests__/liveAgents.test.js` (mocked LLM).
- Staging E2E still needs operator `TEST_TOKEN` / deploy with migration applied.
