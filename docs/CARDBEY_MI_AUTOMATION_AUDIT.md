# Cardbey MI – Systems Automation Audit

**Role:** Senior systems auditor  
**Date:** 2026-02-10  
**Scope:** Existing system only – no new features, evidence from code only.

---

## 1. EXECUTIVE SUMMARY

**Can Cardbey automate anything today?** **No.**

No end-to-end process runs from minimal input to a concrete, reusable artifact without human decisions. Store creation is the only major workflow that approaches automation; it depends on (1) the UI triggering job execution via `POST /api/mi/orchestra/job/:jobId/run` after `orchestra/start`, (2) a human reviewing the draft, and (3) a human clicking Publish. There is no background worker: the “job” runs only when the client that called `/start` also calls `/run`. The unified “business create” API (`/api/business/create`) used by `createBusiness.ts` expects a different request shape than the backend implements (`name` vs `sourceType` + `payload`), so that path is contract-broken. Draft generation can be driven headlessly via `POST /api/draft-store/generate`, but a **published** store URL still requires signup/commit or authenticated publish—both human-dependent.

---

## 2. CURRENT AUTOMATION SCORECARD

| Category | Items | Evidence |
|----------|--------|----------|
| **Fully automated** | None | No flow produces a final artifact without at least one human step (review, publish, or trigger). |
| **Semi-automated** | Draft store generation (AI profile + template products + optional images); MI suggestions for playlists; tag/description rewrite jobs; hero/image generation for draft | `draftStoreService.generateDraft()` runs profile → products → categories → hero/avatar; job runs only when UI calls `POST .../job/:id/run`. AI outputs are used but not authoritative for publish. |
| **Manual** | Store publish; promo creation; playlist/signage authoring; QR experiences; “Create Business” via dashboard (orchestra/start + review + publish); all artifact “generation” that is just form → API | Publish: `stores.js` publish handler creates Business/Products only after authenticated request with `storeId`/`generationRunId`. Promo/signage/QR are UI-driven flows. |

---

## 3. CRITICAL BLOCKERS (Top 5)

| # | Blocker | Where | Why it breaks automation | Level |
|---|---------|--------|---------------------------|--------|
| 1 | **Job execution is client-triggered, not worker-triggered** | `miRoutes.js`: `POST /orchestra/job/:jobId/run` is the only place that calls `generateDraft()`. No cron, no queue consumer. | A headless call to `POST /orchestra/start` returns `jobId` but the job stays `queued` until some client calls `/run`. So “automation” requires a second request from the same or another client. | Architectural |
| 2 | **Publish is an explicit human step** | `stores.js`: publish handler creates Business and Products only when an authenticated user sends `storeId` + `generationRunId`. | There is no “auto-publish after draft ready” or “publish from minimal input” API. A published store URL is only produced after a human (or script with stolen auth) triggers publish. | Architectural |
| 3 | **Two incompatible “create business” contracts** | Dashboard `createBusiness.ts` → `POST /api/business/create` with `{ sourceType, payload: { businessName, businessType, location }, options, idempotencyKey }`. Backend `business.js` expects `{ name, description, storeName, ... }` and returns `{ businessId, storeSlug }` (no `jobId`/`tenantId`/`storeId`). | The “unified” create path in the dashboard does not match the backend. The flow that actually works uses `quickStartCreateJob` → `POST /api/mi/orchestra/start`, not `/api/business/create`. | Implementation |
| 4 | **No single source of truth for “store state”** | Draft lives in `DraftStore` (preview JSON). Published store lives in `Business` + `Product`. Transition is “publish” only; no state machine, no validation contract that both sides share. | Hard to validate or replay “store lifecycle” without UI; duplicate concepts (draft vs business) and no shared schema for “store readiness” or “publishable”. | Architectural |
| 5 | **AI outputs are not validated or replayed** | `businessProfileService` uses `generateText`/`generatePalette`; `generateDraft` uses profile + template items + `generateImageUrlForDraftItem` + `generateHeroForDraft`. No schema validation on AI responses; no deterministic replay key. | Outputs are best-effort; failures fall back to defaults or null. You cannot “re-run with same seed” or guarantee the same artifact from the same input. | Implementation |

---

## 4. WHAT IS ACTUALLY WORKING (even if small)

