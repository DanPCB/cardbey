# Impact Report — Fresh upload must not be blocked by stale create_store goal

**Date:** 2026-08-12  
**Symptom:** NOODLE hut card → “How can I help you today?” → “Create store from uploaded card” → empty “couldn't read enough” form.

## (1) What could break

- Upload Ask may appear even while an older `create_store` mission/goal is still sticky (intended).
- Checkpoint-pending confirms still block Ask (`hasActivePendingCheckpoint`).

## (2) Why

`activeGoalSupersedesUploadClarify('create_store')` is true, so `hasUnrelatedPendingPlan` skipped Rule-1 Ask. Fresh attachment fell through to generic chat; OCR/belief never bound; follow-up create-from-card had no identity.

## (3) Impact scope

- `src/lib/decision/earlyDecisionLoopGate.js`
- Unit tests for upload ask vs stale create_store goal

## (4) Smallest safe patch

When `hasImageAttachment` or `attachmentOnlyUpload` on this turn, do not treat sticky `create_store`/campaign goals as superseding upload Ask.
