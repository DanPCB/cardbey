# Impact Report — Refuse stale frozen evidence on create-from-upload

**Date:** 2026-08-12  
**Symptom:** Cellarbrations / AWE upload → duplicate **NOODLE hut** (`hasLastUpload: false`, handoff `NOODLE hut`, `hasOcrText: true`).

## (1) What could break

- Text-only “Create store from uploaded card” without pixels will **not** reuse a prior evidenceId OCR (may `needs_form` until image is sent) — safer than wrong duplicate.
- Confirm/loyalty text-only replay without create-from-upload wording still reuses frozen evidence.

## (2) Why

`shouldReuseFrozenEvidenceBundle` returned `true` whenever `currentImageRef` was empty, so Ask → Create store reused the previous NOODLE evidence bundle while the UI showed a new card.

## (3) Impact scope

- `intakeFrozenEvidenceReplay.js` + route call sites (`userMessage`)
- `applyUploadEvidenceIdentityPreference` — ignore session storeCandidate/card as evidence
- Unit tests

## (4) Smallest safe patch

1. Refuse text-only frozen reuse when message is create-from-uploaded-asset.
2. Upload-driven handoff evidence = OCR/attachmentAnalysis only (not stale storeCandidate).
