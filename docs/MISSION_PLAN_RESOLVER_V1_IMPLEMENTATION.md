# Mission Plan Resolver v1 — Implementation Summary

**Goal:** Hybrid Mission Plan Resolver: deterministic final resolver + optional LLM-assisted intent interpretation. LLM is interpreter/advisor; resolver is judge. No LLM-owned execution decisions.

---

## 1. Files changed

| File | Change |
|------|--------|
| **Dashboard** | |
| `apps/dashboard/.../src/lib/missionPlan/missionPlanTypes.ts` | **New.** MissionPlan, MissionIntentHints, ResolveMissionPlanInput, SUPPORTED_MISSION_TYPES. |
| `apps/dashboard/.../src/lib/missionPlan/missionPlanTemplates.ts` | **New.** Templates for create_store, create_landing_page, create_offer, generate_social_content, analyze_performance, deploy_cnet. |
| `apps/dashboard/.../src/lib/missionPlan/resolveMissionPlan.ts` | **New.** Rule-based classifyByRules, safeSuggestedType (LLM hint validation), resolveMissionPlan, missionTypeToOrchestraGoal. |
| `apps/dashboard/.../src/lib/missionPlan/interpretIntentApi.ts` | **New.** fetchInterpretIntent(prompt) → POST /api/mi/interpret-intent. |
| `apps/dashboard/.../src/lib/missionPlan/index.ts` | **New.** Re-exports. |
| `apps/dashboard/.../src/lib/missionOrchestra.ts` | startMissionFromGoal accepts optional resolvedPlan; create_offer path creates mission only (no orchestra); startMissionFromPrompt(prompt, context) added. |
| `apps/dashboard/.../src/app/console/missions/missionStore.ts` | Mission: missionType?, objective?; createMission/updateMission accept and persist them. |
| `apps/dashboard/.../src/app/console/ExecutionDrawer.tsx` | When mission.missionType set and not create_store, show mission.objective (or missionType label) under Execution header. |
| **Backend** | |
| `apps/core/cardbey-core/src/lib/missionPlan/interpretMissionIntentWithLlm.js` | **New.** Uses llmCache (get/set), llmBudget (reserve/commit), kimiProvider; returns parsed MissionIntentHints or null. |
| `apps/core/cardbey-core/src/routes/miIntentsRoutes.js` | POST /api/mi/interpret-intent (requireAuth, body.prompt → interpretMissionIntentWithLlm → { ok, hints }). |

---

## 2. MissionPlan schema

```ts
type MissionPlan = {
  missionType: string;
  objective: string;
  primaryEntityType?: "store" | "promotion" | "product" | "landing_page" | "campaign" | "analysis";
  primaryEntityId?: string | null;
  requiredAuth: "guest_ok" | "account_required";
  steps: Array<{ id: string; label: string; kind: string; required: boolean }>;
  expectedArtifacts: Array<{ type: string; label: string }>;
  checkpoints: Array<{ type: string; label: string; blocking: boolean }>;
  metadata?: Record<string, unknown>;
};
```

---

## 3. Supported mission types and templates

| missionType | requiredAuth | Example steps | Expected artifacts |
|-------------|--------------|---------------|--------------------|
| create_store | guest_ok | validate_context, generate_store_assets, prepare_store_preview | draft_review, storefront_preview |
| create_landing_page | guest_ok | validate_context, generate_landing_copy, build_landing_surface, prepare_preview | landing_preview, public_page |
| create_offer | account_required | validate_offer_context, generate_offer_body, create_offer_surface, create_distribution_assets | offer_page, qr_link, feed_link |
| generate_social_content | account_required | validate_context, generate_content, prepare_preview | content_preview, social_posts |
| analyze_performance | account_required | load_signal_context, analyze_store_performance, summarize_findings | analysis_summary |
| deploy_cnet | account_required | validate_devices, assign_content, confirm_deploy | playlist, device_binding |

---

## 4. How LLM assist is wired to the existing LLM service path