- **Draft generation pipeline (backend):** `generateDraft(draftId)` in `draftStoreService.js` runs end-to-end: OCR (if mode=ocr) → `generateBusinessProfile()` (AI name/type/colors/tagline/hero) → template or OCR products → optional item images via `generateImageUrlForDraftItem` → hero/avatar via `generateHeroForDraft` → categories → writes `preview` and `status: 'ready'`. This can be invoked headlessly via `POST /api/draft-store/generate` (no auth; rate-limited).
- **Orchestra start + run (with UI):** `POST /api/mi/orchestra/start` with `goal: 'build_store'` creates `OrchestratorTask` and `DraftStore` and returns `jobId`, `storeId: 'temp'`, `generationRunId`, `draftId`. If the client then calls `POST /api/mi/orchestra/job/:jobId/run`, the backend runs `generateDraft(draft.id)` in the background and marks the job completed when the draft is ready. The dashboard does this in `quickStart.ts` (right after start) and in `StoreReviewPage` as a safety net.
- **GET job completion detection:** When polling `GET /api/mi/orchestra/job/:jobId`, if the backend sees the linked draft `status === 'ready'`, it marks the task `completed` and returns `generationRunId` so the UI can load the draft. So “draft ready” is observable without relying only on SSE.
- **Publish (with auth):** Given an authenticated user and `storeId` + `generationRunId`, `POST /api/stores/publish` creates or updates `Business` and `Product` rows from the draft preview and returns storefront URL. So “draft → published store” works when a human (or script with auth) triggers it.
- **Zod validation on draft-store routes:** `draftStore.js` uses `GenerateDraftSchema` and `CommitDraftSchema` (zod) for request validation. Other routes have inconsistent or no shared validation.
- **MI suggestions and MI-based jobs:** Playlist suggestions (`getSignagePlaylistSuggestions`), tag generation, description rewrite, hero generation run in the backend and can be triggered via MI/orchestra job run; they operate on existing drafts/entities rather than creating a full store from scratch.

---

## 5. MINIMUM FIX SET TO RESTORE AUTOMATION DIRECTION

To make **one** end-to-end automation real (e.g. “minimal input → published store URL”) without rewriting the system:

1. **Single headless entrypoint (e.g. `POST /api/automation/store-from-input`)**  
   - Input: e.g. `{ businessName, businessType, location }` (or equivalent minimal set).  
   - Behavior: create guest or use provided auth; create draft via existing `createDraft` + `generateDraft` (or orchestra start + run); wait for draft ready; call existing publish logic with that draft; return `{ storeId, storeUrl }`.  
   - This reuses existing `draftStoreService`, publish handler, and auth—no new state model.

2. **Run build_store job without requiring the UI to call `/run`**  
   - Option A: In `POST /api/mi/orchestra/start`, when `goal === 'build_store'`, after creating the task and draft, call `generateDraft(draft.id)` in the background (e.g. `setImmediate` or a small in-process queue) so that a headless client that only calls `/start` still gets the draft.  
   - Option B: Add a minimal worker (or cron) that picks up `OrchestratorTask` with `status === 'queued'` and calls the same run logic.  
   - This removes the “must call /run from client” blocker.

3. **Align `/api/business/create` with the dashboard or remove it**  
   - Either: change `business.js` to accept `sourceType` + `payload` and delegate to the same orchestra/start + run + (optional) publish flow, returning `jobId`/`tenantId`/`storeId`.  
   - Or: stop using `/api/business/create` in the dashboard and document that the only supported path is orchestra/start (+ run).  
   - This removes the contract mismatch and avoids confusion.

4. **One shared validation contract for “draft preview”**  
   - Define a single zod (or equivalent) schema for the draft `preview` shape (store meta, categories, items, hero/avatar). Use it in `draftStoreService`, publish handler, and any API that returns the draft.  
   - This doesn’t add automation by itself but makes “replay” and “publish” predictable and testable.

5. **No new features**  
   - No new AI models, no new artifact types. Only wire existing pieces so that one path is deterministic and headless from “minimal input” to “published store URL”.

**Execution plan:** Step-by-step implementation is in **`docs/MINIMUM_FIX_SET_EXECUTION_PLAN.md`**.

---

## 6. FINAL VERDICT

**Cardbey is currently (c) a collection of disconnected features with an AI-assisted UI on top.**

