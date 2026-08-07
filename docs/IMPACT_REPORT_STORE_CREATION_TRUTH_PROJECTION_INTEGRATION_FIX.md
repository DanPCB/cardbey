# Impact Report — Store Creation Truth → Projection → Renderer Integration Fix

**Date:** 2026-08-02  
**Scope:** Draft creation / draft preview / projection cutover / grounded media+QA (publish public path unchanged)  
**Status:** Implemented (flag-gated; production defaults unchanged)

---

## 1. Root causes

| # | Cause | Effect on Modern Security Doors |
|---|--------|----------------------------------|
| 1 | Research/nav rows (incl. Testimonials, Career, policies) stayed in `catalog.products` without catalog-eligibility gates | All 17 rows entered catalog + image fill |
| 2 | `enrichResearchCatalogProducts` forced `type: service`, `executionAction: book`, `bookingEnabled: true` on every row | Non-offerings became Bookable services; quote trades got Book |
| 3 | `normalizePreviewCategories` reassigned items with mismatched `categoryId` → `other` | Log: 17 → Other |
| 4 | Image fill queried Pexels/AI using item names (e.g. “handyman testimonials service”) | Stock/AI attempts; 1/17 accepted |
| 5 | QA auto-fix patched hero/avatar/product images after grounded rejection | Generic Open-sign hero persisted |
| 6 | Legacy preview body still used when cutover inactive / Book labels from `applyResearchProfileToPreview` | Book service cards instead of projection |

This was **not** a discovery failure — Business Discovery and classification already produced the right signals; legacy catalog/media/normalize paths destroyed them before render.

---

## 2. Exact legacy paths bypassed or guarded

| Path | Change |
|------|--------|
| `normalizePreviewCategories` | Bypass when projection / sourced authority / `canonicalSourcedContent`; sync categories from items instead |
| `enrichResearchCatalogProducts` | Non-offerings never bookable; quote businesses → `request_quote` |
| `fillMissingDraftItemImages` | Skip non-offering roles; under grounded+sourced skip Pexels/AI → `needs_media` |
| `applyStoreBuildQaAutoFix` | When `ENABLE_GROUNDED_STORE_CREATION_V1`: `runGroundedQaRepair` only (no stock hero/avatar/seed) |
| `applyResearchProfileToPreview` | Quote commerce → Request a quote (not Book) |
| `openaiImageService` | Model from `OPENAI_IMAGE_MODEL` or `gpt-image-1` (not hardcoded removed `dall-e-3`) |
| Dashboard cutover | Sole body already; added `data-legacy-body-suppressed`, hero `needs_media` placeholder |

**Not changed:** public `/s/:slug` publish authority, Design Library orchestra structure, research agent rewrite.

---

## 3. Canonical sourced-content envelope

**Module:** `apps/core/cardbey-core/src/lib/storeCreationResearch/canonicalSourcedBusinessContent.js`

Additive runtime envelope on `draft.meta.canonicalSourcedContent`:

- `identity` (name, category, address, phone, website)
- `offerings[]` (offering roles only)
- `sections` (testimonial, trust_content, policy, career, about, contact, location, gallery, project)
- `evidence`, `sourceSummary`, `version`

Built in `finalizeResearchCatalogForDraft` after Phase 2 classification, before/with DL projection.

---

## 4. Semantic routing rules

**Offering (catalog / image-eligible):**  
`product` | `product_category` | `service` | `service_category` | `menu_item` | `menu_category`

**Non-offering (never catalog imagery):**  
`testimonial` | `trust_content` | `policy` | `career` | `about` | `contact` | `location` | `navigation` | `support` | `blog` | `unknown` | …

**Invariant:** `assertNoNonOfferingRolesInCatalog` — exclude + diagnose in prod (no crash).

MSD routing (fixture-proven):

| Label | Role | Destination |
|-------|------|-------------|
| Testimonials | testimonial | testimonials section |
| Why Choose Us | trust_content | trust |
| Career | career | footer |
| Return & Guarantee / Payment / Customer / Terms | policy | policies/footer |
| Product/service category labels | service_category / service | offerings |

---

## 5. Catalog authority rules

Unchanged decision engine (`resolveCatalogAuthorityDecision`):

- Sourced offerings present → `sourced` | `sourced_pending_review`
- No sourced offerings → existing suggested / grounded fallback
- Suggested items must stay `contentOrigin: suggested` and must not replace sourced

Envelope + split run whenever research catalog is finalized (DL v1 path attaches projection as before).

---

## 6. Media authority order (grounded + sourced)

