# Impact Report: Decision Loop Upload Early Gate

**Date:** 2026-06-29  
**Scope:** Wire `decideTurn()` authority before `create_store` early returns on upload-only turns.

## What could break

| Risk | Why | Severity |
|------|-----|----------|
| Explicit "create store from card" after upload | Early gate must not force `present_options` when user is explicit | Medium |
| Structured form submit / forced tool | Gate skipped for `forcedTool`, `storeCreateFormPayload`, `draftConfirmationSubmit` | Low |
| Campaign / mission flows | Gate skipped for `freshStoreMission`, manual mode | Low |
| Double clarify on turn 2 | Belief delta + `uploadedAssetPending` must align with chip selection | Medium |

## Why

Phase 3 authority replaced `classification` at line ~4549, **after** `create_store` early HTTP returns (~3954–4280). Upload-only image turns never reached `decideTurn()`.

## Impact scope

- `performerIntakeV2Routes.js` — early gate before create_store block
- `lib/decision/earlyDecisionLoopGate.js` (new)
- `lib/decision/hydrateBeliefForDecisionLoop.js` (new)
- Unit tests in `lib/decision/__tests__/`

## Smallest safe patch

1. Reload + hydrate belief after OCR stash (turn 1 upload).
2. Run `runDecisionLoopAuthority` **before** `create_store` early draft block.
3. On `present_options`, return `action: 'clarify'` + options immediately.
4. Skip `create_store` early draft when `_decisionLoop` + `clarify` / `ingest_asset`.
5. Keep existing hook at ~4549 for non-upload paths.

## Rollback

Set `INTAKE_DECISION_LOOP_AUTHORITY=false` and restart core.
