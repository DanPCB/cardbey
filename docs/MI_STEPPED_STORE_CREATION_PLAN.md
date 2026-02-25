# Minimal-Diff Implementation Plan: Stepped MI Store Creation (No BullMQ)

Plan only — no code changes.

**References:** [MI_SYSTEM_AUDIT_AND_PLAN.md](./MI_SYSTEM_AUDIT_AND_PLAN.md) (architecture, risks), [QUICK_START_FORM_TWO_MODES_PLAN.md](./QUICK_START_FORM_TWO_MODES_PLAN.md) (two-modes flow). Achieves stepped store creation with steps stored in `OrchestratorTask.result` JSON, server-side publish readiness, and a full OpenAI/image callsite inventory with routing classification.

---

## 1. Stepped execution (steps in OrchestratorTask.result only)

### 1.1 Approach
- **No new tables.** Persist steps only in `OrchestratorTask.result` as a `steps` array.
- **No BullMQ.** Keep in-process execution in `runBuildStoreJob`; run the same `generateDraft` but split into 3 coarse steps and append each step result to `task.result.steps`.
- **Backward compatible.** Existing clients that read `result.stageResults` / `result.currentStage` continue to work; add `result.steps` as the source of truth for Phase 0.

### 1.2 Result shape (additive)
```json
{
  "ok": true,
  "generationRunId": "...",
  "progressPct": 100,
  "currentStage": "item_images",
  "stageResults": { "catalog": {...}, "visuals": {...}, "item_images": {...} },
  "steps": [
    { "id": "catalog", "status": "completed", "startedAt": "...", "endedAt": "...", "result": { "productsCount": 12, "categoriesCount": 3 } },
    { "id": "visuals", "status": "completed", "startedAt": "...", "endedAt": "...", "result": { "heroUrl": "...", "avatarUrl": "..." } },
    { "id": "item_images", "status": "completed", "startedAt": "...", "endedAt": "...", "result": { "enrichedCount": 10 } }
  ]
}
```
- On failure: set `result.steps[i].status = "failed"`, `result.steps[i].error = { code, message }`, and set `task.status = 'failed'`, `task.result.error` as today.
- **Where to write:** In `orchestraBuildStore.js`, replace the single `generateDraft(draftId)` call with a runner that (1) loads task, (2) runs step 1, appends to `result.steps`, updates task.result, (3) runs step 2, appends, (4) runs step 3, appends, (5) marks task completed. Each step is a thin wrapper that calls the exact functions listed in §2 and catches errors to record in that step.

### 1.3 Minimal diff locations
- **`apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js`**: In the path that calls `generateDraft`, replace with a loop that runs `runStepCatalog`, `runStepVisuals`, `runStepItemImages` in sequence; after each step, `prisma.orchestratorTask.update` to append to `result.steps` and set `result.currentStage`. On any step throw, persist failed step and rethrow so existing `markFailed` runs.
- **`apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`**: Export three new functions (or keep internal and call from orchestraBuildStore): `runStepCatalog(draftId, draft, input, options)`, `runStepVisuals(draftId)`, `runStepItemImages(draftId)`. Each returns a small result object for the step. No change to `generateDraftTwoModes` or `generateDraft` signature; the stepped runner is the only caller that uses the new step functions (or we refactor generateDraftTwoModes to call the same three in sequence and still support single-call from elsewhere).

---

## 2. Exact mapping: three coarse steps vs generateDraftTwoModes

All references are to **two-modes path** (`USE_QUICK_START_TWO_MODES`): `generateDraftTwoModes` → `buildCatalog` → `saveDraftBase` → `finalizeDraft`.

### Step 1 — Catalog
**Purpose:** Produce menu + profile and persist to draft (no images).

