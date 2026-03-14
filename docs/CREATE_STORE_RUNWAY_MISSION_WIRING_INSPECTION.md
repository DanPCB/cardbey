# Create Store Runway → Mission Wiring — Inspection & Prep Report

**Scope:** Inspection + implementation prep only. No removal of existing Quick Start; no breaking changes to store generation or /app/store/temp/review.

---

## 1) Findings (file paths + short notes)

### A) Quick Start runway UI (routes + components)

| What | Where | Notes |
|------|--------|------|
| **Route /create** | `App.jsx` ~431 | `<Route path="/create" element={<CreatePage />} />` |
| **CreatePage** | `src/pages/public/CreatePage.tsx` | Standalone Quick Start: hero + 4 options (Form, Chat, OCR, URL), Business/Personal tabs, `handleGenerate` → `quickStartCreateJob(navigate, payload)`. Uses `useQuickStartOptions`, `useAiEligibility`, `UnlockAiModal`. |
| **Homepage #create** | `Homepage.tsx` → `CreateWorkflowSection` → `FeaturesPage` | `CreateWorkflowSection.tsx` renders `<FeaturesPage workflowOnly />`. Same conceptual runway, different page. |
| **FeaturesPage** | `src/pages/public/FeaturesPage.tsx` | Full features page; when `workflowOnly` used for Home #create. Same 4 modes (form/chat/ocr/url), same `quickStartCreateJob` for Generate. Uses `quickStart.*` i18n keys. |
| **Option triggers** | CreatePage: `buildPayload()` + `handleGenerate()` | **Form:** `sourceType: 'form'`, businessName/Type/location, optional menuFirstMode/vertical. **Chat:** `sourceType: 'voice'`, same fields + chat input. **OCR:** `sourceType: 'ocr'`, ocrImageAssetId undefined. **URL:** `sourceType: 'url'`, websiteUrl. All end in `quickStartCreateJob(navigate, payload)`. |

**Summary:** Quick Start runway lives at **/create** (CreatePage) and **Home #create** (FeaturesPage workflowOnly). Both use the same payload shape and **single entrypoint** `quickStartCreateJob` from `@/lib/quickStart`.

---

### B) Generation trigger (API + response)

| What | Where | Notes |
|------|--------|------|
| **Entrypoint** | `src/lib/quickStart.ts` → `quickStartCreateJob(navigate, payload)` | Single source of truth for all 4 options. |
| **Auth** | Same file | `ensureAuth()` (guest or logged-in); `getOrCreateGuestSession()` on 401; tokens stored for subsequent calls. |
| **Endpoint** | `POST /api/mi/orchestra/start` | `apiPOST(\`${MI_BASE}/orchestra/start\`, orchestraPayload)` with `MI_BASE = '/api/mi'`. |
| **Payload** | `orchestraPayload` in quickStart.ts ~556–630 | `goal` (build_store | build_store_from_menu | build_store_from_website), `rawInput`, `generationRunId`, `businessName`, `businessType`, `location`, `sourceType`, `storeId` (if existing), `quickStart: { ... }`, `request: { sourceType, generationRunId, websiteUrl? }`, optional `menuFirstMode`/`vertical`. |
| **Response shape** | startResponse | `ok`, `jobId`, `storeId`, `generationRunId`, `sseKey`, optionally `draftId`. Extracted: `jobId`, `createdStoreId = startResponse.storeId \|\| storeId`. |
| **Navigation after start** | Same file ~872–877 | If guest: `buildPreviewDraftUrl({ jobId, generationRunId })` → `/preview/draft?jobId=...&generationRunId=...`. Else: `buildDraftReviewUrl({ jobId, generationRunId })` → **`/app/store/temp/review?mode=draft&jobId=...&generationRunId=...`**. |
| **Session storage** | Same file ~994–1018 | `cardbey.session.${jobId}`, `cardbey.lastJobId`, `cardbey.lastStoreId`, `cardbey.generationRunId`, `cardbey.generationRunId.${jobId}`. `setCanonicalContext({ jobId, storeId, tenantId })`. |

