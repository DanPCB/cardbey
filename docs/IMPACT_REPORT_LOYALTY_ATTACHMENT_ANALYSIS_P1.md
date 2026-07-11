# IMPACT REPORT: P1 AttachmentAnalysis Vision-First Loyalty

## Date: 2026-07-08

## What could break
- Attachment-only uploads that previously got generic clarify may auto-lock `setup_loyalty_program` when visual class is `loyalty_card`.
- `extract-card` soft success may change create-store prefill expectations when image is a stamp card (should not hard-fail).
- Extra vision call latency on image intake when spine path enabled.

## Why
- OCR must never gate loyalty-card missions.
- Visual AttachmentAnalysis is primary; OCR is enrichment + warning.

## Impact scope
- New `lib/intake/attachmentAnalysis.js`
- Intake V2 image pre-process + loyalty lock
- `missionsRoutes` extract-card soft fail for loyalty-looking cards
- Loyalty compile partial draft + missing-field clarify
- Tests

## Smallest safe patch
P1 only. Killswitch: `USE_LOYALTY_SPINE=false` skips auto-compile; AttachmentAnalysis still soft-classifies.