| What | Function / location | Notes |
|------|---------------------|--------|
| Resolve params | `resolveGenerationParams(input, { draftMode: draft.mode })` | `draftStoreService.js` (import from `resolveGenerationParams.js`). No LLM. |
| Build catalog | `buildCatalog(params)` | `buildCatalog.js`. Dispatches by mode: `buildFromTemplate`, `buildFromAi`, or `buildFromOcr`. |
| Template path | `buildFromTemplate(params)` | Uses `getTemplateProfile`, `getTemplateItems` (no LLM). |
| AI path | `buildFromAi(params)` | Calls `generateBusinessProfile(profileInput)` (businessProfileService.ts → aiService), then `generateVerticalLockedMenu({...})` (menuGenerationService.js → generateTextWithSystemPrompt, i.e. aiService). |
| OCR path | `buildFromOcr(params)` | Uses `performMenuOcr` (can use OpenAI Vision in runOcr). |
| Save to draft | `saveDraftBase(draftId, catalog, params)` | `draftStoreService.js` lines 119–152. Writes preview (storeName, storeType, categories, items, no hero/avatar) to DB. |

**Boundary:** Step 1 ends after `saveDraftBase`. Draft has `preview` with `items` (possibly `imageUrl: null`). No hero/avatar yet.

### Step 2 — Visuals (hero + avatar placeholder)
**Purpose:** Generate hero image and set it on preview; set avatar to null or to a placeholder until step 3.

| What | Function / location | Notes |
|------|---------------------|--------|
| Hero image | `generateHeroForDraft({ storeName, businessType, storeType })` | `services/mi/heroGenerationService.ts`. Calls `generateImageUrlForDraftItem(searchSubject, null, styleName)` once (Pexels → OpenAI DALL·E). |
| Write hero to preview | After `generateHeroForDraft`: set `preview.hero = { imageUrl: heroImageUrl }`, `preview.avatar = { imageUrl: null }` (or first product image if already present). | Must read draft, merge preview, write back (no status = ready yet). |

**Boundary:** Step 2 ends after hero is set on preview and persisted. Avatar can be left null; step 3 will set it from first product image.

**Implementation note:** Extract from `finalizeDraft` the hero-generation block (and optional avatar-from-first-item if step 3 runs after). So step 2 = load draft → `generateHeroForDraft` → update draft.preview.hero (and optionally preview.avatar if we set it from first item in step 3 only).

### Step 3 — Item images
**Purpose:** Enrich product images, set avatar from first product with image, normalize categories, set status = ready.

| What | Function / location | Notes |
|------|---------------------|--------|
| Item images loop | In `finalizeDraft`: `toEnrich = items.slice(0, 30)`, batches of 5, `generateImageUrlForDraftItem(p.name, p.description, styleName)` per item. | `draftStoreService.js` lines 163–192. Pexels then OpenAI per item. |
| Avatar | After loop: `firstWithImage = items.find(p => p?.imageUrl)`, `preview.avatar = { imageUrl: firstWithImage?.imageUrl ?? null }`. | Same file, lines 195–212. |
| Finalize | `normalizePreviewCategories(preview)`, `parseDraftPreview(preview)`, then `prisma.draftStore.update({ status: 'ready', preview, error: null })`. | Lines 214–222. |

**Boundary:** Step 3 ends with draft status = `ready` and full preview (items with imageUrl, hero, avatar).

### 2.1 Summary table
| Step | Entry function | Key callees | LLM/Image |
|------|----------------|-------------|------------|
| 1 catalog | buildCatalog(params) + saveDraftBase(draftId, catalog, params) | resolveGenerationParams, buildFromTemplate / buildFromAi / buildFromOcr, generateBusinessProfile, generateVerticalLockedMenu, saveDraftBase | AI: businessProfileService, menuGenerationService (chat). OCR path: performMenuOcr (vision). |
| 2 visuals | generateHeroForDraft + update draft.preview.hero (and avatar null) | generateImageUrlForDraftItem (hero prompt) | Pexels → openaiImageService (DALL·E). |
| 3 item_images | finalizeDraft item loop + avatar + normalize + DB update | generateImageUrlForDraftItem (per item), applyItemGuards, normalizePreviewCategories | Pexels → openaiImageService (DALL·E) per item. |

---

## 3. Server-side publish readiness validator

