# Cardbey Agentic Integration — Implementation Plan

**Source:** [CARDBEY_CURSOR_AGENTIC_INTEGRATION_BRIEF.md](./CARDBEY_CURSOR_AGENTIC_INTEGRATION_BRIEF.md) (situational assessment + three foundations)  
**Purpose:** Concrete implementation plan for Cursor, aligned with existing Mission Plan Resolver v1 and Single Runway.

---

## 0. Pre-Implementation Review (mandatory before Session 1)

These decisions and safeguards were agreed before implementation to avoid regressions and scope creep.

### 0.1 Mission.context write audit and merge guarantee

**Audit result (done):** The only backend write to `Mission.context` is `mergeMissionContext(missionId, patch)` in `apps/core/cardbey-core/src/lib/mission.js`. It deep-merges `patch` into existing context and then updates the row. No handler or route performs a raw `prisma.mission.update({ data: { context: ... } })` that could replace the whole context.

**Before Session 2 (wiring planIntent):**

- Any new code that updates Mission.context **must** call `mergeMissionContext(missionId, patch)` with a **patch** (e.g. `{ missionPlan: { [intentId]: plan } }`), never a full context replace.
- Optional: export a pure `mergeContext(existing, patch)` from `mission.js` (same semantics as the internal `deepMerge`) for tests or for building patches; all persistence still goes through `mergeMissionContext`.

### 0.2 missionPlan storage: keyed by intentId

`Mission.context.missionPlan` is a single JSON field. A mission can run multiple intents (Mission Inbox can queue several). If we store a single plan, the second run overwrites the first.

**Decision:** Store plans as a **map by intentId**: `Mission.context.missionPlan = { [intentId]: ExecutionMissionPlan }`. When wiring planIntent in Session 2, use:

`mergeMissionContext(missionId, { missionPlan: { [intentId]: plan } })`

The existing `mergeMissionContext` deep-merge will add/update that intent’s plan without removing others. For M3 checkpoints and multi-intent missions, this is required.

**Size cap (Session 2 spec):** The missionPlan map has no DB-level size enforcement (JSON field; SQLite especially). A mission that runs many intents will accumulate many plan entries. **Explicit decision:** for current SMB scale, **accept accumulation** (no pruning). Revisit with a cap (e.g. keep last 10 by intentId or by createdAt) if context size becomes an issue; do not implement pruning in Session 2 unless product requires it.

### 0.3 Session 3 — Agent Chat chain plan: adapter only, no storage migration

The existing chain plan (execution_suggestions → cursor → maybeAutoDispatch) has its own advance/retry/skip logic and lives in `Mission.context.chainPlan`. Session 3 must **not** migrate that storage or change that behavior.

**Scope for Session 3:** Add an **adapter** that exposes the chain plan as an ExecutionMissionPlan **read view** so the Mission Execution UI can display both “chain plan” and “intent run plan” under one contract. Migration of the underlying chain plan storage format is a **follow-up** after Foundation 1 is stable. Doing both in one session risks breaking the only execution path that currently has a plan.

### 0.4 Foundation 2 — Agent contract guard

New optional params `missionContext` and `emitContextUpdate` will be added to agent functions. Not all callers (intent run, orchestra job, agent chat, insights) will pass them on day one.

**Contract (in function signatures, not only comments):**

- Every agent that reads `missionContext` must be **null-safe** (e.g. `missionContext?.entities?.products ?? []`).
- `emitContextUpdate` must **default to a no-op** when not passed (e.g. `emitContextUpdate = () => {}` or `emitContextUpdate = () => Promise.resolve()` in the function signature).

### 0.5 Foundation 3 — IntentOpportunity.source

**Schema check (done):** In `prisma/postgres/schema.prisma`, the `IntentOpportunity` model does **not** have a `source` field. Add it via migration.

**Implementation:**

