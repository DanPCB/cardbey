# “Tạo với AI” Quick Start Audit Report

**Date:** 2025-02-17  
**Scope:** Audit Quick Start workflow for all input modes; confirm mode semantics; add dev-only diagnostics; document wiring and fixes.

---

## 1. Wiring map

| Method | Frontend sourceType | Goal (orchestra) | Endpoint | Payload keys (relevant) | Backend handler | Draft mode | Review redirect |
|--------|---------------------|------------------|----------|-------------------------|-----------------|------------|------------------|
| **Form** | `form` | `build_store` | `POST /api/mi/orchestra/start` | goal, rawInput, businessName, businessType, request.sourceType, request.businessType, request.location, includeImages, menuFirstMode, vertical | handleOrchestraStart → create draft (mode=ai) → runBuildStoreJob | `ai` | `/app/store/temp/review?mode=draft&jobId=…&generationRunId=…` |
| **Chat** | `voice` | `build_store` | Same | Same (rawInput = voiceTranscript) | Same | `ai` | Same |
| **OCR** | `ocr` | `build_store_from_menu` | Same | goal, rawInput ("Create a store from the uploaded menu/image"), request.sourceType=ocr | Same (after fix: draft mode=ocr, entryPoint normalized to build_store) | `ocr` | Same |
| **URL** | `url` | `build_store_from_website` | Same | goal, rawInput ("Create a store from this website: …"), request.websiteUrl, request.sourceType=url | Same (after fix: draft mode=ai, input.websiteUrl) | `ai` | Same |
| **Template** | `template` | `build_store_from_template` | Same | goal, request.templateKey, request.sourceType=template | Same (after fix: draft mode=template, input.templateId) | `template` | Same |

- **Submit handler:** `handleGenerateWithOptions` (FeaturesPage) → `quickStartCreateJob(navigate, payload)` in `src/lib/quickStart.ts`.
- **Payload build:** `orchestraPayload` with `goal` from `GOAL_MAP[payload.sourceType]`, `rawInput`, `businessName`, `request: { sourceType, generationRunId, websiteUrl | templateKey | businessType/location }`.
- **Navigation:** `quickStartCreateJob` calls `buildDraftReviewUrl({ jobId, generationRunId })` → `/app/store/temp/review?mode=draft&jobId=…&generationRunId=…` and `navigate(reviewUrl, { replace: true })`.

---

## 2. Broken points (pre-fix) and minimal patch applied

### 2.1 Backend only created draft for `goal === 'build_store'`

- **What was broken:** For OCR, URL, and Template the frontend sent `goal`: `build_store_from_menu`, `build_store_from_website`, `build_store_from_template`. The backend set `isBuildStore = (goal === 'build_store')`, so it **did not** create a draft for OCR/URL/Template. No draft → no `runBuildStoreJob` → job stayed queued and review page had nothing to load.
- **Why:** Draft creation and auto-run were gated on `isBuildStore` which was only true for `build_store`.
- **Impact:** Form and Chat worked; OCR, URL, and Template never got a draft or generation.

### 2.2 Minimal safe patch (applied)

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

1. **Treat all build_store* goals as “build store” for draft creation and job run**
   - `BUILD_STORE_GOALS = ['build_store', 'build_store_from_menu', 'build_store_from_website', 'build_store_from_template']`
   - `isBuildStoreGoal = BUILD_STORE_GOALS.includes(goal)`
   - `finalEntryPoint = isBuildStoreGoal ? 'build_store' : (entryPoint || goal)` so the job runner always sees `entryPoint === 'build_store'` and runs `runBuildStoreJob`.

2. **Persist full request in task**
   - Merge `req.body.request` (sourceType, templateKey, websiteUrl, location, businessType) into `requestPayload` so the task and draft input have everything needed.

3. **Create draft with correct mode and input**
   - Derive `draftMode`: `template` when sourceType/goal is template, `ocr` when sourceType/goal is ocr/menu, else `ai` (form/voice/url).
   - Draft `input`: set `mode`, `templateId` from `request.templateKey` when template, `websiteUrl` from `request.websiteUrl` when url; base input includes prompt, businessName, businessType, includeImages, vertical, location.

4. **Dev-only logging**
   - Log `draftMode`, `goal`, `includeImages`, `costSource` (template | free_api | paid_ai). No sensitive user text in production.

**No frontend contract change:** Frontend continues to send the same `goal` and `request.*`; backend now creates a draft and runs the job for all four method types.

### 2.3 OCR without image

- **Current behavior:** Quick Start OCR sends `ocrImageAssetId: null` (“Will be provided via image upload if needed”). Backend creates a draft with `mode: 'ocr'` and no `photoDataUrl`/`ocrRawText`. When `runBuildStoreJob` runs, `buildCatalog` (OCR path) throws: “OCR mode requires ocrRawText or photoDataUrl.”
- **Result:** Job fails with a clear error (task status failed, message in result). Acceptable until OCR upload-before-start or post-start upload is implemented; no silent failure.

### 2.4 Website/Link

