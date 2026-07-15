# Create Store Intent Consistency — Completion Report

**Date:** 2026-07-15  
**Impact:** `docs/IMPACT_REPORT_create-store-intent-consistency.md`

## Root cause

Create-store matching was **exact-phrase / optional-`a`-only** based. Phrases with `my` or `my first` missed allowlists and fell through to `general_chat` (“How can I help you today?”).  
`starter=create_store` only **prefilling** `"Create my first store"` — the known-failing phrase — without runtime dispatch.

## Why “create a store” worked

It hit `EXACT_STORE_PHRASES` / ontology `(a\s+)?store` and (with structured actions) `action: create_store`.

## Why “Create my store” / “Create my first store” failed

1. Not on exact allowlists; ontology used `(a\s+)?` only.  
2. With an active store selected, fast path returned `null` before runway (gap patterns never ran).  
3. Starter/onboarding chip shipped the failing wording without `action: create_store`.

## Files changed

**Core**
- `src/lib/intent/createStoreIntentContract.js` (+ tests)
- `src/lib/intent/storeCreateFastPath.js`
- `src/lib/intake/assetUploadGuard.js`
- `src/lib/intake/accountStoreIntakeGate.js`
- `src/lib/intake/intakeIntentOntology.js`
- `src/lib/intake/storeWebsiteRunwayClassifier.js`

**Dashboard**
- `src/lib/createStore/createStoreIntent.ts` (+ tests)
- `src/app/console/ConsoleCentreColumn.tsx` (starter dispatch, composer intercept, chips)
- `src/app/console/performer/PerformerHomeIdle.tsx`
- `src/app/console/performer/usePerformerConsole.ts`
- `src/routes/paths.ts` / `canonicalNavBuilders.ts`
- `src/lib/intake/quickActionRegistry.ts`
- `src/lib/performerIntake/goalSignals.ts`

## Canonical intent

```
intent: create_store
requiresExistingStore: false
createsStoreContext: true
runtimeAction: create_store
normalizeIntentText + CREATE_STORE_PATTERNS (stacked my|a|new|first)
```

## Starter consumption

1. Detect `starter=create_store` or `newStore=1`  
2. `beginNewStoreCreation()` / `startCreateStore` (fresh mission + `action: create_store`)  
3. Consume query params **only after** dispatch call  
4. If both params present → single `newStore` handler (no double mission)

## Request / mission reuse

`beginNewStoreCreation` clears active mission refs, sets `freshStoreMissionNextRef`, starts a **new** mission with structured `create_store` — not absorbed by prior `general_chat`.

## Tests

- Core: `createStoreIntentContract.test.js` — pass  
- Dashboard: `createStoreIntent.test.ts` — pass  
- Existing: `storeCreateIntentFastPath.test.js` — pass  

## Not marked “fully fixed” until

Manual E2E: open `/app?entry=performer&onboarding=1&starter=create_store` → form on first load; then submit “Create my first store” / “Create my store” / “create a store” → same form path.
