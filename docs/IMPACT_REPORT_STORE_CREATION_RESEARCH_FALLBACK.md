# Impact Report: Store creation Needs attention after checkpoint

## Symptom

After "Store input received", mission shows Needs attention / "We hit an issue", empty execution history. Mission URL is correctly the new create_store mission.

## Cause

Checkpoint→`structured_store_build`→`generateDraft`→`buildCatalogForStoreReactStep` runs `runStoreCreationResearch` **without try/catch**. Any research throw becomes `GENERATE_DRAFT_FAILED` and marks the pipeline failed.

UI already shows "Store input reviewed" before that call (stepReporter marks research complete early).

## Smallest safe patch

Wrap research in `buildCatalogForStoreReactStep` with try/catch; on failure log and fall through to preloaded/template catalog so store creation continues.

## Scope

- `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` only for the live unblock
- Does not change checkpoint handoff or draft publish semantics
- Local unfinished `researchEvidence/` package remains out of this deploy unless shipped separately with its adapters
