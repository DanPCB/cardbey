# Impact Report: Runtime Target Readiness

## Summary

Adds operational readiness orchestration distinct from prerequisite resolution. Fixes stale "need a store first" banner after store creation by computing whether a target **exists** vs is **operationally ready**.

## Distinction

| Layer | Question | Example |
|-------|----------|---------|
| Prerequisite | Is the resource missing? | No store → block step, show prerequisite card |
| Readiness | Does the resource exist but need onboarding? | Draft ready → publish guidance |

## What could break

1. **Session `needsStoreFirst`** — When `ENABLE_RUNTIME_TARGET_READINESS=true`, derived from readiness state not raw store count.
2. **Store fallback** — Readiness enables store resolution even when `ENABLE_RUNTIME_STORE_FALLBACK=false`.
3. **Banner UX** — Generic create-store banner hidden when `targetReadiness.exists`.

## Root cause fixed

- Session used `userStores.length === 0 && !activeStoreId` without resolving store from completed store missions or drafts.
- `loadUserStores` filtered `isActive: true` only; store fallback disabled left empty store list.
- UI had no readiness-aware guidance path.

## Rollback

Set `ENABLE_RUNTIME_TARGET_READINESS=false`.

## Enable

```env
ENABLE_RUNTIME_TARGET_READINESS=true
ENABLE_RUNTIME_SESSION_REHYDRATION=true
```
