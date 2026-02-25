# Quick Start Form: Two Clean Modes (AI Off / AI On) — Implementation Plan

**Goal:** One API entry, one downstream pipeline, two catalog sources.  
**AI Off** → clone/fetch from a chosen template (deterministic).  
**AI On** → call generation APIs (LLM menu + optional images).  
Both modes land in the **exact same** draft shape, hero/avatar/image rules, and readiness.

---

## 1. One API Entry, One Pipeline, Two Catalog Sources

### 1.1 Payload contract (frontend → backend)

Single payload with:

| Field | Type | When | Notes |
|-------|------|------|--------|
| `mode` | `"template"` \| `"ai"` \| `"ocr"` | Always | Determines catalog source. |
| `templateId` | string | `mode === "template"` | Required for template; e.g. `tpl_chinese_restaurant_v1`, `cafe`, `florist`. |
| `prompt` | string | `mode === "ai"` | Business description / “Union Road Indian sweets”. |
| `vertical` | string | `mode === "ai"` (optional) | e.g. `sweets_bakery`, `cafe`. Derived from businessType if omitted. |
| `businessName` | string | Optional | Override store name. |
| `businessType` | string | Optional | Override type; used for profile + vertical derivation. |
| `location` | string | Optional | For locale/currency. |
| `includeImages` | boolean | Optional | Default **true**. If **false**, skip all image APIs (menu/catalog only). |

**Example — AI Off (template):**

```json
{
  "mode": "template",
  "templateId": "cafe",
  "businessName": "Union Road Chinese restaurant",
  "includeImages": true
}
```

**Example — AI On (generation):**

```json
{
  "mode": "ai",
  "prompt": "Union Road Indian sweets",
  "vertical": "sweets_bakery",
  "includeImages": true
}
```

**Existing surface to keep:**  
`POST /api/draft-store/generate` and orchestra `POST /api/mi/orchestra/start` already accept `mode`, `templateId`, `prompt`, `vertical`, `includeImages`, `menuFirstMode`. The plan is to **interpret** these via a single normalizer (below) so one pipeline runs for both.

### 1.2 Input normalizer (the real “merge”)

Multiple knobs today (`mode`, `menuFirstMode`, `useAiMenu`, `templateId`, ocr) can cause accidental divergence. Introduce **one** function that turns raw request body into a single, unambiguous set of generation params:

**`resolveGenerationParams(input) → { mode, templateId, includeImages, vertical, prompt, businessName, businessType, ... }`**

**Rules (backward compatible):**

- If `input.mode` is present → use it (`"template"` | `"ai"` | `"ocr"`).
- Else if `menuFirstMode === true` or `useAiMenu === true` → **mode = `"ai"`**.
- Else if `templateId` present → **mode = `"template"`**.
- Else if `input.mode === "ocr"` or `input.ocr === true` → **mode = `"ocr"`**.
- Else → **explicit error** (“Missing mode or templateId”) **or** fall back to legacy only if you choose to keep it. **Recommendation:** no “retail 1..30” in Quick Start; fail fast.

**Also:**

- `includeImages = input.includeImages !== false` (default **true**).
- `vertical = input.vertical || deriveFromBusinessType(profile/type)` (can be done after profile is available in AI path, or passed through from normalizer if derived from businessType).

This one normalizer prevents the majority of “AI-on behaves differently” bugs by ensuring the rest of the pipeline never sees conflicting knobs.

---

## 2. Backend Structure: Input Normalizer + Catalog Sources + Shared Finalize

### 2.1 High-level flow

```
generateDraft(draftId)
  → params = resolveGenerationParams(draft.input)   // single source of truth for mode, includeImages, etc.
  → catalog = buildCatalog(params)                   // returns CatalogBuildResult (only branching point)
  → saveDraftBase(draftId, catalog)
  → finalizeDraft(draftId, { includeImages })        // only place that touches images/hero/avatar/readiness
  → loadDraft(draftId)
```

- **resolveGenerationParams:** Eliminates multiple knobs; rest of pipeline consumes only this output.
- **buildCatalog:** Only place that branches on `mode`. Returns **CatalogBuildResult** (locked contract below). No image/hero/avatar logic here.
- **finalizeDraft:** **The only place** that touches images, hero, avatar, and readiness. Same behavior for all modes.

### 2.2 CatalogSource contract (locked shape)

Define **one** normalized return type so the rest of the pipeline does not care where the catalog came from:

**`CatalogBuildResult`:**

- `profile`: `{ name, type, tagline, heroText, primaryColor, secondaryColor, ... }`
- `categories`: `Array<{ id: string, name: string }>`
- `products`: `Array<{ id: string, name: string, description?: string, price?: string, categoryId: string, imageUrl?: string | null }>`
- `meta`: `{ catalogSource: "template" | "ai" | "ocr", vertical?: string }`

**Rules:**

- `buildFromTemplate()` returns this.
- `buildFromAi()` returns this.
- `buildFromOcr()` returns this.
- **Everything downstream consumes only CatalogBuildResult.** No image/hero/avatar logic inside any buildFromX.

