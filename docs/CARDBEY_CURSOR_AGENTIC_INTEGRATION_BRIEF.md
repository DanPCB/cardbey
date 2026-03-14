# Cardbey — AI-Native Agent Integration Brief
**For:** Cursor AI (development agent)  
**From:** System architecture review  
**Date:** 2026-03-09  
**Purpose:** Situational assessment + phased implementation plan to evolve Cardbey into a fully AI-native agent system

---

## 1. Situation Assessment

### What the system is

Cardbey is an AI-first SMB platform built around a **Single Runway** execution model:

```
Intent → Mission → Orchestrator → Agents → Artifacts → Signals → Opportunities → (loop)
```

The architectural discipline is strong. The three-layer contract (Intent UI / Orchestrator / Artifact surfaces) is well-defined and partially enforced. The data models for missions, intents, events, and agent runs are in place.

### What is working

- Single Runway gate (M1) is implemented. Artifact UIs create `IntentRequest` and hand off to Mission Execution — they do not call orchestration or LLM APIs directly.
- `Mission`, `IntentRequest`, `MissionEvent`, `AgentRun` models are in the schema and in use.
- Chain plan (execution_suggestions → cursor → maybeAutoDispatch) is working **inside Agent Chat**.
- LLM service path (`llm_generate_copy` → LlmCache + LlmUsageDaily) is in place.
- RAG is wired for `agent_chat_reply`.
- Intent Opportunities are computed and can be accepted into the mission.
- `create_offer`, `create_qr_for_offer`, catalog, and media intents execute end-to-end.

### The structural gap

The system has the **shape** of an AI-native agent loop, but the Orchestrator currently functions as a **smart router, not a reasoning engine**. It branches on `intent.type` rather than planning. This means:

1. **No mission plan outside Agent Chat.** Mission Inbox and Orchestra start run as single-step execution. There is no Orchestrator-produced plan before agents are dispatched.
2. **Agents are stateless workers.** Each agent runs in isolation. There is no shared working memory scoped to a mission. `CatalogAgent` output is not readable by `CopyAgent`.
3. **Opportunity detection is rule-based.** `IntentOpportunity` is computed from known patterns (`no_first_offer`, `high_views_no_qr`). Novel patterns from signal data are not surfaced.
4. **M2 unification has no common shape yet.** Pipeline and AI Operator modes cannot be unified until there is a single plan shape they both produce and consume.

### What this means for development

Any new feature built on top of the current execution model will inherit these limitations. The path of least resistance — adding more branches to the orchestrator switch, adding more intent types without a plan layer — will increase complexity and make M2/M3 harder. The next integration work must lay the structural foundations, not add features on top of a partial base.

---

## 2. The Three Foundations to Build

These are not independent features. They are sequentially dependent foundations. Each one unblocks the next.

```
Foundation 1: Mission Planner for All Intents
        ↓  (provides the shared contract)
Foundation 2: Agent Context Bus (Shared Working Memory)
        ↓  (provides the state agents read/write)
Foundation 3: LLM-Inferred Opportunities (close the loop with AI)
```

---

## 3. Foundation 1 — Orchestrator-Produced Mission Plan for All Intents

### Why this first

Right now, a mission plan (chain plan) only exists when the user goes through Agent Chat. Mission Inbox and Orchestra start dispatch immediately without a plan. This means:
- No visibility into what the orchestrator will do before it does it.
- No checkpoint structure for M3.
- No common job shape for M2 unification.
- No basis for agents to know what comes before or after them.

A `MissionPlan` produced by the Orchestrator before any dispatch is the contract that makes everything else coherent.

### What to build

**Schema addition — `MissionPlan` in `Mission.context`:**

```typescript
// Mission.context.missionPlan (JSON field, already exists on Mission model)
interface MissionPlan {
  planId: string;           // uuid
  intentType: string;       // the originating intent type
  createdAt: string;        // ISO timestamp
  steps: MissionPlanStep[];
}

interface MissionPlanStep {
  stepId: string;           // uuid
  order: number;
  agentType: 'CatalogAgent' | 'CopyAgent' | 'MediaAgent' | 'PromotionAgent' | 'OptimizationAgent' | 'ResearchAgent' | 'PlannerAgent';
  label: string;            // human-readable, shown in Mission Execution UI
  dependsOn: string[];      // stepIds this step waits for
  checkpoint: boolean;      // if true, Mission Execution UI pauses and asks user
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  intentRequestId?: string; // linked IntentRequest once dispatched
  estimatedTokens?: number;
}
```

