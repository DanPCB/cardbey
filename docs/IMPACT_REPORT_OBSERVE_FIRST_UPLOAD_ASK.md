# Impact Report — Observe-first upload Ask (TurnBelief before runway)

**Date:** 2026-08-13  
**Authorization:** User: “implement this task now: Observe first”

## Goal

On every new upload turn, **Observe** (OCR/analysis → TurnBelief) **before** create-store form or generic runway chips.

## (1) What could break

- Upload Ask copy/options change (belief-grounded labels like “Create store for ANISON…” instead of bare “Create store”).
- Paths that expected Ask without `turnBelief` on payload (additive field).
- Tests asserting exact “What would you like to do” / bare Create store label.

## (2) Why

Halfway task-switch tests prove runway starts without reading. Ask often lacks OCR hydration (`extractedText` not passed) and never builds TurnBelief before chips.

## (3) Impact scope

- `performerTurnBelief/buildObserveFirstUploadAsk.js` (new)
- `intakePendingTurnHandling.js`, `earlyDecisionLoopGate.js`, `presentOptions.js` / `responseBuilder.js`
- Unit tests
- **Not:** publish, auto-execute create_store, campaigns

## (4) Smallest safe patch

1. Build TurnBelief from attachmentAnalysis/OCR on upload Ask.
2. Ask copy states what was read; options stamped with evidence; `storeCreationDraft: null`.
3. Pass `extractedText` into belief hydrate on Ask path.
4. Attach `turnBelief` + status projector fields on Ask payload.