1. Exact / official media on item (if present)  
2. Under grounded + sourced with no official media → **`needs_media`** (no Pexels/AI)  
3. Non-offering roles → never request catalog imagery (`media.generation.skipped_non_offering`)  
4. Stock / AI only for suggested / non-grounded legacy paths  

Diagnostics: `media.generation.skipped_non_offering`, `media.generation.skipped_grounded_source`.

---

## 7. QA repair changes

When `ENABLE_GROUNDED_STORE_CREATION_V1=true`:

- **May:** mark `needs_media`, strip inventing via skip of stock paths  
- **Must not:** seed hero, generic avatar, seed product images, invented descriptions  

Helper: `runGroundedQaRepair` in `storeBuildQaAutoFix.js`.

---

## 8. Renderer authority (before → after)

| | Before | After (flags on + accepted projection) |
|--|--------|----------------------------------------|
| Body | Legacy normalize + Book cards (often) | `ProjectionCutoverStorefront` only |
| Marker | — | `data-storefront-renderer="projection-cutover-v1"` |
| Categories | Other flatten | `legacyCategoryNormalizerBypassed` |
| CTA | Book | Request a quote + Call (commerce policy) |
| Hero | Stock Open-sign | Official if accepted, else “Hero image needed” |

Publish / public storefront: **unchanged** in this phase.

---

## 9. Modern Security Doors before / after

**Before (staging log):**  
17 sourced rows → Other; Pexels/AI on Testimonials/Career/policies; 1 media accept; generic hero; Book cards.

**After (with staging flag set):**  
10 offerings preserved; 7 non-offerings in section envelope; no Other flatten on sourced/projection; no catalog image gen for non-offerings; grounded QA no stock hero; cutover sole body + quote CTAs.

---

## 10. Cross-business regression

Fixtures retained (classification / cutover suites): beauty/booking, restaurant/menu, retail, portfolio, incomplete new business.  
Flag-off: `normalizePreviewCategories` legacy Other behaviour still covered by `draft-category-normalization.test.js`.

---

## 11. Tests and commands

```bash
cd apps/core/cardbey-core
npx vitest run src/lib/storeCreationResearch/__tests__/canonicalSourcedBusinessContent.test.js
npx vitest run tests/draft-category-normalization.test.js
npx vitest run src/lib/storeCreationResearch/__tests__/catalogAuthorityDecision.test.js
```

Fixture: `src/lib/storeCreationResearch/__fixtures__/modernSecurityDoorsSourcedContent.js`  
(reuses `MODERN_SECURITY_DOORS_NAV_FIXTURE` — not production hardcoding).

---

## 12. Staging flag set (expected)

```
ENABLE_STORE_RESEARCH_PIPELINE=true
ENABLE_GROUNDED_STORE_CREATION_V1=true
ENABLE_DESIGN_LIBRARY_V1=true
ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1=true
ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1=true
PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW=true
```

Production defaults: unchanged (grounded + cutover remain off unless explicitly enabled).

---

## 13. Structured diagnostics

Event: `store.creation.authority_trace` (from `emitStoreCreationAuthorityTrace`) with discovery / truth / catalog / projection / renderer fields.

---

## 14. Remaining blockers before production

1. Owner acceptance of projection still required for cutover eligibility (fail-closed).  
2. Official website media matching (page URL / alt / filename) is not a full Media Graph yet — grounded path prefers `needs_media` over stock rather than perfect official match.  
3. Durable **Canonical Business Truth** DB model still recommended later for cross-mission reuse; runtime envelope is sufficient for this phase.  
4. Manual staging acceptance matrix (MSD + restaurant + retail + beauty + portfolio) still required before declaring soak complete.  
5. Public publish cutover remains a later phase.

---

## 15. What could break / impact scope (safety)

| Risk | Mitigation |
|------|------------|
| Sourced drafts skip Other hygiene | Only when projection/sourced meta present; flag-off unchanged |
| Grounded QA stops filling images | Intentional; `needs_media` honest state |
| Quote CTA changes research previews | Driven by business type / commerce policy |
| OpenAI image model change | Env override; grounded sourced rarely reaches AI |

**Smallest safe patch:** local guards + envelope in finalize; no orchestra rewrite; no publish cutover.

---

## 16. Acceptance criteria checklist

- [x] Semantic routing tests (MSD fixture)  
- [x] Category bypass for projection-backed drafts  
- [x] Non-offering excluded from catalog image path  
- [x] Grounded QA no stock invent  
- [x] Cutover sole body + quote CTA + hero needs_media UI  
- [ ] Manual staging draft for Modern Security Doors proves live preview (operator)  
- [ ] Cross-business staging matrix recorded  

**Do not declare production success until a new MSD draft on staging shows `data-storefront-renderer="projection-cutover-v1"` with no legacy catalog body and no Other(17).**