**New Orchestrator entry point — `planIntent`:**

Add a `planIntent(intentType, payload, context)` function that runs before dispatch. For each `intent.type`, it returns a `MissionPlan`. Initially, plans can be deterministic (rule-based per intent type). Later, replace rule-based planning with an LLM planner call.

Example: `create_offer` intent produces a plan with steps:
1. `ResearchAgent` — check existing offers and signals (no checkpoint)
2. `CopyAgent` — generate offer title + description (checkpoint: true)
3. `PromotionAgent` — create StoreOffer record (no checkpoint)
4. `MediaAgent` — generate offer image if missing (no checkpoint)

**Wire it into all three execution paths:**

- `POST /api/mi/missions/:missionId/intents/:intentId/run` → call `planIntent` → store plan in `Mission.context.missionPlan` → emit `MissionEvent` type `plan_created` → then dispatch as before.
- `POST /api/mi/orchestra/job/:jobId/run` → same.
- Agent Chat already has chain plan; migrate it to this schema.

**`MissionEvent` additions:**

```
plan_created    // plan stored, steps visible
step_started    // a step has begun (stepId in payload)
step_completed  // a step finished (stepId, result summary)
step_checkpoint // UI must pause and present choice to user
```

### What not to do

- Do NOT refactor all existing intent handlers at once. Add `planIntent` as a wrapper; existing handlers run unchanged inside steps. Migrate incrementally.
- Do NOT make planning async/LLM-based on the first pass. Deterministic plans per intent type are sufficient to establish the structure. LLM planning is an upgrade, not a prerequisite.
- Do NOT change the `IntentRequest` model. Plans live in `Mission.context`; `IntentRequest` continues to be the execution unit.

### Acceptance criteria

- Every `IntentRequest` run produces a `MissionPlan` in `Mission.context.missionPlan` before the first agent is dispatched.
- `MissionEvent` stream contains `plan_created` followed by `step_started` / `step_completed` events.
- Mission Execution UI can read and display the plan steps and their status.
- Agent Chat chain plan is expressed in the same `MissionPlan` schema.

---

## 4. Foundation 2 — Agent Context Bus (Shared Working Memory)

### Why this second

Currently each `AgentRun` writes its output to `IntentRequest.result` (or `AgentRun` record) and that is the end of it. No subsequent agent reads the previous agent's output unless the calling code explicitly threads it through. This means agents cannot build on each other — they are parallel workers, not a team.

The Agent Context Bus gives the mission a live working memory that all agents can read from and write to. This is what makes multi-agent behavior emergent rather than scripted.

### What to build

**Schema addition — `agentMemory` in `Mission.context`:**

```typescript
// Mission.context.agentMemory (JSON field on Mission model)
interface AgentMemory {
  entities: {
    products?: ProductEntity[];       // written by CatalogAgent
    offers?: OfferEntity[];           // written by PromotionAgent
    copy?: CopyEntity[];              // written by CopyAgent
    signals?: SignalSummary;          // written by OptimizationAgent
  };
  researchNotes?: string;             // written by ResearchAgent, read by all
  plannerDirectives?: string[];       // written by PlannerAgent
  lastUpdatedBy?: string;             // agentType
  lastUpdatedAt?: string;
}
```

**New `MissionEvent` type — `context_update`:**

When any agent writes to `agentMemory`, it emits a `context_update` event with:
```json
{ "agent": "CatalogAgent", "keys": ["entities.products"], "summary": "Found 12 products, 3 missing descriptions" }
```

**Agent contract change:**

Every agent function signature gains two optional parameters:
```typescript
async function runCopyAgent(
  payload: CopyAgentPayload,
  missionContext?: AgentMemory,        // READ from Mission.context.agentMemory
  emitContextUpdate?: (patch: Partial<AgentMemory>) => Promise<void>  // WRITE back
)
```

Agents that previously ignored context from other agents can now:
1. Read `missionContext.entities.products` to write product-aware copy.
2. Read `missionContext.researchNotes` to understand the store's competitive position.
3. Write their results to `agentMemory` so downstream agents can use them.

**Context reducer:**

Add a `mergeAgentMemory(current: AgentMemory, patch: Partial<AgentMemory>): AgentMemory` utility. This is called by `emitContextUpdate` before persisting to `Mission.context.agentMemory`. Last-write-wins per key, except arrays which merge by entity id.

### What not to do