- Add `source` (e.g. `String?` or `String @default("rules")`); allow `'rules'` and `'llm_inference'`.
- Ensure any **existing** rule-based writer that creates IntentOpportunity sets `source: 'rules'` (or the default) so that UI filtering with `WHERE source = 'llm_inference'` is correct and rule-generated opportunities are not treated as LLM-inferred.

---

## 1. How the brief relates to what exists

| Brief concept | Current state | Relationship |
|---------------|---------------|--------------|
| **Mission plan (execution)** | Not present | Foundation 1 introduces **execution** plan: steps with agentType, status, checkpoint, stored in `Mission.context.missionPlan` when an intent **runs**. |
| **Mission Plan Resolver v1** (already built) | Resolver + templates + startMissionFromPrompt | Resolver answers “what kind of mission” at **creation** (missionType, objective, auth). It does **not** produce the step-by-step execution plan used at **run** time. Both can coexist: resolver for launcher/display; `planIntent()` for run-time plan. |
| **Agent context / shared memory** | Each agent runs in isolation | Foundation 2 adds `Mission.context.agentMemory` and optional read/write in agents. |
| **Opportunity inference** | Rule-based IntentOpportunity only | Foundation 3 adds LLM-inferred opportunities via existing LLM path. |

**Conclusion:** Implement the three foundations in order. Resolver v1 stays as-is for launcher and labels; Foundation 1 adds **planIntent(intentType, payload, context)** and **execution** MissionPlan in `Mission.context.missionPlan` (distinct from the resolver’s plan shape).

---

## 2. Foundation 1 — Orchestrator-produced mission plan (execution)

**Goal:** Every intent run gets a `MissionPlan` in `Mission.context.missionPlan` **before** the first agent runs. Plan has steps (stepId, order, agentType, label, dependsOn, checkpoint, status, optional intentRequestId). Events: `plan_created`, `step_started`, `step_completed`, `step_checkpoint`.

### 2.1 Schema (execution plan, not resolver plan)

Use a **separate** shape for execution so we don’t overload the resolver’s MissionPlan:

```typescript
// Backend: Mission.context.missionPlan (execution plan)
interface ExecutionMissionPlan {
  planId: string;
  intentType: string;
  intentId: string;        // IntentRequest.id this plan is for
  createdAt: string;      // ISO
  steps: ExecutionPlanStep[];
}

interface ExecutionPlanStep {
  stepId: string;
  order: number;
  agentType: 'CatalogAgent' | 'CopyAgent' | 'MediaAgent' | 'PromotionAgent' | 'ResearchAgent' | 'PlannerAgent';
  label: string;
  dependsOn: string[];    // stepIds
  checkpoint: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  intentRequestId?: string;
}
```

- **Resolver MissionPlan** (dashboard): missionType, objective, steps (high-level), expectedArtifacts, checkpoints — used at mission **creation** and for UI labels.
- **Execution MissionPlan** (backend): planId, intentType, intentId, steps with agentType/status — used when an **intent is run**.

**Intent-type step mapping (Session 1):**  
- **Single-artifact intents** (e.g. `create_offer`, `create_qr_for_offer`, `generate_store_hero`): may include CopyAgent with checkpoint (user review before apply) and PromotionAgent where relevant.  
- **Catalog batch intents** (`generate_tags`, `rewrite_descriptions`): run across many products, not a single artifact. They typically have **no** CopyAgent checkpoint (no user review before writing tags/descriptions to many products) and **no** PromotionAgent step. Step mappings must reflect this so tests and Mission Execution UI are correct from the start.  
- **Mental check before defining steps for each intent:** “What would the user see in Mission Execution UI as this runs?” If unclear, the step mapping is probably wrong.

**planIntent contract — pure function (Session 1):**  
- **Decision:** `planIntent` is **pure**: `(intentType, payload, context)` in → `ExecutionMissionPlan` out, **no DB reads**. No lookups for existing offers, product count, or store state to decide steps.  
- Rationale: tests are trivial and fast (no fixtures); context-aware planning (e.g. “does this store already have offers?” to add a ResearchAgent step) is a **later upgrade**.  
- Before writing tests, confirm this boundary: if the implementation stays pure, assertions only need intentType + payload → expected steps and checkpoint flags.