**Summary:** Generation is **POST /api/mi/orchestra/start**. Response gives **jobId**, **storeId** (created or existing), **generationRunId**. Progress UI is reached by navigating to **/app/store/temp/review?mode=draft&jobId=...&generationRunId=...** (or `/preview/draft?jobId=...` for guest).

---

### C) Progress runtime page

| What | Where | Notes |
|------|--------|------|
| **Route** | `App.jsx` ~445–451 | `/app/store/:storeId/review` → `StoreReviewGate` → `StoreReviewPage`. For Quick Start, `storeId` is **temp** (URL built by `buildDraftReviewUrl` uses base `/app/store/temp/review`). |
| **URL builder** | `src/lib/reviewRoutes.ts` | `buildDraftReviewUrl({ jobId, generationRunId, ... })` → `/app/store/temp/review?mode=draft&jobId=...&generationRunId=...`. |
| **StoreReviewPage** | `src/pages/store/StoreReviewPage.tsx` | Uses `useParams().storeId`, `useSearchParams()` for `jobId`, `mode`, `generationRunId`. Uses **useOrchestraJobUnified(urlJobId)** for job polling; loads draft when job completes. Renders **StoreDraftReview** when draft is ready. |
| **Job polling** | `src/hooks/useOrchestraJobUnified.ts` | Polls `getOrchestraJob(jobId)` (from `@/lib/orchestraClient`). Job has status, stageResults, etc. |
| **Alternative route /mi/job/:jobId** | `App.jsx` ~440–442 | `MiJobStatusPage` → **ReviewStep** with `jobId`; variant `mi`; shows progress and review. Different entry (e.g. direct link); Quick Start navigates to temp/review, not /mi/job. |
| **Progress stages text** | i18n / backend | "Creating your store draft", "Analyzing", "Categories", "Items", "Images", "Pricing", "Finalizing" not found as literal strings in dashboard repo; likely in **translations (e.g. quickStart.creating)** or from **backend job.currentStage**. FeaturesPage uses `t('quickStart.creating')`, `t('quickStart.creatingSubtext')`. |

**Summary:** Progress runtime is **StoreReviewPage** at **/app/store/temp/review?mode=draft&jobId=...&generationRunId=...**. It gets **jobId** (and generationRunId) from query params; **storeId** is **temp** in URL (real storeId comes from job/draft after sync). Polling via **useOrchestraJobUnified(jobId)**; when job completes, draft is loaded and **StoreDraftReview** is shown.

---

### D) Mission console wiring points

| What | Where | Notes |
|------|--------|------|
| **Plan generator** | `src/app/console/missions/planGenerator.ts` | `classifyType()` maps prompt text to `'store'`. **Store plan steps:** `validate-context`, `execute-tasks`, `report` (from STEP_IDS). No `collect-input` or `create-store-context` today. |
| **Step handlers** | `src/app/console/missions/stepHandlers.ts` | **validate-context** (store): real read-only validation via `getStoreId` + `fetchStoreDraft`. **report** (store): real report links (draft review + preview). No handler for execute-tasks or for “create store” pipeline. |
| **ConsoleContext** | `src/app/console/ConsoleContext.tsx` | `startExecution(missionId)`: initExecution(plan), runId, status validating → after 1s running → runAll(plan, missionId, updateMission, { getMission, runId, getStoreId: () => getCanonicalContext()?.storeId ?? null, fetchStoreDraft }). **getStoreId** is from **canonical context** only (no mission-owned storeId). |
| **Where to add collect-input** | Mission flow | Today: user picks mission → plan proposed → Confirm & Run → startExecution. To add “Create store runway”: (1) **Before** or **as first step**: show input adapter selector (Form/Voice/OCR/Website); (2) store chosen payload (and later storeId/jobId) on **mission.input** or **mission.artifacts**; (3) **create-store-context** step handler calls `quickStartCreateJob` (or equivalent) and sets mission.artifacts.storeId/jobId; (4) **validate-context** then uses that storeId (e.g. from mission.artifacts or setCanonicalContext for the run). |
| **Insert point for create-store-context** | planGenerator + stepHandlers + ConsoleContext | New step id e.g. `create-store-context` (or `execute-tasks` for store could be repurposed). Handler: if mission has input payload, call orchestra/start; capture jobId/storeId; write to mission.artifacts; optionally navigate to progress URL or open in overlay. **validate-context** must read storeId from mission.artifacts when plan is “store-create” (or when mission has artifacts.storeId). |

