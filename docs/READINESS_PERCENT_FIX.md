# Readiness % inconsistency fix (Draft Store builder)

## Root cause

- **Header showed "You're 100% ready to publish"**  
  In `StoreDraftReview.tsx`, the completion value passed to `StoreReviewHero` was overridden to **100** when `jobCompleted && hasMinimumForPublish` (MI job done + store has name, visuals, categories, and at least one product). So the header ignored actual product readiness and always showed 100% in that case.

- **Product cards showed "Ready 83%"**  
  Product cards use the same 6-field publish readiness: image, name, price, category, description, tags. The value is `Math.round((passed / 6) * 100)`. With 5 of 6 fields filled (e.g. tags missing), that is **83%**. There was no hardcoded 83; 83 is the correct result for 5/6.

- **Why they disagreed**  
  The header used a different rule (job-complete override) and did not cap by product readiness, so it could show 100% while individual products were at 83%.

## Fix (minimal, localized)

1. **Single source of truth**  
   Added `computeStorePublishReadinessPercent()` in `@/lib/storeReadiness.ts`. It takes store-level flags (name, visuals, categories) and per-product readiness scores (same 6-field metric as product cards), computes a weighted store % (name 20, product avg 30, visuals 30, categories 20), and **caps the result by the minimum product readiness**. So the header never shows 100% when any product is below 100%.

2. **StoreDraftReview**  
   Replaced the inline completion math and the `(jobCompleted && hasMinimumForPublish) ? 100 : ...` override with a single call to `computeStorePublishReadinessPercent(...)`. Product scores are still computed with the existing `computeProductReadiness()` (same 6-field logic as product cards).

3. **No hardcoded or placeholder readiness**  
   All values are derived from the same product readiness logic; no default 83 or forced 100.

4. **Same metric, consistent meaning**  
   Header and product cards both use the same “publish readiness” notion (6 fields per product). The header is store-level aggregate capped by min product %, so it is logically consistent with the card badges.

## Verification

- **Unit tests:** `tests/storeReadiness.test.ts` — `computeProductReadinessViewModeAware` (e.g. 5/6 → 83) and `computeStorePublishReadinessPercent` (cap by min product, no products edge case).
- **E2E:** `tests/e2e/store-draft-review.spec.ts` — when editor is visible, at least one of “You're X% ready to publish” or “Ready X%” is visible.

## Manual checks

1. **Fresh draft with AI products**  
   Open draft review; header and product cards should show the same or consistent % (header ≤ min of card % when products exist; header reflects store + product).

2. **After edits**  
   Add tags (or other fields) to a product; that product’s “Ready N%” should increase; if it was the minimum, the header % should increase as well (draft/patch reactivity is unchanged).

3. **All complete**  
   When every product has all 6 fields and store has name, visuals, categories, header and all cards can show 100%.