- **Backend:** `interpretMissionIntentWithLlm(prisma, userPrompt, { tenantKey })` uses:
  - **Cache:** `hashPrompt`, `getCached`, `setCached`, `shouldSkipCacheForPrompt` from `lib/llm/llmCache.js` with purpose `mission_interpret`.
  - **Budget:** `checkAndReserveBudget`, `commitBudget`, `estimateTokens`, `isBudgetEnabled`, `isFailOpen` from `lib/llm/llmBudget.js`.
  - **Provider:** Dynamic import of `lib/llm/kimiProvider.js` → `generateText(prompt, { timeoutMs: 15000, maxRetries: 1 })`.
- **Flow:** Build compact prompt → cache lookup by hash → on miss: reserve budget → provider.generateText → parse JSON hints → commit budget, set cache → return hints. On any failure, returns `null`; resolver works without hints.

---

## 5. Safety rules when consuming llmHints

- **Only accept suggestedMissionType if it maps to a supported mission type** (`isSupportedMissionType(raw)`).
- **Ignore suggestion if confidence &lt; 0.5** (`safeSuggestedType`).
- **Rule-based classification wins over LLM** when both exist; resolver comment: "LLM assists interpretation; resolver owns final mission plan."
- **Auth, supported registry, and artifact constraints** are never bypassed by hints; final plan always comes from `MISSION_PLAN_TEMPLATES` and rule/safeSuggestedType.

---

## 6. Where launcher integration was added

- **New entry point:** `startMissionFromPrompt(prompt, context, { useLlmInterpret?: boolean })` in `missionOrchestra.ts`. Call this when the launcher has a **raw user prompt** (e.g. "Create a landing page for my flower business").
- **Existing flows unchanged:** `startMissionFromGoal(goal, context, title)` still used by ImproveDropdown / StoreDraftReview with explicit goals (generate_tags, etc.). Optional 4th param `options?: { resolvedPlan }` so when resolver was used upstream, mission gets missionType/objective.
- **create_offer:** When goal is `create_offer`, `startMissionFromGoal` creates the mission only (no POST orchestra/start); ExecutionDrawer shows "Launch your first offer" and user adds intent from there.

---

## 7. Before/after examples

| Prompt | Before (promptToGoal / behavior) | After (resolver → missionType, labels) |
|--------|----------------------------------|----------------------------------------|
| "Create a store for my bakery" | build_store, store wording | create_store, objective "Create a new store", store-oriented plan/artifacts |
| "Create a landing page for my flower business" | build_store (same as store) | create_landing_page, objective "Create a landing page", landing-page-oriented labels in Execution |
| "Launch my first offer" | create_promotion or null | create_offer, requiredAuth account_required, offer artifacts; mission created without orchestra job |

---

## 8. Logging / observability

- **Prefix:** `[MISSION_PLAN_RESOLVER]`
- **Dashboard (resolveMissionPlan):** `debugLog` in development for: rule vs LLM, fallback, resolved missionType/requiredAuth/primaryEntityType/reason. Controlled by `NODE_ENV === 'development'`.
- **Backend (interpretMissionIntentWithLlm):** `debugLog` when `MISSION_PLAN_RESOLVER_DEBUG=1` for cache hit, skip cache, provider load failure, budget not allowed, LLM error.
- Production: no log spam; reduce/remove by not setting `MISSION_PLAN_RESOLVER_DEBUG` and relying on NODE_ENV.

---

## 9. Manual verification checklist

- **Flow A — create store:** Enter "Create a store for my bakery" → expect missionType = create_store, requiredAuth = guest_ok, store-oriented plan/artifacts.
- **Flow B — create landing page:** Enter "Create a landing page for my flower business" → expect missionType = create_landing_page, objective/labels landing-page-oriented in Execution drawer (not default store wording).
- **Flow C — create offer:** Enter "Launch my first offer" → expect missionType = create_offer, account_required, offer artifacts; mission created without orchestra job; drawer shows offer CTA.
- **Flow D — analyze performance:** Enter "Analyze my store performance" → expect missionType = analyze_performance, account_required.
- **Flow E — ambiguous prompt:** Vague prompt → LLM hints may refine; final missionType still from supported resolver; no broken mission creation.
- **Flow F — no LLM / LLM failure:** Simulate interpret-intent unavailable or failure → deterministic resolver still works; mission creation does not fail.

---

## 10. Constraints respected

- Minimal diff; deterministic final authority; LLM assistive only; Single Runway preserved; current mission creation flow not destabilized.