- Do NOT require all agents to implement full context read/write on day one. Add the parameters as optional; existing agents continue to work unchanged.
- Do NOT store large binary data (images, full LLM responses) in `agentMemory`. Store references (URLs, IDs) only.
- Do NOT make `agentMemory` a separate Prisma model. It lives in `Mission.context` (already a JSON field). A separate model is premature until size or query patterns demand it.

### Acceptance criteria

- `CatalogAgent` writes discovered product entities to `Mission.context.agentMemory.entities.products`.
- `CopyAgent` reads from `agentMemory.entities.products` when generating descriptions.
- `MissionEvent` stream contains `context_update` events with agent attribution.
- Mission Execution UI can optionally display the current `agentMemory` state for debugging.

---

## 5. Foundation 3 — LLM-Inferred Opportunities

### Why this third

`IntentOpportunity` rows are currently generated by a rules engine (`no_first_offer`, `high_views_no_qr`, etc.). Rules are fast and predictable but cannot surface patterns they were not explicitly programmed for. A store with unusual signal patterns — high QR scans but low offer conversion, or a spike in a particular product category — will never generate an opportunity unless someone writes a rule for it.

The LLM service path (cache + budget guard) already exists. This foundation routes signal data through it to produce inference-based opportunities, closing the loop with genuine AI reasoning.

### What to build

**New Insights entry point — `opportunity_inference`:**

Add `opportunity_inference` to the insights orchestrator's `executeTask` switch. This is an async job (not user-facing blocking) triggered either on a schedule or when signal volume crosses a threshold.

**Job input:**

```typescript
interface OpportunityInferenceInput {
  storeId: string;
  windowDays: number;           // default 7
  existingOpportunityTypes: string[];  // avoid duplicating already-open opportunities
  signalSummary: {
    offer_view: number;
    qr_scan: number;
    cta_click: number;
    lead_capture: number;
    share_click: number;
    topOffers: { offerSlug: string; views: number }[];
  };
  storeContext: {
    productCount: number;
    activeOfferCount: number;
    hasQr: boolean;
    hasIntentFeed: boolean;
    hasSignage: boolean;
  };
}
```

**LLM prompt strategy:**

Route through `llm_generate_copy` task (or a new `llm_infer_opportunities` task using the same cache+budget path). Prompt instructs the model to return a JSON array of opportunity objects:

```json
[
  {
    "type": "boost_top_offer_with_qr",
    "title": "Your most-viewed offer has no QR code",
    "description": "...",
    "suggestedIntentType": "create_qr_for_offer",
    "suggestedPayload": { "offerId": "..." },
    "confidence": 0.87,
    "reasoning": "offer_view count is 3x average but qr_scan is 0"
  }
]
```

**Write to `IntentOpportunity`:**

Each inferred opportunity is written as a new `IntentOpportunity` row with `source: 'llm_inference'` (add this field to distinguish from rule-generated). The existing accept flow works unchanged — user accepts → `IntentRequest` created → mission executes.

**Budget guard:**

Use `LlmUsageDaily` to skip inference if daily budget is exceeded. Inferred opportunities are non-urgent; it is acceptable to skip a day.

### What not to do

- Do NOT replace the rules engine. Keep rule-based opportunities running as before. LLM inference is additive.
- Do NOT run inference on every signal event. Batch by store on a schedule (nightly) or on threshold (e.g., 50 new signals since last inference run).
- Do NOT surface LLM-inferred opportunities without the `confidence` score. The UI should display it so users can calibrate trust over time.

### Acceptance criteria

- `opportunity_inference` entry point is callable via the insights orchestrator.
- At least one `IntentOpportunity` with `source: 'llm_inference'` is created per store per day when signal data warrants it.
- Inferred opportunities appear in the existing Mission Inbox / Opportunities UI.
- Acceptance triggers an `IntentRequest` in the same way rule-based opportunities do.

---

## 6. What to Defer

The following items from the roadmap are important but should not block or interleave with the three foundations above.

| Item | Reason to defer |
|------|-----------------|
| **M2 — Unify Pipeline and AI Operator** | Requires Foundation 1 (common plan shape) to be in place first. Start M2 after Foundation 1 is stable. |
| **M3 — True agent checkpoint orchestration** | Requires Foundation 1 (plan steps) and Foundation 2 (context bus). Start M3 after both are stable. |
| **Entity framework adoption** | Architectural hygiene. Valuable but does not make the system more AI-native. Proceed in parallel, do not block on it. |
| **Device agent modularity** | Valuable for C-NET but independent of the agent intelligence stack. Schedule separately. |
| **Full LLM service migration** | Proceed incrementally per call site as features are touched. Do not attempt a bulk migration. |

---