### 2.2 Implementation tasks

**Session 1 — Plan shape and planIntent (deterministic)**  
- Add `ExecutionMissionPlan` / `ExecutionPlanStep` types (backend: e.g. `src/lib/missionPlan/executionPlanTypes.js` or shared types).  
- Implement `planIntent(intentType, payload, context)` as a **pure function** (no DB):  
  - Deterministic mapping for: `create_offer`, `create_qr_for_offer`, `generate_tags`, `rewrite_descriptions`, `generate_store_hero`.  
  - Single-artifact intents: steps and checkpoints as above (e.g. CopyAgent checkpoint: true for create_offer where user reviews before apply).  
  - Batch intents (`generate_tags`, `rewrite_descriptions`): no CopyAgent checkpoint, no PromotionAgent step; steps reflect “user sees batch progress,” not per-artifact review.  
- Add tests: given intentType + payload, assert returned plan has expected steps and checkpoint flags (no DB/fixtures).

**Session 2 prep — missionId availability (verified):**  
- In `POST /api/mi/missions/:missionId/intents/:intentId/run`, `missionId` is already available from `req.params.missionId` (and validated with intent via `findFirst({ id: intentId, missionId })`). No need to load the parent Mission row to get missionId; no extra query for planIntent wiring.

**Session 2 — Wire into POST run and events**  
- In `POST /api/mi/missions/:missionId/intents/:intentId/run`:  
  - Before existing handler: call `planIntent(intent.type, payload, { missionId, intentId })`.  
  - Merge result into `Mission.context.missionPlan` **keyed by intentId**: `mergeMissionContext(missionId, { missionPlan: { [intentId]: plan } })` (see §0.1, §0.2).  
  - Emit `MissionEvent` type `plan_created` with payload `{ planId, intentId, stepCount }`.  
  - Then run existing handler; where the handler runs an agent, emit `step_started` / `step_completed` for the corresponding step (match by agentType or stepId).  
- Ensure `MissionEvent` is append-only.  
- No refactor of handler internals yet; wrap only.

**Partial step coverage (known gap):**  
- `create_offer`, `create_qr_for_offer`, `mi_assistant_message`, and publish intents get `plan_created` but **no** `step_started` / `step_completed` events. The Mission Execution UI will therefore show a plan with steps that never transition from pending. **Follow-up:** Wire step events for these intent types in a dedicated pass; otherwise the UI will look like a bug when built against the event stream.

**getOrCreateMission before merge (Session 2 / near-term cleanup):**  
- If the Mission row doesn’t exist and `getOrCreateMission` fails (e.g. silently ignored), `mergeMissionContext` no-ops and the intent runs without a persisted plan; `plan_created` may still emit with a planId that points to nothing. **Improvement:** In the intent run path, distinguish “mission already exists” (safe) from “mission creation failed” — use a try/catch that **logs a warning** when creation fails (e.g. `console.warn('[MI Intents] getOrCreateMission failed (plan may not be persisted):', e.message)`), and does not rethrow. Do not blanket-ignore errors.

**Session 3 — Two tasks (hard boundary between them)**  

**Session 3 pre-check (verified in `miRoutes.js`):**  

1. **Is `missionId` on the OrchestratorTask record?** **No.** Task create uses `tenantId`, `userId`, `insightId`, `entryPoint`, `status`, `request`. No `missionId` field. **Decision:** Use **jobId as the plan key** in `Mission.context.missionPlan` for orchestra jobs. Document clearly; treat "associate orchestra job with mission" as a follow-up for M2 unification. Task A proceeds with `missionPlan[jobId]` fallback — plan is stored and emitted, queryable by jobId until M2 wires job ↔ mission.  

