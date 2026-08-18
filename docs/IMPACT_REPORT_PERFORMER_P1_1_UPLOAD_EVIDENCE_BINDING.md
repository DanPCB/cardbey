# Impact Report — Performer P1.1 Upload Evidence Binding

**Date:** 2026-08-12  
**Prerequisite:** P1 TurnBelief spine  
**Status:** Proceed after user `proceed.`

## (1) What could break

- Create-store handoff that previously used **classification/`activeStore` `storeName`** when Ask → Create store had no form name (may now prefer OCR/card identity or clear stale name → `needs_form` instead of wrong duplicate).
- TurnBelief goal extraction for phrases like “Create store from uploaded card” (no longer treated as a business name).
- Upload-ask skip logging (message only; create-store-from-upload still skips Ask by design).

## (2) Why

Runtime: AWE FINANCIAL card OCR correct, but handoff used stale **NOODLE hut** + location → duplicate path; TurnBelief never saw card-vs-goal conflict because goal identity was laundered from stale params.

## (3) Impact scope

- `createStoreCheckpointDispatch.js` — `resolveCreateStoreHandoffFields`
- `buildTurnBeliefFromIntake.js` — goal name extraction / priority
- `performerIntakeV2Routes.js` — skip log clarity
- Unit tests for handoff + TurnBelief

## (4) Smallest safe patch

1. Detect upload-driven create handoff; prefer OCR/card evidence over params when they conflict or goal is generic.
2. Clear param-sourced location/contact when identity is replaced from evidence.
3. Fix `extractGoalBusinessName` so upload phrases are not business names; prefer goal-message extract over handoff `businessName`.
4. No new orchestrators; no change to duplicate detector itself (it receives the correct name).