**Summary:** Current mission assumes **storeId from canonical context**. To wire runway: add **collect-input** (adapter selector + payload), **create-store-context** (orchestra/start, persist storeId/jobId on mission), and feed that **storeId** into **validate-context** and **report** (and into canonical context for the run if desired).

---

## 2) Proposed wiring plan (minimal diff)

- **Mission type:** Keep existing **store** plan type; optionally introduce a **store-create** variant (same steps plus collect-input + create-store-context) or reuse **store** with an extra first step.
- **Steps (store-create):**
  1. **collect-input** — Choose adapter (Form / Voice / OCR / Website); collect payload; store in `mission.input` or `mission.artifacts.inputPayload`. Step completes when payload is present (or stub: complete immediately with empty payload for Form).
  2. **create-store-context** — Handler: if `mission.artifacts?.inputPayload` (or mission.input), call same client API as Quick Start (**POST /api/mi/orchestra/start** via a thin wrapper or `quickStartCreateJob` without navigate). Persist **jobId**, **storeId**, **generationRunId** in `mission.artifacts`. Optionally set canonical context for this run. Do **not** navigate away; optionally open progress in drawer/iframe or deep link.
  3. **validate-context** — Existing handler; **getStoreId** must resolve from **mission.artifacts.storeId** when present (for store-create missions), else canonical context.
  4. **report** — Existing handler; same, use mission.artifacts.storeId for links.
- **Input adapters (UI):**
  - In Mission Detail view, when plan is store (or store-create) and step is collect-input (or before run): show **Input Adapter selector** (Form / Voice / OCR / Website). Form adapter: same fields as CreatePage (businessName, businessType, location, useAiMenu, etc.); others stubbed.
- **Progress UI from mission:**
  - **Option A:** Deep link: after create-store-context returns jobId, set mission.artifacts.jobId/storeId; show link “Open progress” → `/app/store/temp/review?mode=draft&jobId=...&generationRunId=...` (or open in new tab).
  - **Option B:** Embed/iframe the same StoreReviewPage URL in the execution drawer when create-store-context is running (heavier; same URL params).
- **Data model:**
  - **mission.input** or **mission.artifacts**: `{ inputPayload?: QuickStartPayload; jobId?: string; storeId?: string; generationRunId?: string }`. planGenerator and stepHandlers read/write these; validate-context and report use artifacts.storeId when set.
- **getStoreId in ConsoleContext:** For store-create runs, pass a getStoreId that returns `mission.artifacts?.storeId ?? getCanonicalContext()?.storeId ?? null` (mission snapshot must be up to date after create-store-context).

---

## 3) Minimal scaffolding patch list (what to add/modify)

- **Types (missionStore):**
  - Add `MissionArtifacts` (e.g. `inputPayload?: QuickStartPayload; jobId?: string; storeId?: string; generationRunId?: string`) and optional `mission.artifacts` and/or `mission.input`.
- **Plan generator:**
  - Optionally add step **collect-input** (and **create-store-context**) for store plan, or a dedicated store-create plan with steps: collect-input → create-store-context → validate-context → execute-tasks → report. Keep step IDs stable (e.g. `collect-input`, `create-store-context`).
