# Impact Report: Performer Store Context Phase 1

**Date:** 2026-07-11  
**Scope:** Authenticated multi-store owners on Personal Space / no `activeStoreId`

## Problem

Performer conflates `activeStoreId: null` with “user has no stores,” routing to greenfield `create_store` / `needs_form` even when the account owns multiple businesses.

## What could break

| Area | Risk | Mitigation |
|------|------|------------|
| Guest / greenfield onboarding | Low | Gate only when `accountHasStores` and intent is not explicit create |
| Explicit “Create store” / onboarding starter | Low | `isExplicitGreenfieldCreateStoreIntent` preserves form path |
| Structured form submit with `storeName` | Low | Form name counts as explicit create |
| Single-store owners | Low | Store picker with one candidate; optional auto-resolve later |
| Loyalty store clarify | None | Reuses `buildExecutionContextClarifyPayload` contract |

## Why (root cause)

- `hasStore` in IntentReasoner = session `activeStoreId`, not account businesses
- `start_new_workflow` always mapped to `create_store`
- `needs_form` had no account-store check

## Impact scope

- Performer intake v2 for authenticated users with ≥1 business and no active store context
- Unchanged: guests, zero-store users, users with active business selected

## Smallest safe patch

1. `accountStoreIntakeGate.js` — account store load + explicit-create detection + store picker payload
2. `createStoreCheckpointDispatch` — `store_selection_required` before `needs_form`
3. `intentIntegration` — `start_new_workflow` → store picker when account has stores (non-explicit create)
4. `intentReasoner` — `accountHasStores` in user state; `select_store_first` blocker path

## Acceptance criteria

See Phase 1 test matrix in product brief: multi-store + vague input → clarify/picker, never greenfield form; explicit create → form unchanged.