### 2.3 A) Source step — `buildCatalog(params)`

**Input:** Output of `resolveGenerationParams(input)` (so `mode`, `templateId`, `prompt`, `vertical`, `includeImages`, etc. are already resolved).

**Signature:**

```js
async function buildCatalog(params) {
  if (params.mode === 'template') return buildFromTemplate(params);
  if (params.mode === 'ai')       return buildFromAi(params);
  if (params.mode === 'ocr')      return buildFromOcr(params);
  throw new Error('Unsupported mode or missing templateId for template mode');
}
```

**Template source — `buildFromTemplate(params)` (AI Off = deterministic):**

- **Input:** `templateId`, optional `businessName`, `businessType`, `location`.
- **Behavior:**
  - Resolve catalog from template store (inline `templateItems` keyed by `templateKey`, or template store JSON/table).
  - Map to **CatalogBuildResult** with `meta.catalogSource = "template"`.
  - **Profile:** Must come from **template profile or a deterministic mapping** (e.g. template metadata + overrides). **Do not call LLM or `generateBusinessProfile` with AI** in template mode — that would make “AI Off” still use AI. Allow overrides for `businessName`, `businessType` only. If you ever want AI-enhanced profile for template, add an **explicit** flag (e.g. `enhanceProfileWithAI`) later, not implicit.
- **Rule:** If `templateId` is missing or invalid, **hard-fail**. No generic “Product 1..30” fallback for template mode.

**AI source — `buildFromAi(params)`:**

- **Input:** `prompt`, `vertical` (or derived), `businessName`, `location`, `priceTier`, etc.
- **Behavior:**
  - Profile: **may** use `generateBusinessProfile({ mode: 'ai_description', descriptionText: prompt, ... })` (AI is allowed here).
  - Menu: `generateVerticalLockedMenu(...)` → same **CatalogBuildResult** shape with `meta.catalogSource = "ai"`.
- **Rule:** Same IDs and shape as contract; no image/hero/avatar code.

**OCR source — `buildFromOcr(params)`:**

- OCR text → product extraction → map to **CatalogBuildResult** with `meta.catalogSource = "ocr"`. Single “Other” category if needed. No image/hero/avatar logic.

### 2.4 B) Shared finalize step — `finalizeDraft(draftId, { includeImages })` (only place for images/hero/avatar/readiness)

**Rule:** **No** hero/avatar/images code in `buildFromTemplate` / `buildFromAi` / `buildFromOcr`. **Only** in `finalizeDraft`.

**Behavior:**

- **if includeImages:**
  - Fill **missing** item images only (keep existing template images).
  - Generate hero (`generateHeroForDraft(draftId)`).
  - Set avatar from first product with `imageUrl`.
- **always:**
  - Compute and save readiness using the **same** rule set for all modes.

**Debug / traceability:** Persist on `preview.meta` (or equivalent) so you never get confused again:

- `preview.meta.catalogSource` = `"template"` | `"ai"` | `"ocr"`
- `preview.meta.includeImages` = true | false
- `preview.meta.vertical` = string (when relevant)

### 2.5 Where this fits in the current codebase

- **Current:** `generateDraft(draftId)` in `draftStoreService.js` already:
  - Reads `draft.mode`, `input.menuFirstMode`, `input.templateId`, `input.includeImages`, `input.vertical`, etc.
  - Builds profile via `generateBusinessProfile`.
  - Branches: `menuFirstMode` → `generateVerticalLockedMenu`; else template/OCR path with inline `templateItems` and optional AI menu fallback when template is missing.
  - Then item image enrichment, hero, avatar, preview build — but split across `if (!menuFirstMode)` vs `else if (menuFirstMode && includeImagesForDraft)`.

- **Refactor direction:**
  1. Add `resolveGenerationParams(input)` and use its output everywhere (log it in dev to verify).
  2. Extract catalog building into `buildCatalog(params)` returning **CatalogBuildResult**; implement `buildFromTemplate` / `buildFromAi` / `buildFromOcr` with **no** image/hero/avatar logic.
  3. Implement `finalizeDraft(draftId, { includeImages })` and **move** all hero/avatar/image/readiness logic into it; remove from `generateDraft` and from any buildFromX.
  4. Persist `catalogSource`, `includeImages`, `vertical` on preview.meta for debugging.

---

## 3. Recommended Code Skeleton

### 3.1 `draftStoreService.js` (single orchestrator)

```js
async function generateDraft(draftId) {
  const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
  if (!draft || draft.status === 'committed') { /* throw */ }
  const input = typeof draft.input === 'object' ? draft.input : JSON.parse(draft.input || '{}');
  const params = resolveGenerationParams(input);

  const catalog = await buildCatalog(params);  // CatalogBuildResult

  await saveDraftBase(draftId, catalog);        // persist profile, categories, products, meta.catalogSource

  await finalizeDraft(draftId, { includeImages: params.includeImages });

  return await loadDraft(draftId);
}
```

