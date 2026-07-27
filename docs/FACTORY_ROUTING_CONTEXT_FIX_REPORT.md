# Factory Routing Context Fix Report

**Date:** 2026-06-12  
**Scope:** Performer Intake V2 → Creative Factory V4 routing when `missionId` or real `storeId` is missing at intake time.

---

## Verdict: Can Performer chat now start V4?

**YES** — when the user is signed in and a real store is selected (or auto-resolved).

With `storeId=temp`, Performer now returns a **store-selection checkpoint** instead of a raw technical error. After the user picks a store, the same prompt can create a mission and route to `creative_asset_factory_v4` via `run_factory`.

---

## Problem

Performer at `/app?entry=performer&storeId=temp` returned:

> missionId and userId are required for factory routing

for the prompt:

> Create a Father's Day promotional video for my store.

Factory routing (`tryRouteCreativeFactoryIntent`) was reached, but it required `missionId` and `userId` **before** calling `run_factory`. Intake V2 often arrives without a mission (fresh chat) and with placeholder store context (`temp`) from the URL. The router surfaced an internal guard message instead of recovering context or prompting for store selection.

---

## Why `missionId` was missing

1. **Fresh Performer session** — Intake V2 direct-tool dispatch does not always have an active mission when the user sends their first factory-routable message. `dispatchMissionId` is derived from request body / session and is often empty on first turn.

2. **No pre-intake mission creation** — The factory router assumed mission context already existed and rejected early with `MISSING_CONTEXT` rather than using the existing Mission Execution path (`createMissionPipeline`).

3. **Placeholder `storeId`** — URL `storeId=temp` is not a real store. It was passed through as if valid, so even when a mission could have been created, factory routing lacked trustworthy store targeting.

---

## How context is created / recovered now

New module: `apps/core/cardbey-core/src/lib/factoryRuntime/factoryRoutingContext.js`

Before `executeRuntimeAction({ actionType: 'run_factory' })`, `tryRouteFactoryIntent` calls `resolveFactoryRoutingContext()`:

| Step | Behavior |
|------|----------|
| Factory intent match | `resolveFactoryIntent()` — same registry as before |
| `userId` | Required from auth/session; missing → `AUTH_REQUIRED` + `FACTORY_CONTEXT_MISSING` |
| `storeId` | Reject placeholders (`temp`, `draft`, …); try context, auto-resolve single store, then `resolveStoreAmbiguity()` |
| `missionId` missing | `createMissionPipeline()` with `source: performer_intake_v2`, `intentLabel`, `factoryId`, raw user text |
| `missionId` present | Reuse as-is + `FACTORY_CONTEXT_RECOVERED` |

Mission metadata written at creation:

```js
metadata: {
  source: 'performer_intake_v2',
  intentLabel: 'create_video',
  factoryId: 'creative_asset_factory_v4',
  rawUserText: userMessage,
  storeId,
}
```

Telemetry events:

- `FACTORY_CONTEXT_RECOVERED` — existing `missionId` reused
- `FACTORY_CONTEXT_MISSING` — missing `userId`, store, or mission create failure
- `FACTORY_MISSION_CREATED_FOR_FACTORY` — new mission created for factory routing

Runtime Authority is preserved: routing still calls `executeRuntimeAction({ actionType: 'run_factory', skipDirectGuard: true })` — no `dispatchTool` bypass.

---

## How `storeId=temp` is handled

`isPlaceholderStoreId()` treats `temp`, `draft`, `placeholder`, `none`, `null`, `undefined`, and empty strings as invalid.

When no real store can be resolved:

1. `resolveFactoryRoutingContext` returns `STORE_SELECTION_REQUIRED` with a structured checkpoint.
2. `tryRouteFactoryIntent` maps that to `{ blocked: true, checkpoint: 'store_selection', ... }` — not a raw `MISSING_CONTEXT` error.
3. `performerIntakeV2Routes.js` → `directToolResultFromFactoryRoute()` converts the checkpoint into an intake `clarify` response.

User-facing message:

> Please select a store first so I can create the promotional video for it.

---

## Intake V2 wiring

`dispatchIntakeV2DirectTool()` in `performerIntakeV2Routes.js`:

- Passes `userId`, `storeId`, `tenantId`, and optional `missionId` into `tryRouteCreativeFactoryIntent`.
- Uses `factoryRoute.missionId` from context resolution to backfill `payload.missionId` and `toolCtx`.
- Store checkpoint → `intakeOverride` with `action: 'clarify'` and `clarifyType: 'store_picker'`.

---

## Tests added / updated

| File | Coverage |
|------|----------|
| `factoryRoutingContext.test.js` | Placeholder store, auth required, store checkpoint, mission create, mission recover |
| `factoryIntentRouter.context.test.js` | Father's Day → V4 after mission creation; store checkpoint; auth required |
| `factoryIntentRouter.brokerBypass.test.js` | Father's Day → `run_factory` with broker guard active (existing mission) |

All 10 factory routing tests pass:

```
factoryRoutingContext.test.js          5 passed
factoryIntentRouter.context.test.js    3 passed
factoryIntentRouter.brokerBypass.test.js 2 passed
```

---

## Manual verification checklist

1. Sign in to Performer with a **real** store selected (not `storeId=temp` in URL).
2. Send: *Create a Father's Day promotional video for my store.*
3. Expect: mission created (if none), `run_factory` → `creative_asset_factory_v4`, factory approval flow — not `missionId and userId are required`.
4. With `storeId=temp`: expect store-selection clarify message, not a technical error.

---

## Files changed

- `src/lib/factoryRuntime/factoryRoutingContext.js` *(new)*
- `src/lib/factoryRuntime/factoryRoutingContext.test.js` *(new)*
- `src/lib/factoryRuntime/factoryIntentRouter.js`
- `src/lib/factoryRuntime/factoryIntentRouter.context.test.js` *(new)*
- `src/lib/factoryRuntime/factoryTelemetry.js`
- `src/routes/performerIntakeV2Routes.js`