2. **What shape is `entryPoint`?** String. Values: `build_store`, `fix_catalog`, and MI_DRAFT_GOALS: `autofill_product_images`, `fill_missing_images`, `repair_product_images`, `generate_tags`, `rewrite_descriptions`, `generate_store_hero`, `set_store_hero_from_item`, `mi_command`. Overlap with `planIntent` intent types: `generate_tags`, `rewrite_descriptions`, `generate_store_hero`. **Decision:** Do **not** extend `planIntent` to accept orchestra vocabulary. Use a **mapping layer** or a separate **planOrchestraJob(entryPoint, request)**; a higher-level resolver picks which to call (planIntent for intent types, planOrchestraJob for entry points where a plan is desired).  

3. **Is `missionId` on the request body for orchestra start?** **No.** `POST /api/mi/orchestra/start` body has `goal`, `rawInput`, `storeType`, `storeId`, `tenantId`, `generationRunId`, `draftId`, `entryPoint`, etc. No `missionId`. By the time `POST /api/mi/orchestra/job/:jobId/run` runs, the task has no missionId. **Conclusion:** Same as (1) — use jobId as key; no block for Session 3.

**Task A — Orchestra job run plan wiring (do not touch Agent Chat)**  
- Use **jobId** as the plan key: `mergeMissionContext(missionIdOrJobId, { missionPlan: { [jobId]: plan } })`. For orchestra, the Mission row may not exist; ensure a Mission row exists (e.g. getOrCreateMission with a **stable identity** — see below).  
- **Migration:** Add nullable **missionId** to OrchestratorTask in `prisma/postgres/schema.prisma`: `missionId String?` and `@@index([missionId])`. No relation declaration; formal Mission relation in M2. Run `npm run db:migrate` (or `prisma migrate dev --schema prisma/postgres/schema.prisma`) to generate the migration.  
- **transitionOrchestratorTaskStatus verification:** Every OrchestratorTask update is (1) **transitionService.js** — `data: { status, updatedAt, result? }` only, or (2) **miRoutes.js** (orchestra start) — one direct update with `data: { request, updatedAt }` only. No full-row spread; missionId is safe.  
- **Wiring sequence in job run handler:** (1) Load task by jobId. (2) getOrchestratorMission with entry-point-specific title. (3) `prisma.orchestratorTask.update({ where: { id: jobId }, data: { missionId } })`. (4) planOrchestraJob(entryPoint, request). (5) mergeMissionContext(missionId, { missionPlan: { [jobId]: plan } }). (6) Emit plan_created. (7) Existing job execution unchanged. **Fail-safe:** If 2–5 throw, log warning and continue — do not abort the job.  
- **Step labels:** Use user-facing labels (e.g. "Generating store draft", "Filling product images", "Writing product descriptions") not internal names like "CatalogAgent step 2".  
- **Entry point → plan:** Implement **planOrchestraJob(entryPoint, request)**; delegate overlap to planIntent; orchestra-specific plans for build_store, fix_catalog, etc.  
- In `POST /api/mi/orchestra/job/:jobId/run`: after loading task, run steps 2–6 then continue with existing execution (step 7).  
- Emit step events where job steps map to plan steps (optional for Task A minimal slice).  
- **Boundary:** Do not modify Agent Chat code in this task.  
- **Task A readiness (verified):**  
  1. **OrchestratorTask result write pattern** — **Confirmed:** All result writes go through `transitionOrchestratorTaskStatus` (kernel/transitions/transitionService.js). That function does a **full replace**: `data: { status, updatedAt, result }` (line 344–353). So any `_meta.missionId` written at the **start** of the job run would be **overwritten** when the job completes or fails (build_store in orchestraBuildStore.js; MI_DRAFT_GOALS in miRoutes.js runners).  
  **Decision:** **Option B preferred.** Add **missionId** column to OrchestratorTask (schema migration). At start of job run: getOrCreateMission → `prisma.orchestratorTask.update({ where: { id: jobId }, data: { missionId } })`. No result merge; all existing result writes stay as-is. Retrieval: task by jobId → task.missionId → Mission. Unblocks M2 unification. If Option A is used instead: write _meta.missionId **after** the final result (e.g. second update that merges existing result with _meta), or merge _meta into every transitionOrchestratorTaskStatus result payload (many call sites in miRoutes + orchestraBuildStore — fragile).  
  2. **getOrchestratorMission title** — Use the **explicit mapping** below; do not leave titles to Cursor to invent.  
