# MI Functions Report – Status & Next Steps

This report covers the five MI (Machine Intelligence) actions in the Store Draft review UI: **Auto-fill images**, **Generate tags**, **Rewrite descriptions**, **Generate hero**, and **Create Smart Object Promo**.

---

## 1. Auto-fill images

| Aspect | Status |
|--------|--------|
| **Backend** | ✅ Implemented |
| **Frontend** | ✅ Wired (Improve dropdown + MI Command Bar chip) |
| **Entry point** | `autofill_product_images` |

**What it does**

- Finds the draft by `generationRunId` (draft must be `ready`).
- Selects items without `imageUrl` and with a valid `name` (≥2 chars), up to 30.
- Generates images in batches of 5 via `generateImageUrlForDraftItem` (Pexels → DALL·E).
- Updates draft with `patchDraftPreview(draft.id, { items })` and marks the orchestrator job `completed`.

**Next steps (optional)**

- Add more image sources or style options.
- Optional user control for batch size or “regenerate” per item.
- Consider a reaper for stale `running` jobs (e.g. >5 min).

---

## 2. Generate tags

| Aspect | Status |
|--------|--------|
| **Backend** | ⚠️ Stub only (`notImplemented: true`, job completes immediately) |
| **Frontend** | ✅ Wired (Improve dropdown + MI Command Bar chip) |
| **Entry point** | `generate_tags` |

**What’s missing**

- Real worker logic in `POST /api/mi/orchestra/job/:jobId/run` in `apps/core/cardbey-core/src/routes/miRoutes.js`.
- Draft items already support `tags: string[]`; the UI (e.g. ProductEditDrawer, ProductReviewCard) reads/writes them and patch uses `patchDraftPreview` for `items`.

**Next steps**

1. **Backend**
   - In `miRoutes.js`, for `entryPoint === 'generate_tags'` (after draft lookup and readiness check):
     - Load draft `preview.items`.
     - For each item (with `name` and optionally `description`), call a new tag-generation helper.
   - Add a small service (e.g. `tagGenerationService.ts` or inside an existing AI service):
     - Input: item `name`, optional `description`, optional business/store context.
     - Use an LLM (e.g. OpenAI) to return a short list of tags (e.g. 3–6 keywords).
     - Normalize (lowercase, trim, dedupe) and set `item.tags`.
   - Call `patchDraftPreview(draft.id, { items })` and mark job `completed` with a short summary (e.g. “Tagged N items”).

2. **Frontend**
   - No change required for “Generate tags” to work once the job actually updates `items.tags`; existing UI already displays and edits tags.

---

## 3. Rewrite descriptions

| Aspect | Status |
|--------|--------|
| **Backend** | ⚠️ Stub only (`notImplemented: true`) |
| **Frontend** | ✅ Wired (Improve dropdown + MI Command Bar chip) |
| **Entry point** | `rewrite_descriptions` |

**What’s missing**

- Worker logic in `miRoutes.js` for `entryPoint === 'rewrite_descriptions'`.
- Draft items have `description`; the UI and patch pipeline already use it.

**Next steps**

1. **Backend**
   - In `miRoutes.js`, for `rewrite_descriptions`:
     - Load draft `preview.items`.
     - For each item (e.g. with `name` and existing or empty `description`), call a description-rewrite helper.
   - Add a small service (e.g. `descriptionRewritingService.ts` or use existing AI service):
     - Input: `name`, current `description`, optional tone/style (e.g. “friendly”, “professional”).
     - Use an LLM to return a single improved 1–2 sentence description.
     - Set `item.description` to the new text.
   - Call `patchDraftPreview(draft.id, { items })` and mark job `completed` (e.g. “Rewrote N descriptions”).

2. **Frontend**
   - Optional: allow user to choose tone/style before starting the job (could be a query param or a small modal). Not required for a first version.

---

## 4. Generate hero