- **Step handlers:**
  - **collect-input:** Stub that returns ok:true when `mission.artifacts?.inputPayload` (or mission.input) is set; otherwise ok:false with message “Select an input method and provide details” (or leave as “pending” until UI sets payload).
  - **create-store-context:** Stub that (when implemented) will call orchestra/start with mission.artifacts.inputPayload, then updateMission(missionId, { artifacts: { ...artifacts, jobId, storeId, generationRunId } }). For scaffolding, return ok:true with no-op or a small test patch.
- **ConsoleContext:**
  - When starting a run for a plan that has create-store-context, pass **getStoreId** that reads from **mission.artifacts.storeId** (from latest mission snapshot) so validate-context and report see the created store.
- **Adapter interface + stubs:**
  - Add `src/app/console/missions/adapters/createStoreAdapters.ts` (or under missions/): types `InputAdapter`, `FormAdapterPayload`, `OcrAdapterPayload`, `WebsiteAdapterPayload`, `VoiceAdapterPayload`; stubs `FormAdapter`, `OcrAdapter`, `WebsiteAdapter`, `VoiceAdapter` (e.g. return empty or placeholder payload).
  - **FormAdapter** (wire first): same shape as QuickStartPayload for sourceType 'form'; can be filled from a minimal form in the mission view.
- **Mission Detail / PlanProposalBlock:**
  - When plan has step **collect-input** and execution not yet past it: show **Input Adapter selector** (cards or dropdown: Form / Voice / OCR / Website) and, for Form, minimal fields (businessName, businessType, location). On “Use this input”, call `updateMission(missionId, { artifacts: { ...mission.artifacts, inputPayload } })` and optionally auto-advance or show “Confirm & Run”.
- **Execution drawer:**
  - When execution has artifacts.jobId/storeId, show “Open Draft Review” / “Open Preview” links (reuse same links as report step) so user can open progress/review page.
- **No changes** to CreatePage, FeaturesPage, quickStart.ts contract, or /app/store/temp/review flow; **additive only**.

---

## 4) Risk + mitigation + rollback

- **Risk (a):** Breaking existing Quick Start or store creation (French Baguette E2E).
  - **Why:** New code paths (mission steps, adapters) could be wired to the same API incorrectly or overwrite mission state.
  - **Mitigation:** Do not change CreatePage, FeaturesPage, or quickStartCreateJob behavior. Reuse quickStart only via a **thin wrapper** that (1) builds payload from mission.artifacts.inputPayload, (2) calls orchestra/start (or the same logic as quickStart without navigate), (3) returns jobId/storeId/generationRunId. No removal of existing routes or flows.
- **Risk (b):** Auth or publishing flows broken.
  - **Why:** Canonical context or storeId source could be confused (mission vs global).
  - **Mitigation:** Limit scope: for mission-driven create-store run, **getStoreId** = mission.artifacts.storeId when set; do not change RequireAuth, StoreReviewGate, or publish routes.
- **Risk (c):** Preview/draft routes broken.
  - **Why:** New links or navigation could point to wrong URLs.
  - **Mitigation:** Use existing **buildDraftReviewUrl** / **buildPreviewDraftUrl** for any “Open progress” / “Open Draft Review” links; no new preview routes.
- **Rollback:** Revert commits that add mission.artifacts, collect-input, create-store-context, and adapter scaffolding. No revert of Quick Start or review routes required if changes are additive and isolated to console missions.

---

## 5) Note on quickStart.ts

- In `quickStart.ts` around line 928 there is a reference to **`productsWritten`** (e.g. `if (createdStoreId && productsWritten > 0)`). This variable does not appear to be defined in the inspected file and may be a bug or from another branch; consider fixing or removing that block when touching this file. **Not part of this wiring task** unless we add a mission-only path that reuses the same polling/navigation logic.

---

**Next step:** Implement only the **scaffolding** (adapter types + stubs, mission.artifacts type, collect-input stub handler, optional Input Adapter selector placeholder in mission view) and leave full create-store-context and progress UX for a follow-up, so that wiring is clear and low-risk.
