# IMPACT REPORT — Store Creation Research vs Generative Mode Gate

**Date:** 2026-09-11  
**Status:** Explicit implementation task — proceed with minimal additive patches

## Goals

1. Pure `classifyStoreCreationMode` — research vs generative before network research
2. Gate at catalog build (`buildCatalogForStoreReactStep` ~line 568) so generative skips research
3. Path B: ensure generative catalog + forced copy; blackboard `store:mode_selected`
4. Path A research code paths unchanged when mode === research

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Concept with location+category wrongly skips research | Classifier: location alone not enough | Match Task Step 1 rules exactly |
| Real business without website wrongly generative | phone+location OR researchEligible+contact | Those stay Path A |
| intakeAssessment null | May not be on generateDraft options | Treat as `{}`; still classify from input fields |
| forceGenerate changes Path A copy | Must be Path B only | Pass flag only when mode generative |
| Double seed with Phase 2 post-catalog seed | Additive only | Generative guarantee before complete; Phase 2 seed remains safety net |

## Impact scope

- NEW: `src/lib/storeCreation/storeCreationModeClassifier.js` (+ unit tests)
- `draftStoreService.js` — gate + generative catalog/copy
- `storeCreationBlackboard.js` — emit `store:mode_selected` (caller)
- Possibly `contentResolver.js` / `runContentResolution` — additive `forceGenerate`

## Explicitly not doing

- UX / intake / confirmation / research agent internals