### 3.1 Contract
- **Input:** Draft `preview` (and optional `meta`) after load from DB.
- **Output:** `{ ready: boolean, blocks: { code: string, message: string }[] }`.
- **Rules (aligned with frontend `getVisualsStatus` / `getDraftVisualsStatus`):**
  - **Store name:** `preview.storeName` (or `preview.meta?.storeName`) must be non-empty string. Else block `{ code: 'MISSING_STORE_NAME', message: 'Store name is required.' }`.
  - **Products:** `preview.items` length ≥ 1 and at least one item with `name` (trimmed) and valid price (e.g. `priceV1?.amount` or `price` for menu-only). Else `{ code: 'MISSING_PRODUCTS', message: 'Store must have at least one product with name and price.' }`.
  - **Avatar:** Avatar is “custom” if the resolved avatar URL is present and not suggested. Suggested = URL is `data:...` or contains `/images/default-` or `/images/default-avatars/` or `/images/default-heroes/`. If avatar missing or suggested → `{ code: 'AVATAR_REQUIRED', message: 'Upload a logo/avatar to publish.' }`.
  - **Background:** Same for hero/background: resolved `preview.hero?.imageUrl` or `preview.avatar?.profileHeroVideoUrl` (or equivalent); if missing or suggested → `{ code: 'BACKGROUND_REQUIRED', message: 'Upload a background image or video to publish.' }`.
  - **Menu-only:** If `preview.meta?.menuOnly === true`, skip avatar/background checks (no images required). Only name + products.

### 3.2 Where to implement
- **New file:** `apps/core/cardbey-core/src/services/draftStore/publishReadinessValidator.js` (or `.ts`).
- **Functions:**
  - `isSuggestedUrl(url)` — same logic as frontend: `url?.startsWith('data:')` or includes `/images/default-`.
  - `getResolvedPreviewVisuals(preview)` — return `{ avatarUrl, heroUrl, heroVideoUrl }` from preview (mirror dashboard’s resolveDraftAvatarUrl / resolveDraftHeroUrl).
  - `validatePublishReadiness(preview)` → `{ ready, blocks }`.

### 3.3 Where to call
- **In `publishDraft`** (publishDraftService.js): After `findTargetDraft` and ownership checks, before `parseDraftPreview` (or right after), call `validatePublishReadiness(rawPreview)`. If `!ready`, throw `PublishDraftError('publish_not_ready', message, 400)` and attach `blocks` to the error (e.g. `error.blocks = blocks`) so the route can return them.

### 3.4 Return structured block reasons from POST /api/store/publish

- **Current:** On 400/403/404, route returns `{ ok: false, code, message }` (and sometimes `error`).
- **Additive:** When publish fails due to readiness, return **400** with body:
```json
{
  "ok": false,
  "code": "publish_not_ready",
  "message": "Store is not ready to publish.",
  "readiness": {
    "ready": false,
    "blocks": [
      { "code": "AVATAR_REQUIRED", "message": "Upload a logo/avatar to publish." },
      { "code": "BACKGROUND_REQUIRED", "message": "Upload a background image or video to publish." }
    ]
  }
}
```
- **Route change:** In `stores.js` publish handler, in the `catch`, if `error instanceof PublishDraftError && error.code === 'publish_not_ready'`, set `res.status(400).json({ ok: false, code: error.code, message: error.message, readiness: error.readiness })` where `error.readiness = { ready: false, blocks }`.
- **Frontend:** In `publishStore()` (dashboard `api/storeDraft.ts`) or in StoreDraftReview handlePublish, when response has `readiness?.blocks`, show each block message (e.g. toast or inline list). No change to success path.

---

## 4. OpenAI / image callsite inventory and classification

### 4.1 Inside MI execution (store creation path)

These run during orchestra build_store → generateDraft (or the new stepped catalog / visuals / item_images). **Route to gateway:** yes (so all LLM/image use goes through one abstraction and can be logged to mi_llm_calls later).

