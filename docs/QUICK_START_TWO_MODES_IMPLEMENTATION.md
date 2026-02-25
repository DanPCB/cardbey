# Quick Start Two Modes — Implementation Summary

**Feature flag:** `USE_QUICK_START_TWO_MODES` (env). Default: **true**. Set `USE_QUICK_START_TWO_MODES=false` to use the legacy `generateDraft` path.

---

## Files changed and why

| File | Change |
|------|--------|
| **docs/IMPACT_REPORT_QUICK_START_TWO_MODES.md** | New. Risk assessment, what could break, smallest safe patch (feature flag + additive helpers). |
| **docs/QUICK_START_TWO_MODES_IMPLEMENTATION.md** | New. This file: implementation summary, test scenarios, AI-off confirmation. |
| **apps/core/cardbey-core/src/services/draftStore/resolveGenerationParams.js** | New. Single normalizer: precedence `mode` > `draftMode` > `menuFirstMode`/`useAiMenu` → ai > `templateId` → template > ocr → error. `includeImages` defaults true. Template mode throws if `templateId` missing. |
| **apps/core/cardbey-core/src/services/draftStore/buildCatalog.js** | New. `buildCatalog(params)` as only branching point. `buildFromTemplate` (deterministic, no LLM), `buildFromAi` (LLM profile + menu), `buildFromOcr` (OCR + profile). All return **CatalogBuildResult** (`profile`, `categories`, `products`, `meta.catalogSource`). No image/hero/avatar logic. |
| **apps/core/cardbey-core/src/services/draftStore/templateItemsData.js** | New. Template catalog data (cafe, restaurant, bakery, florist) and `getTemplateItems(key)`. Used by `buildFromTemplate` only. |
| **apps/core/cardbey-core/src/services/businessProfileService.ts** | Added `getTemplateProfile(templateKey, overrides)`: deterministic profile from template key + name/type overrides. **No LLM.** Exported `inferBusinessTypeFromTemplateKey`. |
| **apps/core/cardbey-core/src/services/draftStore/draftStoreService.js** | Added `USE_QUICK_START_TWO_MODES`; when true, `generateDraft` uses `generateDraftTwoModes`. Added `saveDraftBase(draftId, catalog, params)` (writes preview from catalog + `preview.meta.catalogSource` / `includeImages` / `vertical`), `finalizeDraft(draftId, { includeImages })` (only place for fill-missing images, hero, avatar, readiness), and `generateDraftTwoModes` (resolveGenerationParams → buildCatalog → saveDraftBase → finalizeDraft). |

---

## How to test the four scenarios

Use **POST /api/draft-store/generate** with JSON body. Then **GET /api/draft-store/:draftId** to read `preview` and `status`.

1. **Template + includeImages default (true)**  
   - Body: `{ "mode": "template", "templateId": "cafe", "businessName": "My Cafe" }`  
   - Expect: `status: "ready"`, `preview.items` with cafe template items, `preview.hero.imageUrl` and `preview.avatar.imageUrl` set (or at least hero/avatar path ran), `preview.meta.catalogSource === "template"`, `preview.meta.includeImages === true`.  
   - **No LLM calls** (template path uses `getTemplateProfile` + `getTemplateItems` only).

2. **Template + includeImages: false**  
   - Body: `{ "mode": "template", "templateId": "bakery", "includeImages": false }`  
   - Expect: `status: "ready"`, `preview.items` with bakery template items, `preview.hero.imageUrl` and `preview.avatar.imageUrl` null (or absent), `preview.meta.includeImages === false`. No image/hero/avatar API calls.

3. **AI + includeImages default (true)**  
   - Body: `{ "mode": "ai", "prompt": "Indian sweets shop on Union Road", "vertical": "sweets_bakery" }`  
   - Expect: `status: "ready"`, `preview.items` from LLM menu, `preview.hero.imageUrl` and `preview.avatar.imageUrl` set (image path ran), `preview.meta.catalogSource === "ai"`, `preview.meta.includeImages === true`.

4. **AI + includeImages: false**  
   - Body: `{ "mode": "ai", "prompt": "Flower shop", "includeImages": false }`  
   - Expect: `status: "ready"`, `preview.items` from LLM menu, no item/hero/avatar image URLs, `preview.meta.includeImages === false`.

**Regression check:** AI mode with default `includeImages` must run the hero/avatar path (so hero and avatar are set when images are enabled). This is guaranteed by `finalizeDraft(draftId, { includeImages: true })` running the same block for both template and AI.

---

## Confirm: AI Off (template) makes zero LLM calls

- **Template path:**  
  - `buildFromTemplate` uses **only**:
    - `getTemplateProfile(templateKey, overrides)` in **businessProfileService.ts** — implemented with `inferBusinessTypeFromTemplateKey`, `getStylePreferencesForType`, and `DEFAULT_COLORS`; **no** `generateText`, `generatePalette`, or any AI service.
    - `getTemplateItems(key)` in **templateItemsData.js** — returns a static list from `TEMPLATE_ITEMS`; no network or LLM.
    - `getMenuCategoriesAndAssignments(products, profile.type)` in **menuCategories.js** — pure logic (keyword assignment); no LLM.
  - No call to `generateBusinessProfile` in the template path. No `generateVerticalLockedMenu`, no `generateImageUrlForDraftItem`, no `generateHeroForDraft` inside any `buildFrom*` (those run only in `finalizeDraft`, and image/hero/avatar are optional via `includeImages`).

- **AI path:**  
  - `buildFromAi` calls `generateBusinessProfile` (LLM) and `generateVerticalLockedMenu` (LLM).  
  - `finalizeDraft` when `includeImages` is true calls `generateImageUrlForDraftItem` and `generateHeroForDraft` (both can use external/LLM services). So “AI On” can use LLM for profile, menu, and images; “AI Off” (template) does not use LLM for catalog or profile.

**Summary:** With **mode = "template"**, the catalog and profile are built from template data and deterministic helpers only. **Zero LLM calls** in the template catalog path.
