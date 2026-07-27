# Impact Report: Create store stops after draft confirm (OCR category)

**Date:** 2026-07-27  
**Status:** Ready to patch (awaiting proceed / implementing with user report of stop)

## Symptom

User confirms a complete store draft (`Create store: MAMOS · Greek street food · …` or `Create store: CA Handyman Services · handyman · Melbourne`). User bubble appears; Thinking disappears; **no agent follow-up** (“stopped”).

## Root cause

1. Business-card understanding / OCR fills **free-text** category (`Greek street food`, `handyman`).
2. Draft UI treats any non-empty category as complete (checkmark + Create store / Continue).
3. Fresh-store fast path runs `validateCreateStorePayload` → `validateStoreCreationFields` → **`INVALID_CATEGORY`** because only picker labels are allowed (`Fashion`, `Food & drink`, …).
4. Core returns **400** `action: validation_error`.
5. Client (`submitStoreCreationDraft`) removes Thinking, optionally patches `fieldErrors` on the draft card, and **returns without an agent chat message**. Category picker is often hidden when the draft looked “complete”, so the error is invisible.

Secondary quality issue (same screenshots): location can be a tagline (`GREEK STREET FOOD`) — separate sanitize; not the silent-stop cause.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Wrong category bucket | Aggressive alias map | Prefer keyword heuristics + default `Other`; keep exact picker labels unchanged |
| Tests expecting free-text category on form | Inference previously returned raw OCR strings | Update tests; mission still gets a valid picker category |
| Users relying on free-text category display | Canonical label shown after confirm | Acceptable; aligns with picker |

## Impact scope

- Core: category canonicalize + draft inference; fresh-path form normalize before validate
- Dashboard: always surface validation_error in Performer chat after draft submit
- Create-store-from-upload / draft confirm only — typed picker categories unchanged

## Smallest safe patch

1. Add `canonicalizeCreateStoreCategory()` next to `VALID_CATEGORIES`; use in `inferStoreCategoryFromHint` and before fast-path validation (mutate form `storeType`/`category`).
2. In `submitStoreCreationDraft` catch for 400 `validation_error`: always `addMessage` with primary field message / suggestion (never silent).
3. Tests: Greek street food → Food & drink; handyman → Home & garden or Other; validation path no longer 400 for those OCR strings after canonicalize.

## Follow-up (2026-07-27)

Still seeing `Invalid category selected` for `massage` / `beauty salon` while Core had crashed (`nodemon` waiting). Hardening:

- Client-side canonicalize before draft POST (works even if Core is stale).
- Aliases: massage / beauty salon → Beauty; vietnamese → Food & drink.
- Upload Ask “Create store” demoting to vision/`show_execution_plan` now shows a retry message instead of a dead-end chat.

## No-parallel-stack proof

Reuses existing draft + fast-path + `validateStoreCreationFields`; no new envelope or parallel create_store stack.