- **planOrchestraJob(entryPoint, request):** Delegate overlap entries to planIntent. Implement orchestra-specific plans for build_store and MI_DRAFT_GOALS with the **step definitions below**.  

**Task A — Title mapping (specify in code, not ad hoc)**  

Use this mapping when calling getOrCreateMission so the Mission Execution UI list is useful:

```javascript
const ORCHESTRA_MISSION_TITLES = {
  build_store:              'Build Store',
  fix_catalog:              'Fix Catalog',
  autofill_product_images:  'Autofill Product Images',
  fill_missing_images:      'Fill Missing Images',
  repair_product_images:    'Repair Product Images',
  generate_tags:            'Generate Tags',
  rewrite_descriptions:     'Rewrite Descriptions',
  generate_store_hero:      'Generate Store Hero',
  set_store_hero_from_item: 'Set Store Hero',
  mi_command:               'MI Command',
};
const title = ORCHESTRA_MISSION_TITLES[entryPoint] ?? `Orchestra: ${entryPoint}`;
```

The fallback `Orchestra: ${entryPoint}` handles future entry points without the mapping going stale.

**Task A — planOrchestraJob step definitions (specify now)**  

- **build_store:** Four steps, matching what orchestraBuildStore actually does:  
  1. ResearchAgent — "Analysing store input" — checkpoint: false  
  2. CatalogAgent — "Building product catalogue" — checkpoint: false  
  3. MediaAgent — "Generating store visuals" — checkpoint: false  
  4. CopyAgent — "Writing product descriptions" — checkpoint: true  

- **MI_DRAFT_GOALS:** Steps must be **dynamic** from request/productIds — only include steps that will actually run. For example: if `request.productIds` is empty, do **not** include an autofill_product_images step (it would complete with nothing to do). Build the steps array from which runners are active (autofill, tags, rewrite, hero, set_store_hero_from_item, mi_command) so the UI plan is honest about what will run. Do not hardcode all possible steps every time.

**Foundation 1 close-out test (after Task A is wired)**  

Before moving to Foundation 2, run one end-to-end check that covers the full retrieval path:

1. Start an orchestra job (e.g. build_store) via `POST /api/mi/orchestra/start`.  
2. Run it via `POST /api/mi/orchestra/job/:jobId/run`.  
3. Assert **OrchestratorTask.missionId** is set.  
4. Assert **Mission.context.missionPlan[jobId]** exists with correct steps.  
5. Assert **MissionEvent** stream contains `plan_created` with matching planId.  
6. Assert **chainPlanToExecutionPlan**(mission with chain plan) returns a valid ExecutionMissionPlan.  

If all six pass, Foundation 1 is complete — every execution path has a plan, the retrieval path works, and the UI has a unified shape. Foundation 2 can start immediately after.

**How to run the Foundation 1 close-out E2E (Vitest):**  
- E2E test file: `apps/core/cardbey-core/src/test/e2e/foundation1-closeout.e2e.test.js`.  
- **Prerequisites:** Server running with the **same** DATABASE_URL as the test (so the test can see the data). Auth token for orchestra start/run.  
- **Commands:**  
  1. Start API with test DB (one terminal):  
     `cd apps/core/cardbey-core`  
     `$env:DATABASE_URL="file:./prisma/test.db"; $env:NODE_ENV="test"; npm run start:api`  
     (Or use your postgres test URL if you use postgres for tests.)  
  2. Get a JWT (e.g. login via POST /api/auth/login or from your app).  
  3. Run the E2E test:  
     `$env:E2E_AUTH_TOKEN="Bearer YOUR_JWT"; npm run test:e2e:foundation1`  
