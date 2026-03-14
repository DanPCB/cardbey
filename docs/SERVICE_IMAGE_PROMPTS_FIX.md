# Service Image Prompts Fix — Vertical-Based Template Selection

**Scope:** Image generation for draft stores (item images + hero). Prompt template now depends on `verticalGroup`: food vs services vs retail.

## Risk assessment (pre-implementation)

- **What could break:** Food/bakery stores could get wrong style if `verticalGroup` were mis-mapped or missing.
- **Why:** New branching on vertical; any bug in mapping would affect which template runs.
- **Mitigation:** Default to **food** when `verticalGroup` is missing or not `services`/`retail`. No change to existing behavior for food or when profile is absent.
- **Impact scope:** Draft store image generation only (finalizeDraft item images + hero). No change to published stores, auth, or API contracts.

---

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/services/menuVisualAgent/openaiImageService.ts` | Added `VerticalGroupForImage`, `STYLE_BY_VERTICAL`, `SUFFIX_BY_VERTICAL`; `generateMenuItemImage(..., verticalGroup?)` selects template by group; default food. |
| `apps/core/cardbey-core/src/services/menuVisualAgent/menuVisualAgent.ts` | `ImageFillProfile` + `verticalGroup?`; `verticalGroupForImage(slug)`; `buildImageQueryForItem(..., verticalGroup?)` suffix by group; pass `verticalGroup` into `generateMenuItemImage`. |
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | `imageFillProfile` includes `verticalGroup`; `generateHeroForDraft` called with `verticalSlug` and `verticalGroup`. |
| `apps/core/cardbey-core/src/services/mi/heroGenerationService.ts` | `GenerateHeroForDraftArgs` + `verticalSlug?`, `verticalGroup?`; build minimal `profile` and pass to `generateImageUrlForDraftItem`. |

---

## Before / after example prompts

**Item image (OpenAI path)**

- **Before (all verticals):**  
  `A high-quality modern, professional food photography, clean lighting image of Consultation Session, 1-hour strategy call. The image should be appetizing and suitable for a restaurant menu.`

- **After — services (e.g. consultant):**  
  `A high-quality clean, professional lifestyle photography, neutral lighting, modern service branding image of Consultation Session, 1-hour strategy call. The image should look professional and suitable for a service business or consultancy.`

- **After — food (e.g. bakery):**  
  `A high-quality warm, inviting food photography, cozy atmosphere image of Croissant, buttery flaky pastry. The image should be appetizing and suitable for a restaurant menu.`

**Hero image**

- **Before:** Same “food photography / restaurant menu” style for all (subject e.g. “Joe’s Consulting hero banner”).
- **After (services):** Uses services template (professional lifestyle, service business) when `verticalGroup`/`verticalSlug` passed from draft profile.

---

## Manual QA checklist

- [ ] **Consultant (or generic service) store:** Create draft with store type suggesting services; generate images. Item images and hero should look professional / office / consultancy, not food.
- [ ] **Bakery store:** Create draft with bakery/cafe; generate images. Item images and hero should still use food photography, appetizing, menu-style.
- [ ] **No regression:** Draft creation and finalize still complete; missing or legacy profile still defaults to food behavior.