- **Not (a) an automation system:** No flow is fully automated; job execution depends on the UI (or a script) calling `/run`; publish is always an explicit step; there is no single headless API from minimal input to published artifact.
- **Not (b) a single “AI-assisted UI tool”:** There are multiple entrypoints (orchestra/start, draft-store/generate, business/create), different concepts (DraftStore vs Business, jobId vs draftId vs generationRunId), and the “main” UI path (Quick Start) bypasses the documented “unified” create API. So it’s not one coherent tool; it’s several flows that overlap and conflict.
- **Hence (c):** Disconnected features—draft generation, orchestra jobs, publish, promos, signage, etc.—each work in isolation or with the UI, but there is no single narrative “from input to artifact” that is automated, deterministic, or clearly owned by one path.

**Justification:** Evidence is in the code: `miRoutes.js` (orchestra/start, job/run, GET job), `draftStore.js` and `draftStoreService.js` (generate + commit), `stores.js` (publish), `business.js` (create contract), `createBusiness.ts` vs `quickStart.ts` (which API is actually used). No background worker; no “create and publish” endpoint; no shared draft schema; AI used for assistance only, with no guarantee of determinism or replay.

---

## APPENDIX A – Core Entities & State

| Entity | Schema / definition | Lifecycle state | Validatable without UI? |
|--------|---------------------|-----------------|--------------------------|
| **Store (Business)** | `prisma/schema.prisma` (Business model) | Implicit: exists or not; `publishedAt` set on publish. No explicit FSM. | Yes (DB + Prisma). |
| **Product** | `schema.prisma` (Product); `isPublished` | Implicit. | Yes. |
| **DraftStore** | Prisma model; `preview` is JSON (no shared zod in core for full shape) | Explicit: `status` = generating \| ready \| failed \| committed. | Partially (status yes; preview shape not enforced). |
| **Promo / Smart Object** | Routes and Prisma models (e.g. smartObjects, promo engine) | Implicit / per-feature. | Partially. |
| **OrchestratorTask** | Prisma; `status`: queued \| running \| completed \| failed | Explicit. | Yes. |

Draft “state” is in `DraftStore.status` and `preview`; “publishable” is not a first-class state but implied by “draft ready + user triggers publish”.

---

## APPENDIX B – Workflow Triggers

| Trigger | Requires human? | Headless? | Evidence |
|---------|-----------------|-----------|----------|
| UI: Quick Start “Generate” | Yes (click) | No | `FeaturesPage` → `quickStartCreateJob` → orchestra/start + orchestra/job/:id/run. |
| API: `POST /api/mi/orchestra/start` | Auth (user or guest) | Yes for start only; job does not run until /run. | `miRoutes.js`; `requireAuth`. |
| API: `POST /api/mi/orchestra/job/:jobId/run` | No (any client can call) | Yes | Triggers `generateDraft` for build_store. |
| API: `POST /api/draft-store/generate` | No | Yes | Inline `generateDraft(draft.id)` in route. |
| API: `POST /api/stores/publish` | Yes (auth) | Yes if caller has auth. | `stores.js` publish handler. |
| API: `POST /api/business/create` | Auth | Contract broken (see §3). | `business.js` expects `name`; dashboard sends `sourceType`/`payload`. |
| Background jobs / CLI | None that run build_store or publish | N/A | No cron/worker for orchestrator or publish. |

---

## APPENDIX C – Business Logic Location

- **Backend:** `draftStoreService.js` (draft lifecycle, profile, products, categories, hero/avatar); `businessProfileService.ts` (AI profile); `stores.js` (publish, context); `miRoutes.js` (orchestra start/run, job status).  
- **UI:** `quickStart.ts` (orchestra payload, when to call /run, navigation); `StoreReviewPage` (safety-net /run, display draft); `FeaturesPage` (form and mode selection).  
- **Coupled to UI:** “When to run the job” is in the client (quickStart and StoreReviewPage). Business rules for “what is a valid draft” and “how to publish” are in the backend; “when to publish” is always user action.  
- **Duplication:** Create-business intent lives in both `createBusiness.ts` (unused for main flow) and `quickStart.ts`; draft loading uses both `generationRunId` and `draftId` in different places.

---

## APPENDIX D – AI Integration Reality Check

