# MI System Audit + Plan: Convert Store Creation into MI Task

**Locked rule:** No code changes in this audit. Before any refactor/integration, assess risk to store creation + publish workflow; prefer minimal diffs and incremental changes.

---

## A) Repo Map (what to inspect)

### Store creation flow (frontend)
| Area | Path | Notes |
|------|------|--------|
| Quick Start / Create entry | `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` | `quickStartCreateJob()` builds payload, calls POST `/api/mi/orchestra/start`, then navigates to review. |
| Create page | `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/CreatePage.tsx` | Uses `useQuickStartOptions`, builds payload, calls `quickStartCreateJob(navigate, payload)`. |
| Features (#create) | `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx` | Same: `quickStartCreateJob` for form/chat/ocr/url; handles guest retry. |
| Review UI | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | Main review: `jobId`, `baseDraft`, `useOrchestraJobUnified`, `handlePublish`, `runWithAuth`/`runWithOwnershipGate`, publish flow, MICreationTimeline. |
| Orchestra client | `apps/dashboard/cardbey-marketing-dashboard/src/lib/orchestraClient.ts` | Types and helpers for job shape; `apiGET`/`apiPOST` to `/api/mi/orchestra/*`. |

### Store creation flow (backend)
| Area | Path | Notes |
|------|------|--------|
| Orchestra start | `apps/core/cardbey-core/src/routes/miRoutes.js` | POST `/api/mi/orchestra/start`: creates `OrchestratorTask`, ensures draft, calls `runBuildStoreJob` (auto-run). |
| Build-store job | `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | `runBuildStoreJob(prisma, jobId, draftId, generationRunId)`: atomic queued→running, `generateDraft(draftId)`, then marks task completed/failed. |
| Draft generation | `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | `generateDraft(draftId)` → `generateDraftTwoModes()`; paid_ai path wrapped in `withPaidAiBudget()`; calls catalog/hero/image logic. |
| Draft creation (from start) | `apps/core/cardbey-core/src/routes/miRoutes.js` (handleOrchestraStart) | Ensures draft via draftStore routes / create; passes `draftId`, `generationRunId` into `runBuildStoreJob`. |

### Publish flow
| Area | Path | Notes |
|------|------|--------|
| Publish API | `apps/core/cardbey-core/src/routes/stores.js` | POST `/api/store/publish` (requireAuth), body `storeId`, `generationRunId`; calls `publishDraft(prisma, { storeId, generationRunId, userId })`. |
| Publish service | `apps/core/cardbey-core/src/services/draftStore/publishDraftService.js` | `publishDraft()`: `findTargetDraft`, ownership check via `isDraftOwnedByUser`, commit draft to Business + Products. |
| Frontend publish | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | `handlePublish` → `runWithOwnershipGate` → `runWithAuth` → `publishStore()` from `@/api/storeDraft` (POST `/api/store/publish`). |
| Store draft API (publish) | `apps/dashboard/cardbey-marketing-dashboard/src/api/storeDraft.ts` | `publishStore(request)` → fetch POST buildApiUrl(API.STORE_PUBLISH), returns `needsLogin`, `publishedStoreId`, `storefrontUrl`. |

### MI Shell UI
| Area | Path | Notes |
|------|------|--------|
| MI Shell / entry | `apps/dashboard/cardbey-marketing-dashboard/src/app/AppShell.tsx` | Imports `MiShell`; MiConsoleContextProvider, DraftModeProvider. |
| MI Console | `apps/dashboard/cardbey-marketing-dashboard/src/components/mi/MiConsole.tsx` | Chat/console UI. |
| MI Helper Panel | `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` | Helper panel for MI. |
| Job timeline (store) | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/MICreationTimeline.tsx` | Displays single job: status (queued/running/completed/failed), progressPct, currentStage, stageResults, failureReason. |
| Job polling | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | `useOrchestraJobUnified(jobId)` → GET `/api/mi/orchestra/job/:jobId` polling. |

### Job / queue / worker
| Area | Path | Notes |
|------|------|--------|
| Job API | `apps/core/cardbey-core/src/routes/miRoutes.js` | POST `/api/mi/orchestra/start` (create job + auto-run); GET `/api/mi/orchestra/job/:jobId` (status, result); no separate /run, /retry, /cancel, /approve. |
| Task model | `apps/core/cardbey-core/prisma/schema.prisma` | `OrchestratorTask`: id, entryPoint, tenantId, userId, status, request (Json), result (Json). No `mi_job_steps` table. |
| Execution | `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | `runBuildStoreJob` runs in `setImmediate` (same process); no BullMQ/Redis/Temporal. |

### Tool registry
| Area | Path | Notes |
|------|------|--------|
| Registry | `apps/core/cardbey-core/src/orchestrator/toolsRegistry.js` | In-memory: `registerTools()`, `getToolByName()`, `findToolsByEngine()`, `listTools()`. |
| Init | `apps/core/cardbey-core/src/orchestrator/toolsRegistry.js` | `initializeToolsRegistry()` loads loyalty engine tools only; no store.* / image.* / publish.* skills. |
| Executor | `apps/core/cardbey-core/src/orchestrator/runtime/toolExecutor.js` | `getToolByName()` from registry; used by orchestrator run path. |
| Orchestrator run | `apps/core/cardbey-core/src/orchestrator/api/orchestratorRoutes.js` | POST `/api/orchestrator/run` (legacy); store creation does not go through this—it uses miRoutes orchestra/start + runBuildStoreJob. |

### LLM calls
| Area | Path | Notes |
|------|------|--------|
| AI service | `apps/core/cardbey-core/src/services/aiService.js` | Direct `OpenAI` client; `openai.chat.completions.create()` in multiple functions; no single gateway abstraction. |
| Menu visual / images | `apps/core/cardbey-core/src/services/menuVisualAgent/menuVisualAgent.ts` | Uses `openaiImageService.js` (generateMenuItemImage); Pexels then OpenAI fallback. |
| OpenAI image | `apps/core/cardbey-core/src/services/menuVisualAgent/openaiImageService.js` (inferred) | Image generation; called from menuVisualAgent. |
| Draft generation | `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | Catalog/hero/images; AI calls are inside this service and aiService—not behind a single LLM gateway; no mi_llm_calls logging. |

### Billing / credits
| Area | Path | Notes |
|------|------|--------|
| Balance API | `apps/core/cardbey-core/src/routes/billing.js` | GET `/api/billing/balance` (requireAuth); returns aiCreditsBalance, welcomeFullStoreRemaining. |
| Credits service | `apps/core/cardbey-core/src/services/billing/creditsService.js` | getBalance, grantWelcomeBundleOnRegister, estimateCost, canSpend, spendCredits, consumeWelcomeBundle. |
| Paid AI guard | `apps/core/cardbey-core/src/services/billing/withPaidAiBudget.js` | Wraps paid AI work: auth check, balance check, startPaidAiJob, run fn(), completePaidAiJob + spendCredits or consumeWelcomeBundle. |
| Paid AI job | `apps/core/cardbey-core/src/services/billing/paidAiJobService.js` | Idempotency: startPaidAiJob, completePaidAiJob; refId + actionName. |
| Cost policy | `apps/core/cardbey-core/src/services/billing/costPolicy.js` | CostSource.paid_ai; isChargeable; action names (draft.generate.ai.menu, etc.). |
| Where charged | `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | generateDraftTwoModes → withPaidAiBudget(..., fn) around the actual generation; consumption after success. |
| Dev credits | `apps/core/cardbey-core/src/routes/devCredits.js` | POST `/api/dev/credits/add` (add credits for testing). |

### Publish readiness
| Area | Path | Notes |
|------|------|--------|
| Frontend readiness | `apps/dashboard/cardbey-marketing-dashboard/src/lib/profileVisuals.ts` (getVisualsStatus), `src/lib/draftMedia.ts` (getDraftVisualsStatus) | `isCompleteForPublish`: avatar + background “custom”; used in StoreDraftReview for canPublish and toast. |
| Frontend canPublish | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | draftReadyForPublish (name, products, visuals) + !gatekeeper.isGuest; no backend readiness endpoint. |
| Backend publish | `apps/core/cardbey-core/src/services/draftStore/publishDraftService.js` | findTargetDraft, ownership; no explicit “readiness” validator; commit can fail with generic errors. |

---

## B) Current State vs Target MI Architecture

| MI Capability | Target (Phase 0) | Found in repo? | Evidence (file paths + brief notes) | Gaps |
|---------------|------------------|----------------|-------------------------------------|------|
| MI Shell UI: Chat / Jobs / Tools | Chat, Jobs list, Tools list | Partial | `MiConsole.tsx`, `MIHelperPanel.tsx`, `AppShell.tsx` (MiShell). No dedicated Jobs list or Tools list page. | Jobs list view; Tools registry UI. |
| Job API: create, status, retry, cancel, approve | create, get status, retry, cancel, approve | Partial | `miRoutes.js`: POST `/api/mi/orchestra/start` (create + auto-run), GET `/api/mi/orchestra/job/:jobId`. No retry, cancel, approve. | Retry/cancel/approve endpoints. |
| mi_jobs + mi_job_steps persistence | Job + step rows | Partial | `OrchestratorTask` in `prisma/schema.prisma`: id, entryPoint, tenantId, userId, status, request, result. No step table. | mi_job_steps (or equivalent); step-level status/result. |
| Queue + worker execution | BullMQ/Redis or equivalent | No | `orchestraBuildStore.js`: `setImmediate` in-process; no queue. | Dedicated queue + worker. |
| Task registry (CREATE_STORE etc.) | Named tasks with steps | Partial | entryPoint in OrchestratorTask (e.g. "build_store"); normalized in miRoutes from goal. No formal task registry with step definitions. | Task registry (CREATE_STORE, steps, schema). |
| Step runner (idempotency, retry, resume) | Per-step run with retry/resume | No | Single `runBuildStoreJob` path; one generateDraft call; no step runner. | Step runner; step idempotency; resume from step N. |
| Skill registry (store.*, image.*, publish.*) | Skills as callable units | Partial | `orchestrator/toolsRegistry.js`: loyalty tools only. Store creation uses draftStoreService.generateDraft directly, not as a registered skill. | store.*, image.*, publish.*, billing.* skills. |
| LLM gateway abstraction + mi_llm_calls logging | Single interface, all LLM logged | No | `aiService.js` and menuVisualAgent/openaiImageService: direct OpenAI usage; scattered. No mi_llm_calls table or gateway. | LLM gateway; mi_llm_calls (or equivalent) logging. |
| Billing guard (balance, ledger) step-level | Check before step; deduct after step | Partial | withPaidAiBudget in draftStoreService (before/after full generateDraft); PaidAiJob idempotency. Not per-step. | Step-level balance check and deduction. |
| Publish readiness validator (meaningful) | Backend validator; clear reasons | Partial | Frontend: getVisualsStatus, draftReadyForPublish. Backend: publishDraft finds draft and commits; no explicit readiness endpoint or structured reasons. | Backend readiness endpoint; structured block reasons. |
| UI: Task Launcher + Job Monitor + Credit badge | Launcher, job list, credits | Partial | quickStartCreateJob + CreatePage/FeaturesPage (launch); MICreationTimeline (one job); AiCreditsPill + account dropdown (credits). No global Job Monitor list. | Job Monitor (list of jobs); optional Task Launcher abstraction. |

---

## C) Convert Store Creation into MI Task — Proposed Task Spec

### CREATE_STORE (Phase 0)

**Inputs (structured)**
- `sourceType`: `"form"` | `"voice"` | `"ocr"` | `"url"` | `"template"`
- `businessName?`, `businessType?`, `location?`, `websiteUrl?`, `menuFirstMode?`, `vertical?`, `generationRunId?`, `storeId?`, `tenantId?`

**Outputs**
- `storeId` (temp or real)
- `draftId`
- `generationRunId`
- `readinessReport`: `{ ready: boolean, blocks: { code, message, step? }[], visualsOk: boolean, catalogOk: boolean }`
- `artifacts`: draft preview summary (categories, product count)

**Steps (6–8 for Phase 0)**
1. **ensure_session** — Resolve/create guest or user session; ensure draft row exists (reuse current orchestra/start draft-ensure).
2. **validate_input** — Validate payload (sourceType, required fields per type); return 400 with clear message if invalid.
3. **claim_budget** — Check balance (withPaidAiBudget or equivalent); reserve/deduct for paid_ai path; fail with INSUFFICIENT_CREDITS / AUTH_REQUIRED with clear code.
4. **generate_catalog** — Call existing catalog generation (from draftStoreService) as “skill”; log to step result.
5. **generate_hero_avatar** — Call existing hero/avatar logic (or image skill); log to step result.
6. **generate_images** — Call menuVisualAgent / image pipeline for items; log to step result.
7. **readiness_check** — Run validator: name, products, visuals (getVisualsStatus equivalent server-side); write readinessReport to step result; if not ready, set block reasons and optionally fail step.
8. **publish_gate** — Optional step or separate action: “can_publish” check; if blocked, return readinessReport so UI shows exact reason.

**Reused as “skills”**
- Draft ensure + create: current logic in miRoutes handleOrchestraStart (draft creation).
- generateDraft: `draftStoreService.generateDraft` (today single call; could be split into catalog / hero / images steps later).
- Publish: `publishDraftService.publishDraft` (called from POST /api/store/publish); no change to API.

**Where credits are charged**
- In **claim_budget** (or single “paid_ai” step): after success of full generation, consume bundle or spendCredits (same as current withPaidAiBudget/completePaidAiJob in generateDraft). Phase 0 can keep one charge at end of “generate” step.

**Readiness gates**
- **readiness_check** step: run server-side rules (name, min products, visuals complete); output `readinessReport.blocks[]`.
- **publish_gate**: before publish, backend can re-check readiness and return 400 with `readinessReport` so UI shows “Missing: Avatar/Logo, Background” etc.

**Human approval**
- Phase 0: none. Optional later: “approve_publish” step for high-risk stores.

---

## D) Risk Assessment & “Do Not Break” Plan

**Integration risks**
- **Publish:** Changing where/when publish is called could break POST /api/store/publish or frontend handlePublish. Mitigation: keep existing publish API and frontend call; add optional “readiness” response only; no change to 200 response shape.
- **Auth:** runWithAuth and runWithOwnershipGate already gate publish; claim flow exists. Mitigation: do not change auth middleware or claim endpoint contract.
- **Image upload / hero:** StoreDraftReview and draftStoreService share hero/avatar logic. Mitigation: any new “step” that runs image logic must reuse existing functions; no duplicate upload paths.
- **Migrations:** Adding mi_job_steps (or new tables) must be additive. Mitigation: new tables only; OrchestratorTask stays; optional step table with jobId FK.

**Feature flag / dual-path**
- Use a feature flag (e.g. `USE_MI_TASK_STORE_CREATION`) so that:
  - Off: current flow (POST orchestra/start → runBuildStoreJob → generateDraft in one go; UI unchanged).
  - On: new flow (create job with steps, run step runner, persist steps; UI can show step timeline). Same entry point (orchestra/start) can create “legacy” vs “stepped” job by flag.
- Keep old path working until stepped job is stable and E2E tests pass.

**Backward compatibility**
- OrchestratorTask.request/result remain JSON; add step table with jobId only. Existing GET `/api/mi/orchestra/job/:jobId` can remain; optionally include `steps[]` when present. No removal of existing fields.

---

## E) Execution Plan (incremental, minimal diffs)

### Step 1: Instrumentation only (add job logging, no behavior change)
- **Files:** `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js`, `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`.
- **Changes:** Log at job start/end and before/after generateDraft with jobId, draftId, duration; optional new table `mi_job_log` (jobId, message, ts) for debugging only.
- **Tests:** Smoke: create store from Create page → review → publish; verify logs appear; no change in UI or API contract.
- **Rollback:** Remove log lines and optional table.

### Step 2: MI job wrapper around existing store creation
- **Files:** `apps/core/cardbey-core/src/routes/miRoutes.js`, optional new `orchestraBuildStoreV2.js`.
- **Changes:** When flag on, create OrchestratorTask with entryPoint `create_store`; run same runBuildStoreJob (or thin wrapper) so behavior identical; optionally write one “step” row (e.g. “generate”) with start/end in result.
- **Tests:** With flag off, unchanged; with flag on, same E2E; GET job returns same status/result shape.
- **Rollback:** Flag off; or revert to single path.

### Step 3: Move AI calls behind LLM gateway + step logs
- **Files:** New `apps/core/cardbey-core/src/services/llm/gateway.js` (or similar), `aiService.js` (call gateway instead of openai directly), `draftStoreService.js` (call gateway for any LLM).
- **Changes:** Gateway: single `completion(options)`, `imageGenerate(options)`; log to `mi_llm_calls` (new table: jobId?, stepId?, provider, model, tokens, costEstimate?, ts). Replace direct openai in aiService and image services with gateway.
- **Tests:** Create store with AI; verify one or more rows in mi_llm_calls; no regression in generation quality.
- **Rollback:** Gateway can bypass and call openai directly; remove logging if needed.

### Step 4: Readiness check step + clearer errors
- **Files:** New `readinessValidator.js` (or in publishDraftService), `publishDraftService.js`, `miRoutes.js` or step runner.
- **Changes:** Server-side getVisualsStatus-like rules; function that returns `{ ready, blocks: [{ code, message }] }`. Call from new “readiness_check” step or from publish endpoint; return blocks in 400 when publish blocked.
- **Tests:** Publish with missing avatar → 400 with blocks; UI can show blocks (optional small frontend change).
- **Rollback:** Publish endpoint stops calling validator; returns previous behavior.

### Step 5: Publish step gating and retries
- **Files:** `apps/core/cardbey-core/src/services/draftStore/publishDraftService.js`, `stores.js` (publish route), optional step runner.
- **Changes:** Before commit, run readiness check; on failure return 400 with readinessReport. Optional: “publish” as a step that can be retried (idempotent commit).
- **Tests:** Publish when not ready → 400; when ready → 200; retry publish step (if implemented) idempotent.
- **Rollback:** Remove readiness check from publish path; keep commit as-is.

### Step 6: UI updates (credit badge, job monitor)
- **Files:** AiCreditsPill already exists; add Job Monitor page or section that lists recent OrchestratorTask for user (GET /api/mi/orchestra/jobs or similar), link from header or dashboard.
- **Changes:** Credits: already done (pill + dropdown). Job list: new endpoint, new page or component showing job list with status, link to review.
- **Tests:** Credits visible; job list loads and shows at least current/session jobs.
- **Rollback:** Hide job list route; keep credits as-is.

---

## F) Quick wins (unblock current pain)

1. **Credit label visibility + dropdown balance** — Already implemented: AiCreditsPill, account dropdown (AI Credits / Welcome bundle), create page “AI budget” line. No change needed.
2. **Explicit error when publish is blocked** — Backend: in `publishDraft` or route, before commit, run a small validator (name, products, visuals); on failure return 400 with `{ code: 'PUBLISH_NOT_READY', blocks: [{ code, message }] }`. Frontend: show blocks in toast or inline. Small change in `publishDraftService.js` and StoreDraftReview.
3. **Job step timeline in UI** — MICreationTimeline already shows job status and stage-like result (stageResults, currentStage). Enrich backend result with explicit “steps” array (e.g. plan_store, seed_catalog, store_hero, images) so timeline can show step-by-step; no new table required, just result shape.
4. **Retry failed job** — Add POST `/api/mi/orchestra/job/:jobId/retry` that, for status=failed, resets to queued and re-invokes runBuildStoreJob (idempotent). Button in MICreationTimeline on failed state.
5. **Balance check before starting job** — In handleOrchestraStart, for paid_ai goals, call getBalance/canSpend and return 402 INSUFFICIENT_CREDITS before creating draft/job so user sees “Top up” instead of “Job failed” after the fact.

---

## Suggested commands (for future runs)

```bash
rg "MI Shell|demo plan|Check system health|available tools" -n
rg "bullmq|Queue|Worker|redis|temporal|job_steps|mi_jobs" -n
rg "billing|credits|ledger|balance|charge|deduct" -n
rg "OpenAI|anthropic|chat\.completions|images\.generate|gpt" -n
rg "publish|readiness|readyToPublish" -n
```

---

**Confirm:** No code was changed in this audit. Only discovery and the above plan were produced.