- **Current behavior:** URL mode sends `goal: build_store_from_website`, rawInput with URL text, and `request.websiteUrl`. Backend creates draft with `mode: 'ai'` and `input.websiteUrl`. Catalog is built via AI path (prompt from rawInput); no separate “scrape URL” step in this codebase.
- **Result:** Draft is created and generation runs. If scraping is added later, it can be wired from `input.websiteUrl`; if not, UI should show “Coming soon” or disable the option to avoid confusion.

---

## 3. Mode semantics (confirmed)

| Method | Draft mode | templateId | prompt | includeImages default | Cost |
|--------|------------|------------|--------|------------------------|------|
| Form | `ai` | — | from rawInput (businessName + businessType + location) | true | paid_ai when images |
| Chat | `ai` | — | voiceTranscript | true | paid_ai when images |
| OCR | `ocr` | — | — | true | free_api (no LLM menu); images optional |
| URL | `ai` | — | rawInput (URL sentence) + websiteUrl in input | true | paid_ai when images |
| Template | `template` | from request.templateKey | — | true | template (FREE) |

- **includeImages:** Default true; backend uses `includeImages !== false`. If `includeImages: false` is sent, hero/avatar/item images are skipped for that run.
- **Legacy knobs:** Backend still accepts `menuFirstMode` / `menuOnly` / `ignoreImages` and maps them into draft input; `resolveGenerationParams` treats menuFirstMode/useAiMenu as implying mode `ai`. The page does not send explicit `mode` in the orchestra payload; backend derives mode from goal + request.sourceType (minimal normalizer in handleOrchestraStart).

---

## 4. Dev-only diagnostics (STEP 3)

- **FeaturesPage (Tạo với AI):** When `flowState === 'generating'` and `import.meta.env.DEV`, a small dev strip shows: accountType (Business/Personal), method (form/voice/ocr/url), and effective goal (build_store, build_store_from_menu, etc.).
- **quickStart.ts:** After successful `orchestra/start`, in DEV only, stores in `localStorage` key `cardbey.quickStartDebug`: `{ jobId, draftId, generationRunId, goal, sourceType, includeImages, timestamp }` (no sensitive user text).
- **StoreReviewPage:** When `import.meta.env.DEV` and `cardbey.quickStartDebug` is present, a fixed bottom-left panel shows: Toggle (Business), Method (sourceType), Goal, includeImages, jobId, draftId, and current job status from `orchestraJob.status`.
- **Backend (miRoutes.js):** In non-production, logs `[orchestra:start] draft ensure` with `draftMode`, `goal`, `includeImages`, `costSource`. No logging of raw user prompt in production.

---

## 5. Optional dataset capture (STEP 4)

- **Not implemented** in this change set. When the workflow is stable, a safe approach would be:
  - Gate: `ENABLE_CONTENT_INGEST_LOGS=true` (default off).
  - Store: sourceType, sanitized prompt/OCR summary (PII stripped), derived businessName/vertical/location, output categories + item names/descriptions only, draftId, mode, includeImages, catalogSource, timestamp.
  - Hook: after catalog is generated (e.g. in `saveDraftBase` or after `finalizeDraft`), write to table or file-based logger.
  - Export: `GET /api/dev/content-ingest/export` (dev-only) to build Content Library datasets.
- **Confirmation:** Dataset capture would be additive and OFF by default; safe to add later with the above gates.

---

## 6. Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/miRoutes.js` | BUILD_STORE_GOALS; persist request.* in task; derive draftMode and draft input from goal/request; create draft for all build_store*; finalEntryPoint='build_store' for runner; dev log draftMode/costSource. |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` | DEV-only: set `cardbey.quickStartDebug` in localStorage after orchestra/start success (jobId, draftId, goal, sourceType, includeImages, timestamp). |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx` | DEV-only: when flowState === 'generating', show small strip with accountType, method, goal. |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` | DEV-only: state + effect to read `cardbey.quickStartDebug`; fixed bottom-left Quick Start debug panel (jobId, draftId, goal, sourceType, includeImages, status). |
| `docs/QUICK_START_AUDIT_REPORT.md` | This report. |

---

## 7. Test plan (STEP 5) — to run locally

1. **Business + Chat:** prompt e.g. “Union Road Florist - bouquets, wedding flowers, delivery” → expect mode=ai, draft created, categories/items relevant, redirect to review.
2. **Business + Form template:** If template flow is wired (templateKey in payload), templateId e.g. florist → expect mode=template, deterministic catalog, draft created.
3. **Business + OCR:** Upload menu image if UI supports it; otherwise expect job to fail with clear “OCR mode requires ocrRawText or photoDataUrl” (no silent failure).
4. **Business + Website link:** Enter public URL → expect draft created (AI path with URL in prompt) and redirect, or clearly disabled/“Coming soon” in UI.

**Acceptance:** Wiring map table matches actual endpoint, payload, and redirect. No paid AI calls on template/manual/free_api paths. Dataset capture remains OFF by default and dev-only when added.
