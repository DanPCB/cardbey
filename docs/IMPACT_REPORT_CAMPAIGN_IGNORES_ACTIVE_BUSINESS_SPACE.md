# Impact Report: Campaign intent ignores active Business Space (staging)

**Date:** 2026-08-11  
**Status:** Smallest safe patch

## Symptom

On staging, user is in **ABC Fashion** (Business Space, CURRENT) and asks `launch 2 week campaign for my store`. Performer responds with **create-store form** instead of using that store / campaign plan.

## Root cause (code-traced)

1. Space switcher navigates to `/app?entry=performer&storeId=<id>` and writes `sessionStorage.cardbey.performer.activeStoreId`.
2. `readPerformerEntryContext` only reads query `spaceId`, **not** `storeId` → entry space is empty.
3. `runtimeSessionStoreId` starts `null` and only hydrates from URL `storeId`; it does **not** hydrate from sessionStorage on load. Space switcher UI still shows CURRENT via sessionStorage → **UI/space desync**.
4. Intake then sends `spaceType: personal` + null store → intent reasoner treats campaign as `create_store_first` → blank store form.
5. Core also skips client `activeStoreId` when `spaceType === 'personal'`, amplifying the desync.

## What could break

| Risk | Mitigation |
|------|------------|
| Stale session store after leaving a business | Prefer URL `storeId`; clear session on personal navigation |
| Personal space wrongly binds a store | Only hydrate session store when on Performer `/app`; personal path `/space/personal` remains personal |
| Core accepts unowned store ids | Keep `validateUserStoreId` |

## Smallest safe patch

1. Dashboard: treat URL `storeId` as entry space id; hydrate `runtimeSessionStoreId` from URL then sessionStorage; clear session on personal space switch.
2. Core: honor validated `currentContext.activeStoreId` even when spaceType was wrongly marked personal.
