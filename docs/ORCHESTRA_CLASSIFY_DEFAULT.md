# Orchestra: AI classify + vertical lock as default

Classification runs **by default** on the backend for every build_store; no frontend classify call. Classification does **not** consume paid credits or welcome bundle.

## Flow

1. **Pre-flight classify (always runs)**  
   In `handleOrchestraStart` for build_store:
   - Input: `businessType` (PRIMARY), `businessName` (SECONDARY), `location`, `notes` (from request body / `request`).
   - Call `classifyBusiness({ businessType, businessName, location, notes })` (internal; no credits).
   - If it fails or times out → use `resolveVertical({ businessType, businessName, userNotes })` (heuristic).
   - Validate: `verticalSlug` must be in allowed taxonomy list.
   - Set: `verticalSlug`, `audience` (from `resolveAudience`), `businessDescriptionShort` (from classification when present).
   - Persist on draft metadata: `baseInput.verticalSlug`, `baseInput.audience`, `baseInput.businessDescription`.

2. **Lock**  
   All later steps use the locked `verticalSlug` from draft input. Downstream does not recompute vertical from name only.

3. **Generation**  
   - Template path: `templateId = selectTemplateId(verticalSlug, audience)`; never default to `cafe` unless `verticalSlug === 'food.cafe'`.
   - AI path: same `verticalSlug` (and `audience`) passed into prompts / image hints.

4. **Post-check**  
   After catalog is built: `validateAndCorrect({ verticalSlug, catalog, buildFromTemplate })`. If corrected, catalog is replaced and a warning is logged.

## Dev logging

One structured log line at start:

```txt
[orchestra:start] { businessType, businessName, verticalSlug, confidence, chosenPath, templateId, corrected: false }
```

When the validator corrects: `[verticalValidator] corrected` (existing).

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/miRoutes.js` | Run `classifyBusiness()` first in build_store block; on fail use `resolveVertical()`; single structured log; use classification result for verticalSlug/audience/businessDescription. |
| `apps/core/cardbey-core/src/lib/verticals/verticalTaxonomy.js` | Added `retail.furniture` vertical. |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` | Removed frontend call to `/api/mi/classify-business`. Always send `businessType`, `businessName`, `location`, `request.notes`; backend is source of truth. |
| `apps/core/cardbey-core/tests/orchestra-classify-default.test.js` | New tests: Furniture → retail.furniture (not cafe), Seafood → food.seafood, Children → fashion.kids, heuristic fallback never cafe. |

## Classification does not consume credits

- `classifyBusiness()` in `classifyBusinessService.js` does not call `getBalance`, `spendCredits`, or `consumeWelcomeBundle`.
- It uses the same OpenAI client for a small JSON completion; billing/credits are only applied in the paid AI draft generation path (e.g. `withPaidAiBudget`).

## Sample logs (3 verticals)

**Furniture store**

```txt
[orchestra:start] {
  businessType: 'Furniture store',
  businessName: 'ZZZ',
  verticalSlug: 'retail.furniture',
  confidence: 0.375,
  chosenPath: 'template',
  templateId: 'retail',
  corrected: false
}
```

**Seafood**

```txt
[orchestra:start] {
  businessType: 'Seafood',
  businessName: 'Union Road',
  verticalSlug: 'food.seafood',
  confidence: 0.5,
  chosenPath: 'template',
  templateId: 'food_seafood',
  corrected: false
}
```

**Children Clothing**

```txt
[orchestra:start] {
  businessType: 'Children Clothing',
  businessName: 'Any',
  verticalSlug: 'fashion.kids',
  confidence: 0.375,
  chosenPath: 'template',
  templateId: 'fashion_kids',
  corrected: false
}
```

## Acceptance

- **A)** Every orchestration start log shows: resolved verticalSlug, confidence, chosenPath, templateId (if fallback).
- **B)** “Furniture store” → retail.furniture, template retail (no coffee).
- **C)** “Seafood store” → food.seafood, template food_seafood (no coffee).
- **D)** If classifier fails, heuristic resolver is used and selects a non-cafe template for non-food types.
- **E)** No credit consumption for the classification step.
