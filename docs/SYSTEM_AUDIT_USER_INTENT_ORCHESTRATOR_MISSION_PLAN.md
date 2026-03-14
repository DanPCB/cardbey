# System Audit: User intent → Orchestrator → correct mission plan → agents execute

**Audit date:** 2026-03-08  
**Scope:** Cardbey core/backend (and referenced frontend contracts).  
**Requirement:** Verify whether the structure **User intent → Orchestrator → correct mission plan → agents execute** is already in place, and what remains to build it.

---

## 1. Target structure (reference)

```
User intent
    → Orchestrator (single authority that interprets intent and decides what to do)
    → correct mission plan (explicit steps / suggestions for this mission)
    → agents execute (agents run from the plan, not ad hoc)
```

---

## 2. Current state: what exists

### 2.1 User intent capture

| Source | Where | What is captured | Stored as |
|--------|--------|-------------------|-----------|
| **Store opportunities** | `GET /api/stores/:id/opportunities` → `computeOpportunities()` | Store/offer signals → recommended intent (e.g. `create_offer`, `create_qr_for_offer`) | `IntentOpportunity`; on accept → `IntentRequest` (missionId, type, payload) |
| **Mission Inbox (direct)** | `POST /api/mi/missions/:missionId/intents` | Body `{ type, payload }` | `IntentRequest` (queued) |
| **Opportunity accept** | `POST /api/stores/:id/opportunities/:opportunityId/accept` body `{ missionId }` | One opportunity → one intent type + payload | `IntentRequest` (missionId, type from opportunity, payload with storeId) |
| **Orchestra start** | `POST /api/mi/orchestra/start` (and alias `/api/mi/start`) | `goal` / `entryPoint` (e.g. `build_store`, `generate_tags`, `mi_command`) | `OrchestratorTask` (entryPoint, request payload) |
| **Agent chat** | `POST /api/agent-messages` + optional dispatch | Free-text message; optional `targetAgent` (research/planner) | `AgentMessage`; optional `AgentRun` (research/planner) |
| **Insights execute** | `POST /api/orchestrator/insights/execute` | `entryPoint` + payload (e.g. device_health_check, studio_goal_planner) | `OrchestratorTask` → `executeTask(entryPoint)` |

So **user intent is captured** in several places; it is not yet funneled through a single “orchestrator” that always produces a “mission plan” before execution.

---

### 2.2 Orchestrator(s)

There are **multiple execution authorities**, not one unified orchestrator:

| Component | Role | Input | Output | Mission plan? |
|-----------|------|--------|--------|----------------|
| **MI Intents run** (`POST /api/mi/missions/:missionId/intents/:intentId/run`) | Routes **one** intent → one action (create_offer, catalog, media, etc.) | `IntentRequest` (type, payload) | MissionEvent + intent result; artifacts (offer, draft, etc.) | **No.** Intent type directly drives execution. No plan step. |
| **Orchestra job run** (`POST /api/mi/orchestra/job/:jobId/run`) | Runs a **single** job by entryPoint (build_store, MI_DRAFT_GOALS, mi_command, fix_catalog) | `OrchestratorTask` (entryPoint, request) | Task status + result; draft/store updates | **No.** entryPoint is the single “step”; no multi-step plan. |
| **Insights Orchestrator** (`executeTask(entryPoint, payload, context)`) | Routes **one** entryPoint to device/campaign/studio/agent_chat handlers | entryPoint + payload | Handler result (e.g. plan doc, reply text) | **Only for agent_chat_reply:** RAG + planner **reply text**; no structured plan that becomes intents. Other entry points return handler output, not a “mission plan” that then drives agents. |
| **Agent Chat (Planner + chain)** | Planner produces `plan_update` → `execution_suggestions` → chain plan; dispatch runs agents | User message (+ RAG) | `execution_suggestions` → `Mission.context.chainPlan`; `AgentRun` for research/planner | **Yes.** chainPlan is the “mission plan”; suggestions drive dispatch. |

So:

- **Agent Chat path** is the only path where something like “User intent → Orchestrator (planner) → mission plan (chainPlan/suggestions) → agents execute” exists.
- **Mission Inbox / opportunities** and **Orchestra** do **not** go through an orchestrator that produces a “correct mission plan”; they go **intent/entryPoint → direct execution**.

---

### 2.3 Mission plan