- Or run only the Vitest E2E file:  
  `npx vitest run src/test/e2e/foundation1-closeout.e2e.test.js`  
  (Set E2E_API_BASE_URL if the API is not on localhost:3001; set E2E_AUTH_TOKEN for the HTTP steps. Test 6 runs without server/token.)

**Task B — Agent Chat adapter (read-only)**  
- **Contract:** The adapter is a **transformation function only**. Input: `Mission.context.chainPlan`. Output: an **ExecutionMissionPlan-shaped** object for UI consumption. It does **not** write to `Mission.context`. The existing chain plan logic (advance/retry/skip, cursor, storage) is **untouched**.  
- Implement `chainPlanToExecutionPlan(chainPlan) → ExecutionMissionPlan` as a **pure function**.  
- **Cursor → step status (required):** Chain plans have a **cursor** pointing mid-sequence (some steps already completed when the adapter is called). The function **must** set: **steps before cursor** → `status: 'completed'`; **step at cursor** → `status: 'running'` (if currently active) or `'failed'` when `chainPlan.status === 'blocked_error'`; **steps after cursor** → `status: 'pending'`. If every step is mapped to pending, the UI will show a misleading plan state for in-progress missions.  
- Wire so the Mission Execution UI can call one endpoint (or one code path) to get a unified plan view whether execution came from intent run or Agent Chat.  
- **Risk control:** Once inside Agent Chat code, do not "clean up" or migrate chain plan storage; adapter = read-only view only.

- **No dependencies on Task A:** Task B can be implemented and tested first (pure function, no DB or route dependency).

**Session 3 E2E**  
- E2E test: run `create_offer` intent → assert `Mission.context.missionPlan` exists (e.g. `missionPlan[intentId]`), has correct steps, and event stream has `plan_created` then `step_started`/`step_completed`.

**Files to touch (indicative)**  
- New: `apps/core/cardbey-core/src/lib/missionPlan/planIntent.js` (or .ts), `executionPlanTypes.js`.  
- Modify: `apps/core/cardbey-core/src/routes/miIntentsRoutes.js` (POST run: call planIntent, merge context, emit events).  
- Modify: `apps/core/cardbey-core/src/routes/miRoutes.js` (job run: planIntent + context + events for build_store / MI goals).  
- Mission model: already has `context` (JSON); no Prisma migration.

---

## 3. Foundation 2 — Agent context bus (shared working memory)

**Goal:** `Mission.context.agentMemory` holds entities and notes; agents can read it and write via `emitContextUpdate`; `context_update` events emitted.

### 3.1 Schema

```typescript
// Mission.context.agentMemory
interface AgentMemory {
  entities?: {
    products?: ProductEntity[];
    offers?: OfferEntity[];
    copy?: CopyEntity[];
    signals?: SignalSummary;
  };
  researchNotes?: string;
  plannerDirectives?: string[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
}
```

- Keep entities/copy as references (IDs, URLs); no large blobs.

### 3.2 Implementation tasks

**Session 1 — AgentMemory and merge**  
- Define `AgentMemory` and entity shapes (shared or backend).  
- Implement `mergeAgentMemory(current, patch)` (last-write-wins per key; arrays merge by id where applicable).  
- In intent run path, after loading Mission: pass `mission.context?.agentMemory` into agent calls.  
- Add optional `emitContextUpdate(patch)` that: merges patch into current agentMemory, writes back to `Mission.context.agentMemory`, emits `MissionEvent` type `context_update` with agent and keys.  
- Update **CatalogAgent** (or equivalent) to accept `missionContext` and `emitContextUpdate`; on success, call `emitContextUpdate({ entities: { products: [...] } })`.  
- **Contract:** All agents that read `missionContext` must use null-safe access (e.g. `missionContext?.entities?.products ?? []`); `emitContextUpdate` must default to a no-op when not passed (see §0.4).

