# Impact Report: Ask Create store re-enters Upload Ask loop

**Date:** 2026-07-27  
**Live evidence:** `Upload Ask panel before classifier` at 02:03:02 after Create store chip; UI stays on Ask.

## What could break

1. **Loyalty / catalog Ask chips** — if skip is too broad, other selections might bypass Ask incorrectly.
2. **Plain image upload** — must still show Ask when there is no create_store selection.

## Why

`shouldSkipUploadAskForIntakeSelectionReplay` only skips **loyalty** replays. Ask → Create store re-sends the image + `intakeV2Selection.create_store`, so Core treats it as a new attachment turn and returns Upload Ask again before the draft path runs.

## Impact scope

- Core: `intakeReplayPayload.js` (+ tests), used by `maybeRespondUploadAskBeforeClassifier` / intake v2 early gate
- Not changing DraftStore schema, auth, or Intent Runtime ownership

## Smallest safe patch

Skip Upload Ask when `isCreateStoreFromUploadTurn(body)` (selection / `fromAskSelection` / `CREATE_STORE_FROM_UPLOAD` markers).

## No-parallel-stack proof

Same Intake V2 → create_store draft runway; only the early Ask gate opens for an already-chosen chip.