| # | File | Function / call | Type | Used in step |
|---|------|------------------|------|----------------|
| 1 | `services/aiService.js` | `openai.chat.completions.create` (multiple exports) | Chat | Catalog: businessProfileService, menuGenerationService |
| 2 | `services/businessProfileService.ts` | `generatePalette`, `generateText` (from aiService) | Chat | Step 1 catalog (buildFromAi) |
| 3 | `services/draftStore/menuGenerationService.js` | `generateTextWithSystemPrompt` (aiService) | Chat | Step 1 catalog (buildFromAi / buildCatalog) |
| 4 | `services/menuVisualAgent/menuVisualAgent.ts` | `generateMenuItemImage` (openaiImageService) | Image | Step 2 visuals (hero), Step 3 item images |
| 5 | `services/menuVisualAgent/openaiImageService.ts` | `openai.images.generate` (DALL·E 3) | Image | Step 2 hero, Step 3 item images |
| 6 | `services/mi/heroGenerationService.ts` | `generateImageUrlForDraftItem` (menuVisualAgent) | Image | Step 2 visuals |
| 7 | `services/draftStore/draftStoreService.js` | `generateImageUrlForDraftItem`, `generateHeroForDraft` | Image | Step 2, Step 3 |
| 8 | `modules/menu/performMenuOcr.js` | (can use OpenAI for OCR) | Vision/Chat | Step 1 catalog (buildFromOcr) |
| 9 | `modules/vision/runOcr.ts` | `openaiVisionEngine.analyzeImage` | Vision | OCR path when used for draft input |
| 10 | `ai/engines/openaiVisionEngine.js` | `openai.chat.completions.create` (vision) | Vision | OCR |

### 4.2 Outside MI execution (needs routing to gateway if we want full logging)

These are not on the store-creation job path; they are other features. **Route to gateway:** optional for Phase 0; classify as “outside” so that when we add the LLM gateway, we know to route these too for a single logging surface.

| # | File | Function / call | Type | Context |
|---|------|------------------|------|--------|
| 11 | `services/mi/descriptionRewriteService.ts` | `openai.chat.completions.create` | Chat | MI description rewrite (not store creation) |
| 12 | `services/mi/tagGenerationService.ts` | `openai.chat.completions.create` | Chat | MI tag generation (not store creation) |
| 13 | `routes/rag.js` | `openai.chat.completions.create` (streaming) | Chat | RAG / knowledge base |
| 14 | `services/ragService.js` | `openai.embeddings.create`, `openai.chat.completions.create` | Embed + Chat | RAG |
| 15 | `routes/assistant.js` | `openai.chat.completions.create` | Chat | Assistant chat |
| 16 | `routes/ai.js` | Various aiService exports | Chat/Image | General AI routes |
| 17 | `services/aiService.js` | `openai.images.generate` (around line 581) | Image | Standalone image generation (e.g. hero outside draft) |
| 18 | `routes/aiImages.js` | `openai.images.generate` | Image | Direct image API |
| 19 | `services/greetingCardsAiService.js` / `.ts` | (greeting card AI) | Chat/Other | Greeting cards |
| 20 | `ai/engines/openaiContentEngine.js` / `.ts` | `openai.images.generate` | Image | Content engine (e.g. design) |

### 4.3 Classification summary
- **Inside MI execution (store creation):** 1–10. Route to gateway first so all store-creation LLM/image use is behind one interface and can be logged (e.g. jobId/stepId in mi_llm_calls).
- **Outside MI execution:** 11–20. Route to gateway when adding app-wide LLM logging; not required for stepped store creation alone.

---

## 5. Implementation order (minimal diff)

1. **Add publish readiness validator** — New `publishReadinessValidator.js`; call from `publishDraft`; return 400 with `readiness.blocks` from POST `/api/store/publish`; frontend show blocks. No change to job or steps.
2. **Add step result shape** — In `orchestraBuildStore.js`, before calling `generateDraft`, init `result.steps = []`. After `generateDraft` succeeds, push three step objects (catalog, visuals, item_images) with synthetic timings and counts derived from draft/preview (minimal: no split yet, just one “full” step or three stub entries). This validates result shape and UI can show steps.
3. **Split into three step runners** — In draftStoreService, add `runStepCatalog`, `runStepVisuals`, `runStepItemImages` that perform only the work described in §2; in orchestraBuildStore, replace single `generateDraft` with loop: run step N, append to `result.steps`, update task, then run step N+1. Keep `generateDraft` as a wrapper that runs all three for any non-stepped caller if needed.
4. **Optional: LLM gateway** — Introduce a thin gateway used by aiService and openaiImageService; log jobId/stepId when present. No change to step logic.

No BullMQ; no new DB tables. Steps live only in `OrchestratorTask.result.steps`.