## 7. Implementation Sequence for Cursor

### Phase 1 — Mission Planner (2–3 sessions)

**Session 1:** Define `MissionPlan` and `MissionPlanStep` TypeScript interfaces. Add `planIntent(intentType, payload)` function that returns deterministic plans for the five most common intent types: `create_offer`, `create_qr_for_offer`, `generate_tags`, `rewrite_descriptions`, `generate_store_hero`.

**Session 2:** Wire `planIntent` into `POST /api/mi/missions/:missionId/intents/:intentId/run`. Store plan in `Mission.context.missionPlan`. Emit `plan_created`, `step_started`, `step_completed` events to `MissionEvent` stream. Existing handlers run unchanged inside step execution.

**Session 3:** Wire into `POST /api/mi/orchestra/job/:jobId/run` for `MI_DRAFT_GOALS` and `build_store` entry points. Migrate Agent Chat chain plan to the same `MissionPlan` schema. Write a test that runs a `create_offer` intent end-to-end and asserts that `Mission.context.missionPlan` is populated with the correct steps and final statuses.

### Phase 2 — Agent Context Bus (2 sessions)

**Session 1:** Define `AgentMemory` interface. Add `mergeAgentMemory` utility. Update `CatalogAgent` to write discovered product entities to `Mission.context.agentMemory` via `emitContextUpdate`. Emit `context_update` `MissionEvent`.

**Session 2:** Update `CopyAgent` to read `missionContext.entities.products` when available. Update `PromotionAgent` to read `missionContext.entities.products` when constructing offer suggestions. Write a test that runs a `create_offer` intent and asserts that `CopyAgent` received product context from `CatalogAgent`.

### Phase 3 — LLM-Inferred Opportunities (2 sessions)

**Session 1:** Add `opportunity_inference` to insights orchestrator switch. Build `buildOpportunityInferencePrompt(input)` that constructs the signal summary prompt. Route through `llm_generate_copy` task (or new `llm_infer_opportunities` task). Parse and validate the JSON array response.

**Session 2:** Write inferred opportunities to `IntentOpportunity` with `source: 'llm_inference'` field (add field to schema). Add nightly schedule trigger (or signal-volume threshold). Write a test using a mocked LLM response that asserts the correct `IntentOpportunity` rows are created and that the existing accept flow works unchanged.

---

## 8. Constraints Cursor Must Respect

These are non-negotiable architectural rules derived from the system contract. Do not violate them while implementing the above.

1. **Artifact UIs never call LLM or orchestration APIs directly.** All AI execution goes through `IntentRequest` → Mission Execution → Orchestrator. If a UI component needs AI output, it creates an `IntentRequest`. This applies to any new UI surfaces built during this integration.

2. **When `missionId` is present, use `dispatchMissionIntent`.** No direct calls to `/api/mi/orchestra/start` from gated artifact UIs.

3. **All LLM calls go through the LLM service path** (`llm_generate_copy` task → LlmCache → LlmUsageDaily). Do not add new direct LLM provider calls in routes or handlers.

4. **`MissionEvent` is append-only.** Never update or delete `MissionEvent` rows. Always emit new events.

5. **Every completed `IntentRequest` must have a populated `result`.** The result must contain references (URLs or IDs) to the produced artifacts. Do not mark an intent `completed` with an empty result.

6. **`Mission.context` is a JSON field, not a relational expansion.** Do not add new Prisma models for plan or agentMemory during this phase. Use the existing JSON field. Migrate to dedicated models only if query patterns demand it.

---

## 9. The End State

When all three foundations are in place, the system loop becomes fully AI-native:

```
User expresses intent (any surface)
        ↓
Orchestrator produces MissionPlan (Foundation 1)
        ↓
Agents execute in order, reading/writing shared AgentMemory (Foundation 2)
        ↓
Artifacts are produced; signals are captured
        ↓
LLM infers new IntentOpportunities from signal patterns (Foundation 3)
        ↓
Opportunities surface in Mission Inbox → new intents → loop
```

At this point:
- Every execution path has a plan.
- Agents collaborate through shared memory rather than being isolated workers.
- The opportunity loop closes with genuine AI inference, not just rules.
- M2 (unified pipeline) and M3 (checkpoint orchestration) have the structural prerequisites they need.

Cardbey becomes an AI Business Operator — not a platform with AI features bolted on, but a system where AI reasoning drives every execution decision and every growth suggestion.

---

*This brief is intended to be placed in the Cardbey `/docs` directory and referenced at the start of each Cursor session during this integration phase.*