**Session 2 — CopyAgent and PromotionAgent read context**  
- **CopyAgent:** When generating descriptions, if `missionContext?.entities?.products` is present, use it (e.g. product names/ids) in the prompt or payload.  
- **PromotionAgent:** When creating offer suggestions, if products exist in agentMemory, use them.  
- Test: run a flow that runs CatalogAgent then CopyAgent; assert CopyAgent receives product context and that `context_update` events appear.

**Files to touch (indicative)**  
- New: `apps/core/cardbey-core/src/lib/missionPlan/agentMemory.js` (mergeAgentMemory, types).  
- Modify: `apps/core/cardbey-core/src/services/miAgents/catalogAgent.js`, `mediaAgent.js` (or the actual agent entry points used in miIntentsRoutes); add optional params and emitContextUpdate wiring.  
- miIntentsRoutes: when calling agents, pass context and emitContextUpdate.

---

## 4. Foundation 3 — LLM-inferred opportunities

**Goal:** New orchestrator entry point `opportunity_inference`; uses existing LLM path; writes `IntentOpportunity` rows with `source: 'llm_inference'`; existing accept flow unchanged.

### 4.1 Implementation tasks

**Session 1 — Entry point and prompt**  
- Add `opportunity_inference` to insights orchestrator `executeTask` switch.  
- Build `OpportunityInferenceInput` from store + signals (windowDays, signalSummary, storeContext, existingOpportunityTypes).  
- Build prompt for LLM (via `llm_generate_copy` task or a dedicated `llm_infer_opportunities` task using same cache + budget).  
- Parse and validate JSON array of opportunity objects (type, title, description, suggestedIntentType, suggestedPayload, confidence, reasoning).  
- Enforce budget: if LlmUsageDaily would be exceeded, skip inference and return.

**Session 2 — Write opportunities and trigger**  
- Add `source` to `IntentOpportunity` via schema migration (§0.5: field is **not** present today). Use default `'rules'`; allow `'llm_inference'`. Ensure existing rule-based writers set `source: 'rules'` (or rely on default).  
- For each validated inferred opportunity, create `IntentOpportunity` with `source: 'llm_inference'` and same fields as today (storeId, type, summary, recommendedIntentType, payload, etc.).  
- Trigger: nightly job or when signal volume crosses threshold (e.g. 50 new signals since last run); store last-inference timestamp per store if needed.  
- Test: mock LLM response → assert IntentOpportunity rows created and accept → IntentRequest flow works.

**Files to touch (indicative)**  
- `apps/core/cardbey-core/src/orchestrator/api/insightsOrchestrator.js`: add case `opportunity_inference`.  
- New: handler or module that builds prompt, calls LLM path, parses response, writes IntentOpportunity.  
- Prisma: add `source` to IntentOpportunity if missing.

---

## 5. Constraints (from the brief)

- Artifact UIs never call LLM or orchestration directly; all execution via IntentRequest → Mission → Orchestrator.  
- When missionId is set, use dispatchMissionIntent; no direct `/api/mi/orchestra/start` from gated artifact UIs.  
- All LLM usage through LLM service path (cache + budget).  
- MissionEvent append-only.  
- Every completed IntentRequest has a non-empty result with artifact references.  
- Mission.context used as JSON for missionPlan and agentMemory; no new Prisma models for these in this phase.

---

## 6. Suggested order of work

| Phase | Scope | Outcome |
|-------|--------|--------|
| **Foundation 1** | planIntent, ExecutionMissionPlan, wire into intent run + job run, events | Every intent run has a plan in context and plan_created / step_* events. |
| **Foundation 2** | AgentMemory, mergeAgentMemory, CatalogAgent write, CopyAgent/PromotionAgent read | Agents share working memory; context_update events. |
| **Foundation 3** | opportunity_inference, LLM prompt, IntentOpportunity.source | Inferred opportunities appear in Mission Inbox; accept flow unchanged. |