| Aspect | Status |
|--------|--------|
| **Backend** | ⚠️ Stub only (`notImplemented: true`) |
| **Frontend** | ✅ Wired (Improve dropdown + MI Command Bar chip, conditional) |
| **Entry point** | `generate_store_hero` |

**What’s missing**

- Worker logic in `miRoutes.js` for `entryPoint === 'generate_store_hero'`.
- Draft preview supports a `hero` object (e.g. `imageUrl`, `videoUrl`); the UI uses `draft.store.heroImageUrl` and `preview.hero` (see StoreDraftReview).

**Next steps**

1. **Backend**
   - In `miRoutes.js`, for `generate_store_hero`:
     - Load draft `preview` (store name, slogan, categories, business type from `input`/profile).
     - Call a hero-generation helper (image and/or short hero text).
   - Add a small service (e.g. `heroImageGenerator.ts` or reuse `menuVisualAgent` / image services):
     - Input: store name, tagline/slogan, business type.
     - Use Pexels/DALL·E (or existing image pipeline) to get one hero image URL.
     - Optionally set a short `heroText` in preview.
   - Merge into preview: `patchDraftPreview(draft.id, { hero: { imageUrl, ... } })` (and optionally top-level `heroText` if the schema supports it).
   - Mark job `completed` (e.g. “Hero image generated”).

2. **Frontend**
   - Ensure the draft refetch / merge logic already treats `preview.hero` as the source for the hero section (already appears to be the case). No change required for a basic implementation.

---

## 5. Create Smart Object Promo

| Aspect | Status |
|--------|--------|
| **Backend** | ✅ SmartObject API implemented |
| **Frontend** | ✅ Wizard + API client implemented |
| **Flow** | Not an orchestrator job; opens wizard |

**What it does**

- The MI chip “Create Smart Object Promo” does **not** call the orchestra. `MICommandBar` checks `goal === 'create_smart_object_promo'` and opens `SmartObjectPromoWizard` instead.
- The wizard uses `createSmartObjectPromo()` from `@/lib/smartObjectPromo.ts`, which:
  - Calls `POST /api/smart-objects` (create SmartObject).
  - Calls `POST /api/smart-objects/:id/active-promo` (bind promo).
- Backend: `apps/core/cardbey-core/src/routes/smartObjects.js` and `SmartObject` model in Prisma (e.g. `publicCode`, `storeId`, `activePromoId`).

**Next steps**

- **No backend MI job needed** for the button: the flow is “open wizard → create Smart Object + set active promo” and is already implemented.
- Optional improvements:
  - Pre-fill wizard (e.g. store/product) from current draft/context.
  - Optional future MI command: “Create a Smart Object promo for this product” that could call the same APIs under the hood with default params (still no need for a long-running orchestra job).

---

## Summary

| Function | Backend | Next step |
|----------|---------|-----------|
| **Auto-fill images** | Done | Optional: more sources, reaper |
| **Generate tags** | Stub | Implement tag-generation service + worker in `miRoutes.js` |
| **Rewrite descriptions** | Stub | Implement description-rewrite service + worker in `miRoutes.js` |
| **Generate hero** | Stub | Implement hero image (and optional text) service + worker in `miRoutes.js` |
| **Create Smart Object Promo** | N/A (wizard + API) | No MI job; optional pre-fill or future “create from context” command |

**Shared backend pattern for tags, descriptions, hero**

- In `miRoutes.js`, inside the existing `MI_DRAFT_GOALS` branch, replace the stub for each goal with:
  1. Get draft via `getDraftByGenerationRunId(generationRunId)` (already done).
  2. Optionally ensure draft is `ready` where it makes sense (e.g. for tags/descriptions).
  3. Run the new service over `preview.items` or `preview` (hero).
  4. Call `patchDraftPreview(draft.id, { items })` or `patchDraftPreview(draft.id, { hero: { ... } })`.
  5. Mark the orchestrator task `completed` with a short `result.summary`.

All four stub goals already receive `generationRunId` and draft lookup; only the per-goal worker logic and small AI services remain to be added.