| Concept | Where | Used by | Notes |
|---------|--------|---------|--------|
| **ChainPlan** (`Mission.context.chainPlan`) | `docs/MISSION_ENGINE_PHASE_A.md`; `maybeAutoDispatch` imports `getChainPlan`, `advanceChainCursor` from `chainPlan.js` | `maybeAutoDispatch`, chain mode UI, retry/skip | Plan has `suggestions[]` (agentKey, intent, risk), cursor. Created when planner emits `execution_suggestions`. Only used in **Agent Chat** flow. |
| **IntentRequest list** (Mission Inbox) | `IntentRequest` rows for a mission | Mission Execution UI; POST run | Queue of intents; each run is one intent. No “plan” object; the list is effectively an ad hoc plan. |
| **OrchestratorTask.request** | `OrchestratorTask` row | Orchestra job run | Single request payload + entryPoint. No multi-step plan. |
| **Planner steps** (plan_update) | `createAgentMessage(..., messageType: 'plan_update', payload: { steps })` | inferExecutionSuggestions → execution_suggestions → chain plan | Only in Agent Chat; steps drive suggestions, then chain. |

So a **formal “mission plan”** (steps/suggestions that the system then executes) exists only in the **Agent Chat / chain plan** path. Mission Inbox and Orchestra do not have a first-class “mission plan” that the orchestrator produces and then agents follow.

---

### 2.4 Agents execute

Execution is implemented and working:

- **Intent run:** create_offer, create_qr_for_offer, publish_offer_page, publish_intent_feed, mi_assistant_message; catalog (generate_tags, rewrite_descriptions); media (generate_store_hero). All in `miIntentsRoutes.js` POST run.
- **Orchestra job:** build_store (generateDraft), autofill_product_images, fill_missing_images, repair_product_images, generate_tags, rewrite_descriptions, generate_store_hero, set_store_hero_from_item, mi_command; fix_catalog (returns “not available”). In `miRoutes.js` job run.
- **Insights:** executeTask → device/campaign/studio handlers (and agent_chat_reply).
- **Agent Chat:** AgentRun (research, planner) via executeAgentRunInProcess; maybeAutoDispatch runs next chain step from chain plan.

So **agents do execute**; the gap is whether they always execute **from** an explicit, orchestrator-produced **mission plan**.

---

## 3. Gap analysis: requirement vs current state

| Requirement | Status | Notes |
|-------------|--------|--------|
| **User intent** | ✅ Exists | Multiple entry points (opportunities, MI intents, orchestra start, agent chat, insights). |
| **Orchestrator** | ⚠️ Fragmented | No single orchestrator. MI Intents run and Orchestra job run are “intent/entryPoint → direct execution.” Only Agent Chat has planner → plan → dispatch. |
| **Correct mission plan** | ⚠️ Only in Agent Chat | chainPlan + execution_suggestions exist for Agent Chat. Mission Inbox and Orchestra have no explicit “mission plan” (no steps/suggestions produced by an orchestrator before execution). |
| **Agents execute** | ✅ Exists | Intent run, orchestra job, insights, agent runs all execute; execution paths are implemented. |

**Summary:** Cardbey **has not yet** fully implemented the structure **User intent → Orchestrator → correct mission plan → agents execute** as a single, consistent pipeline. It **has** implemented it for **Agent Chat** (user message → planner → chain plan → agents). For **Mission Inbox / opportunities** and **Orchestra**, the flow is **user intent → direct execution** (with optional queue), without an orchestrator step that produces a “correct mission plan” before agents run.

---

## 4. What needs to be done to build the full structure

### 4.1 Option A — Minimal: document and align naming (no new execution path)

- **Document** the two existing patterns:
  - **Plan-driven:** Agent Chat (user intent → planner → chain plan → agents).
  - **Single-step:** Mission Inbox / Orchestra (user intent → one intent/job → one execution).
- **Clarify** that “mission plan” in the strict sense is chainPlan; for single-step flows, the “plan” is the single intent or entryPoint.
- **No code change** to execution; only docs and possibly a short “orchestrator” contract (who may run what).

### 4.2 Option B — Unify under one orchestrator API (backend)

- Introduce a **single entry** for “run from user intent” that:
  - Accepts **user intent** (e.g. from opportunity, or free-form goal, or missionId + intent type).
  - Runs an **orchestrator** step that:
    - Resolves mission/store context.
    - Produces or selects a **mission plan** (e.g. one or more steps; for “create_offer” it might be a single step; for “launch store” it might be build_store → create_offer → publish_feed).
  - Then **executes** from that plan (create IntentRequests or OrchestratorTasks from plan steps, or run in sequence).
- Keep existing **intent run** and **orchestra job run** as **execution** endpoints only (called by the orchestrator or by UI when plan is already known). No direct “user intent → run” without going through the orchestrator for flows that should have a plan.

### 4.3 Option C — Add “mission plan” to Mission Inbox / Orchestra (incremental)