### 3.2 `buildCatalog.js` (or same file)

```js
async function buildCatalog(params) {
  if (params.mode === 'template') return buildFromTemplate(params);
  if (params.mode === 'ai')       return buildFromAi(params);
  if (params.mode === 'ocr')      return buildFromOcr(params);
  throw new Error('Unsupported or missing mode/templateId');
}
```

### 3.3 `finalizeDraft` (shared)

```js
async function finalizeDraft(draftId, { includeImages }) {
  if (includeImages) {
    await fillMissingProductImages(draftId);   // existing pipeline; fill missing only
    await generateHeroForDraft(draftId);
    await setAvatarFromFirstProductImage(draftId);
  }
  await computeAndSaveReadiness(draftId);
}
```

---

## 4. Same Semantics for Both Modes

- **includeImages:**
  - Omitted → treat as **true** (run image fill + hero + avatar).
  - `includeImages: false` → skip all image calls; draft is menu/catalog only, same readiness rules.
- **Image policy (in finalizeDraft):**
  - Prefer **fill missing only** (keep template images when present; only fill blanks).  
  - Avoid “regenerate all” by default (cost and UX).

---

## 5. Quick Start form mapping (exactly as desired)

**Frontend sends:**

- **AI Off:** `{ mode: "template", templateId, businessName?, includeImages? }`
- **AI On:** `{ mode: "ai", prompt, vertical?, businessName?, includeImages? }`

**Backend:**

1. `resolveGenerationParams(body)` → single params object.
2. `buildCatalog(params)` → CatalogBuildResult.
3. `saveDraftBase(draftId, catalog)`.
4. `finalizeDraft(draftId, { includeImages })`.

That’s the merge. No separate paths after the normalizer.

**UI:** Template dropdown (when “Use AI” off); “Use AI” toggle; “Skip images (faster)” → `includeImages: false`. Orchestra and `POST /api/draft-store/generate` both feed the same pipeline via the same normalizer.

---

## 6. What to Delete / Avoid

- **Do not** keep separate “AI finalize” and “template finalize” code paths. One `finalizeDraft` only.
- **Do not** let readiness or publish checks differ by mode.
- **Avoid** generic fallback items (“retail 1..30”, “Product 1..30”) for **template** mode. If template is missing or invalid, hard-fail with a clear error or force user to pick another template.
- **Avoid** duplicate hero/avatar/image logic in `generateDraft`; all of it should live in `finalizeDraft` after the refactor.

---

## 7. Implementation order (minimal risk)

1. **Add `resolveGenerationParams(input)`**  
   Implement the rules in §1.2. **Log its output in dev only** so you can verify backward compatibility (e.g. existing `menuFirstMode: true` → `mode: "ai"`, `templateId`-only → `mode: "template"`). Do not change behavior yet.

2. **Extract buildFromX returning CatalogBuildResult**  
   Move current template/OCR/AI menu branches into `buildFromTemplate`, `buildFromOcr`, `buildFromAi`. Each returns the **locked** shape (profile, categories, products, meta.catalogSource). No hero/avatar/image logic inside any of them. Template profile must be **deterministic** (no LLM in template mode).

3. **Create `finalizeDraft(draftId, { includeImages })`**  
   Move **all** hero/avatar/image/readiness logic from `generateDraft` (and any buildFromX) into this single function. Downstream calls only `finalizeDraft` for images and readiness.

4. **Replace old branches in `generateDraft`**  
   Flow becomes: `params = resolveGenerationParams(input)` → `catalog = buildCatalog(params)` → `saveDraftBase(draftId, catalog)` → `finalizeDraft(draftId, { includeImages: params.includeImages })` → return draft. Remove duplicate branches.

5. **Regression test**  
   Add a test (or manual check): **“AI mode + includeImages default true”** must run the hero/avatar path (or at least set hero/avatar). Ensures the merge did not silently skip images for AI mode.

---

## 8. Summary

| Layer | Purpose |
|-------|--------|
| **Input normalizer** | `resolveGenerationParams(input)` → single `{ mode, templateId, includeImages, vertical, prompt, ... }`. Prevents divergence from multiple knobs. |
| **Catalog sources** | `buildFromTemplate` / `buildFromAi` / `buildFromOcr` return **CatalogBuildResult** only. Template = deterministic profile; AI = may use LLM for profile + menu. No images/hero/avatar here. |
| **Catalog contract** | `CatalogBuildResult`: profile, categories, products, meta.catalogSource. Downstream does not care where catalog came from. |
| **Finalize** | **Only** `finalizeDraft(draftId, { includeImages })` touches images, hero, avatar, readiness. Same rule set for all modes. |
| **Debug meta** | `preview.meta.catalogSource`, `preview.meta.includeImages`, `preview.meta.vertical` so behavior is traceable. |

**AI Off** = template mode, deterministic profile + template catalog, no LLM. **AI On** = AI profile + AI menu, optional images via `includeImages`. Both land in the same pipeline and the same draft shape after the normalizer.
