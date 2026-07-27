# Impact Report: Research-Backed Store Creation Pipeline

## What could break

1. **Catalog generation path** — Store missions that today fall through to industry blueprints may enter entity resolution + owner review when name+location is present, delaying draft preview until owner confirms research.
2. **Mission context shape** — New `store.metadata.research` and `missionContract` fields; consumers that assume only `storeCreationResearch` may miss provenance unless they read the new keys.
3. **Existing research review UI** — Artifact subtype remains `store_research_review_required` but payload gains fields (`contentPolicy`, `fieldProvenance`, `suggestedItems`); UI must distinguish sourced vs suggested (regression if UI ignores new flags).
4. **New business handyman path** — Must not false-match Google Places when only a generic name is given without location; entity resolver requires owner confirmation for ambiguous matches.

## Why

- Introduces `src/lib/storeResearch/` as canonical orchestrator wrapping `storeCreationResearch` + `researchEvidence`.
- Freezes mission contract after owner confirmation with `contentPolicy`.
- Reverses priority: sourced evidence first, industry suggestions only when `allowSuggestedContent` and clearly labelled.

## Impact scope

- `businessResearchAgent.js` (entry orchestration)
- `draftStoreService.js` (catalog step, review gate before persist)
- `storeResearchReviewService.js` (review artifact payload)
- `missionsRoutes.js` (confirm endpoint reads contract)
- Dashboard Performer review card (should read `contentOrigin: sourced|suggested`)

## Smallest safe patch (this PR)

1. Add `storeResearch/` modules without removing legacy paths.
2. Route `runStoreCreationResearch` through `runStoreResearchPipeline` when `ENABLE_STORE_RESEARCH_PIPELINE` is on (default **on** in dev, **off** in production until soak).
3. Block final store persist when `ownerReviewRequired && !ownerConfirmed` (already partially enforced).
4. Do **not** auto-publish refresh deltas (Phase 9 read-only).

## Rollback

Set `ENABLE_STORE_RESEARCH_PIPELINE=0` to restore prior `businessResearchAgent` behavior only.
