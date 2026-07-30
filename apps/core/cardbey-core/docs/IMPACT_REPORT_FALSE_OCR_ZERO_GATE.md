# Impact Report — False OCR 0% / “need more detail” on business-card upload

**Date:** 2026-07-30  
**Surface:** Performer image-only create-store  
**Live evidence:** PTH International Furniture card → “I need a bit more detail…”, then “Can't create store yet… Confidence 0% (Source OCR)”, while Core still kicks off **INTERNATIONAL FURNITURE**.

## Root cause

1. **Composer skips `extract-card` for image-only uploads** (`imageOnlyIntake && !storeCreateLikely`), then immediately auto-sends `(Image attached)` with an empty handoff.
2. **STRICT client gate** (`prepareUploadCreateStoreUnderstanding`) builds CanonicalUnderstanding from that empty handoff → `source: 'ocr'`, confidence 0 → scary blocked card — even though OCR was never attempted on the client.
3. **`needMoreDetail` + “Use Create Store…”** comes from Core `validation_failed` clarify on that empty attach turn; Core can still OCR later and start the correct store (dual UX: false block + real kickoff).

## What could break

- One extra `extract-card` call per distinct image on image-only attach (existing in-flight / dedupe guards apply).
- When OCR returns a business name, auto-send uses “Create store from uploaded card” (agent-first draft) instead of Upload Ask chips — unpublished draft only; publish still governed.
- Truly unreadable images still STRICT-block after a real OCR attempt.

## Impact scope

- `ConsoleCentreColumn.tsx` — run extract-card for image-only; promote create-store send when OCR has a name
- `imageBoundStoreIdentity.ts` — ensure extract-card once before STRICT block when handoff has no identity

## Smallest safe patch

Stop treating image-only as “skip OCR”; fill handoff before intake/gate; only show the blocked card after OCR was actually attempted.