Defer (as in brief): M2 unification until Foundation 1 is stable; M3 checkpoints until 1 + 2; entity framework and device modularity in parallel; full LLM migration incrementally.

---

## 7. Optional: Resolver vs execution plan alignment

- **Option A (recommended):** Keep two shapes. Resolver plan = creation/display (missionType, objective, high-level steps). Execution plan = run-time (planId, intentId, steps with agentType/status). No need to unify them; they serve different moments in the lifecycle.  
- **Option B:** Later, have the resolver or a backend “planner” produce an execution plan at creation time for known mission types, and reuse it at first intent run. This can be a follow-up once Foundation 1 is stable.

---

## 8. Summary

- **Foundation 1:** Add `planIntent()` and execution `MissionPlan` in `Mission.context.missionPlan`; wire into intent run and orchestra job run; emit `plan_created` and step events.  
- **Foundation 2:** Add `Mission.context.agentMemory` and optional agent read/write; mergeAgentMemory; CatalogAgent write, CopyAgent/PromotionAgent read; `context_update` events.  
- **Foundation 3:** Add `opportunity_inference` entry point; LLM path → parsed opportunities → IntentOpportunity with `source: 'llm_inference'`; trigger on schedule or threshold.  

This plan follows the brief’s sequence and constraints and fits the existing Mission Plan Resolver v1 and Single Runway without breaking them.

---

## 9. UI wiring gap (current state)

**The Mission Console UI is not yet wired to the foundation implementation.** Backend (F1/F2/F3) may be in place, but the dashboard does not yet consume the execution plan or foundation-specific data.

| What exists (backend) | What the UI uses today | Gap |
|----------------------|------------------------|-----|
| `Mission.context.missionPlan` (F1: execution plan by intentId) | Resolver’s `plan` (creation-time shape) | UI never reads `context.missionPlan` or a unified execution-plan endpoint. |
| `plan_created` / `step_started` / `step_completed` events (F1) | Reconciled/resolver-derived status | Drawer does not subscribe to or display execution-step events from the foundation. |
| `Mission.context.agentMemory` (F2) | — | No UI surface to show agent memory or context_update. |
| `IntentOpportunity.source === 'llm_inference'` (F3) | `getStoreOpportunities(storeId)` | UI can show opportunities but may not filter or label by `source`. |

**Work to bring the UI up to date (Mission Execution UI plan source):**

1. **Execution plan in the drawer**  
   - Add (or use) an API that returns the **execution** plan for the current mission: e.g. `Mission.context.missionPlan` for the active intent/job, or `chainPlanToExecutionPlan(mission)` when the run came from Agent Chat.  
   - In the dashboard: fetch this plan when the Execution drawer is open (e.g. by `missionId` and optionally `jobId`/`intentId`).  
   - Render **ExecutionMissionPlan** (steps with `agentType`, `label`, `status`) in the drawer instead of (or in addition to) the resolver plan.  
   - Optionally: subscribe to MissionEvent stream for `plan_created`, `step_started`, `step_completed` and update step status in real time.

2. **Step events for all intents**  
   - Ensure intent runs that currently only get `plan_created` also emit `step_started`/`step_completed` (e.g. create_offer, create_qr_for_offer, publish intents). Otherwise the drawer will show steps stuck in “pending”.

3. **F3 opportunities in the UI**  
   - When displaying Growth opportunities, include or filter by `source` (e.g. `llm_inference` vs `rules`) if the API returns it, so users can see LLM-inferred opportunities.

**Implementation (done):** The dashboard now (1) fetches mission context via `GET /api/missions/:missionId` when the Execution drawer is open; (2) when `context.missionPlan` is present, shows an **Execution plan** section with steps (agentType, label, status) from the backend; (3) displays a **source** badge (Rules / AI suggestion) on both Growth and Promotion opportunities. See `ExecutionDrawer.tsx`, `missionIntent.ts` (`getMissionFromApi`), and `missionStore.ts` (execution plan types).