- **Mission Inbox:** When an opportunity is accepted or an intent is created, optionally call an **orchestrator** that returns a **plan** (e.g. “steps: [{ intentType: 'create_offer', payload }]”). Store that plan in `Mission.context` (e.g. `missionPlan`). Run intents from that plan (one step at a time, or batch). UI shows “Mission plan: step 1 of N” instead of a flat list.
- **Orchestra:** When a job is created with goal/entryPoint, orchestrator returns a **plan** (e.g. for build_store: steps like create_draft → generate → review). Job run then executes steps from the plan; task status reflects “step 2 of 3” etc. Requires defining a small plan schema and one orchestrator function per entry point (or one generic that maps entryPoint → plan).

### 4.4 Option D — Full pipeline (user intent → orchestrator → plan → agents)

- **Single entry:** All “user intent” (opportunities, quick actions, agent chat, orchestra start) goes through one **orchestrator API** (e.g. `POST /api/mi/orchestrator/run` with body `{ missionId?, intent?, goal?, context }`).
- Orchestrator:
  - Classifies intent / goal.
  - Loads or creates mission.
  - **Produces mission plan** (steps with intent types, payloads, risk).
  - Persists plan (e.g. Mission.context.missionPlan or chainPlan).
  - Returns plan to client; optionally starts first step or queues all steps as IntentRequests.
- **Execution** remains: POST intent run, POST job run, etc., but they are triggered **from** the plan (by backend or by UI following the plan). No ad hoc “run this intent” without a plan when the product rule is “always plan first.”

---

## 5. Recommended next steps

1. **Product decision:** Should **every** user intent (including “Launch your first offer” from opportunities) go through an explicit “mission plan” step (even if that plan has one step)? Or is the current split acceptable:
   - Plan-driven: Agent Chat only.
   - Direct execution: Mission Inbox, Orchestra.
2. **If plan-first is required everywhere:**
   - Implement **Option C** for Mission Inbox first: on accept opportunity or create intent, call an orchestrator that returns a plan (e.g. single step for create_offer); persist and run from plan. Then extend to Orchestra (entryPoint → plan → run).
3. **If a single orchestrator API is desired:**
   - Implement **Option B** or **Option D**: one orchestrator endpoint that accepts intent/goal and returns (and optionally executes from) a mission plan; migrate callers (dashboard, artifact UIs) to use it where “user intent” is expressed.
4. **Regardless:** Keep the **Single Runway** rule: artifact UIs create IntentRequest (or call orchestrator) and do not call execution APIs directly. The audit does not change that; it only clarifies where “mission plan” exists and where it is missing.

---

## 6. Files and areas referenced

| Area | Files / entry points |
|------|----------------------|
| User intent capture | `apps/core/cardbey-core/src/services/intentOpportunities.js`, `apps/core/cardbey-core/src/routes/stores.js` (opportunities, accept), `apps/core/cardbey-core/src/routes/miIntentsRoutes.js` (POST intents), `apps/core/cardbey-core/src/routes/miRoutes.js` (orchestra/start), `apps/core/cardbey-core/src/orchestrator/api/orchestratorRoutes.js` (insights execute), agent-messages + agentChatTurn |
| Orchestrator / execution | `apps/core/cardbey-core/src/routes/miIntentsRoutes.js` (POST run), `apps/core/cardbey-core/src/routes/miRoutes.js` (job run), `apps/core/cardbey-core/src/orchestrator/api/insightsOrchestrator.js` (executeTask), `apps/core/cardbey-core/src/orchestrator/agentChatTurn.js`, `apps/core/cardbey-core/src/lib/maybeAutoDispatch.js` |
| Mission plan | `Mission.context.chainPlan` (MISSION_ENGINE_PHASE_A.md), execution_suggestions, plan_update; no first-class plan for MI/Orchestra |
| Contracts | `docs/CARDBEY_SYSTEM_CONTRACT.md`, `docs/SINGLE_RUNWAY_AUDIT_AND_PLAN.md` |

---

## 7. Summary table

| Structure step | Already in place? | Where | Missing / to build |
|----------------|-------------------|--------|----------------------|
| User intent | Yes | Opportunities, MI intents, orchestra start, agent chat, insights | — |
| Orchestrator | Partially | MI Intents run (routing only); Orchestra job (routing only); Agent Chat (planner + dispatch) | Single orchestrator that always produces a plan for all intents (if desired) |
| Correct mission plan | Only Agent Chat | chainPlan from execution_suggestions | Mission plan for Mission Inbox and Orchestra (and optionally persisted for all missions) |
| Agents execute | Yes | Intent run, job run, insights, agent run | — |

**Conclusion:** Cardbey **already has** user intent capture and agent execution. It **partially has** the orchestrator and mission plan (only in the Agent Chat / chain plan path). To fully match **User intent → Orchestrator → correct mission plan → agents execute**, add an orchestrator step that produces (and optionally persists) a mission plan for **Mission Inbox** and **Orchestra** flows, and optionally unify behind one orchestrator API.
