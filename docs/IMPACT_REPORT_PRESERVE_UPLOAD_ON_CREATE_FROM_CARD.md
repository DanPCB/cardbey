# Impact Report — Preserve upload OCR on create-from-upload text

**Date:** 2026-08-12  
**Trigger:** NOODLE hut card → “How can I help you today?” → “Create store from uploaded card” → empty form (“couldn't read enough”)

## (1) What could break

- Text-only “Create a store for X” will still clear prior upload belief (intentional).
- “Create store from uploaded card” will **keep** lastUpload / OCR so draft can fill.

## (2) Why

`maybeClearStaleUploadOnTextOnlyIntent` treated create-from-upload as “new text create” and called `clearStaleUploadBeliefContext`, wiping the card evidence the user just referenced. Intent-engine chat replies also cleared upload context.

## (3) Impact scope

- `intakePendingTurnHandling.js`
- `performerIntakeV2Routes.js` (intent-engine chat clear guard)
- Unit tests for clear behavior

## (4) Smallest safe patch

1. Do not clear upload belief when message is create-from-uploaded-asset / attachment placeholder.
2. Do not clear on intent-engine chat for those same messages.
3. No change to create-store dispatch contracts.