| Integration | Input | Output | Deterministic? | Validated? | Stored as artifact? | Decides or assists? |
|-------------|--------|--------|----------------|------------|---------------------|----------------------|
| `generateBusinessProfile` (businessProfileService) | mode, ocrRawText/descriptionText/templateKey, overrides | BusinessProfile (name, type, colors, tagline, heroText, style) | No | No schema | Yes (in draft preview) | Assists (human can edit draft) |
| `generateText` / `generatePalette` (aiService) | prompt, theme, mood | Text or palette array | No | No | Only via draft/preview | Assists |
| `generateImageUrlForDraftItem` (menuVisualAgent) | item name, description, style | Image URL | No | No | Yes (item.imageUrl in preview) | Assists |
| `generateHeroForDraft` (heroGenerationService) | storeName, businessType | hero image URL | No | No | Yes (preview.hero) | Assists |
| Tag/description rewrite (mi routes) | draft + item ids | Updated draft patch | No | No | Via patchDraftPreview | Assists |
| Design suggestions (aiService) | Studio snapshot | JSON suggestions | No | No | Not stored | Assists |

**Decorative / non-authoritative:** AI is used to fill in content; the authoritative state is whatever is saved in the draft or published store after human review. No AI decision is “final” without a save/publish step.

**Not replayable:** No seed or idempotency key is passed to AI calls; same input can yield different outputs.

---

## APPENDIX E – Artifact Generation

| Artifact | Generated without UI? | Deletable/regenerable? | Produced by |
|----------|------------------------|-------------------------|-------------|
| **Store (draft)** | Yes: `POST /api/draft-store/generate` or orchestra/start + /run | Yes (new draft each time) | `generateDraft()` |
| **Store (published)** | Only with auth: publish API | Yes (update/overwrite) | Publish handler (writes Business + Product) |
| **Menus** | As part of draft (categories + items) | Yes | `generateDraft` + template/OCR |
| **Promos** | No (UI-driven create flow) | — | UI + API |
| **QR experiences** | No | — | UI-driven |
| **Screen playlists** | No (authoring in UI) | — | UI + APIs |

“Store” is the only artifact that can be generated programmatically (draft); “published store” requires an explicit publish step (human or authenticated script).

---

## APPENDIX F – Automation Proof Test

**Input:**  
`{ "business_type": "cafe", "business_name": "French Baguette", "city": "Melbourne" }`

**Question:** Can the system today produce a **published** store URL from this input alone?

**Answer: No.**

- **Where it fails:**  
  - Without a logged-in or guest user, `POST /api/mi/orchestra/start` returns 401.  
  - With auth, you get `jobId` and `storeId: 'temp'`, but the job stays `queued` unless something calls `POST /api/mi/orchestra/job/:jobId/run`.  
  - After the job completes, you have a draft, not a published store. A **published** store URL is only created when `POST /api/stores/publish` is called with that draft’s `storeId`/`generationRunId` and the same auth.

- **Human decisions required:**  
  - At least one: “publish this draft” (or a script that automatically calls publish with the same auth).  
  - Optionally: “fix/edit draft before publish.”

- **What’s missing:**  
  - A single headless primitive that: create draft from input → wait for ready → publish with same auth → return store URL.  
  - Or: a worker that runs the job so that “start” alone is enough.  
  - And: a clear, supported headless path (e.g. guest + minimal input → published URL) without relying on the dashboard.

---

## APPENDIX G – Failure Mode Detection

| Anti-pattern | Present? | Evidence |
|--------------|----------|----------|
| UI-driven state transitions | Yes | Job runs only when UI (or client) calls `/run`; publish only when user (or authenticated client) triggers it. |
| Forms masquerading as workflows | Yes | “Create store” on the dashboard is a form that triggers orchestra/start + /run; “workflow” is implicit in the client. |
| AI prompts embedded in UI components | Partially | Main AI calls are in backend services; some UI has “AI” labels and triggers that call APIs. |
| “Almost automated” steps requiring manual confirmation | Yes | Draft is auto-generated after /run, but publish is always a separate step (review + click). |
| Missing validation contracts | Yes | Draft `preview` has no shared schema; `/api/business/create` contract mismatch. |
| No single source of truth for system state | Yes | Draft vs Business; jobId vs draftId vs generationRunId; “temp” storeId until publish. |

---

*End of audit.*
