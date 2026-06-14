# Creative Factory Entrypoint Fix Report

**Date:** 2026-06-13  
**Intent:** `"Create a Father's Day promotional video for my store."`  
**Scope:** Restore Factory Runtime entry from Performer Intake V2 while keeping Stage D broker protection and Runtime Authority.

---

## 1. What code blocked the request?

| Layer | File | Mechanism |
|-------|------|-----------|
| **Primary block** | `src/routes/performerIntakeV2Routes.js` | `guardBrokerDirectAction()` ran at the **start** of `dispatchIntakeV2DirectTool()` (old line ~698), **before** `tryRouteCreativeFactoryIntent()`. |
| **Guard implementation** | `src/lib/broker/brokerRunwayGuard.js` | When `BROKER_BLOCK_DIRECT_ACTION=true`, returns `BROKER_DIRECT_ACTION_BLOCKED` with message *"Direct tool execution is disabled…"* |
| **Secondary block (latent)** | `src/lib/runtime/performerRuntime/executeRuntimeAction.js` | Same guard applied to `run_factory` because `factoryIntentRouter` did not pass `skipDirectGuard: true`. |

Classification (`create_video` / `direct_action`) succeeded. Factory routing never ran.

---

## 2. What changed?

### Task 1 — Intake dispatch order

**File:** `src/routes/performerIntakeV2Routes.js`

- Added `directToolResultFromFactoryRoute()` helper.
- **`tryRouteCreativeFactoryIntent()` now runs before `guardBrokerDirectAction()`.**
- Removed duplicate factory routing block from the legacy skill/tool fallback section.
- Broker guard applies **only when factory routing returns `null`** (no registry match).

### Task 2 — Runtime-owned `run_factory` bypass

**File:** `src/lib/factoryRuntime/factoryIntentRouter.js`

- `executeRuntimeAction({ actionType: 'run_factory', … })` now includes **`skipDirectGuard: true`**.
- Factory execution context marks `runtimeOwned: true` / `performerRuntimeOwned: true`.

**File:** `src/routes/performerRuntimeRoutes.js`

- `POST /api/performer/runtime/run-factory` also passes **`skipDirectGuard: true`** for API gateway parity.

No change to `guardBrokerDirectAction()` itself. Legacy `dispatch_tool`, skill router, and raw direct tools remain blocked under Stage D.

### Task 3 — Telemetry

**File:** `src/lib/factoryRuntime/factoryTelemetry.js`

| Event | When |
|-------|------|
| `FACTORY_ROUTE_ATTEMPTED` | Start of `tryRouteFactoryIntent()` |
| `FACTORY_ROUTE_ACCEPTED` | Registry match + mission/user context ok, before `run_factory` |
| `FACTORY_ROUTE_REJECTED` | No registry match, missing context, or runtime blocked |

Payload includes: `factoryId`, `intent`, `intentLabel`, `missionId`, `userId` (and `reason` on reject).

Existing `FACTORY_INTENT_ROUTED` blackboard event unchanged.

### Task 4 — Tests

**File:** `src/lib/factoryRuntime/factoryIntentRouter.brokerBypass.test.js`

- With `BROKER_BLOCK_DIRECT_ACTION=true` and `ENABLE_CREATIVE_FACTORY_V4=true`:
  - Father's Day promo video → `run_factory` + `skipDirectGuard: true`
  - `creative_asset_factory_v4` + `awaiting_factory_approval`
  - No broker rejection on factory path
- Non-factory intent → `FACTORY_ROUTE_REJECTED` / no `run_factory`

---

## 3. Why is Runtime Authority still safe?

| Control | Status |
|---------|--------|
| **Stage D broker** | Still **blocks** legacy intake direct tools (`dispatch_tool`, skill fallback, pre-factory paths) when factory does not handle the intent. |
| **`skipDirectGuard`** | Scoped **only** to `actionType: 'run_factory'` from factory intent router and `/run-factory` API — not general `dispatch_tool`. |
| **Runtime ownership** | Factory context carries `runtimeOwned` / `performerRuntimeOwned`; `recordRuntimeAuthorityPathUsed` still fires on factory telemetry and `FACTORY_INTENT_ROUTED`. |
| **Ownership block (Stage E)** | Unchanged — orphan non-runtime dispatch still blocked elsewhere. |
| **Approval gates** | Factory still pauses at `plan_approval` / `final_asset_review`; no silent publish. |

Factory is treated as **runtime-owned execution**, consistent with mission pipeline (`skipDirectGuard: true` on `run_pipeline_step`) and UI runtime actions.

---

## 4. Can Performer now reach Creative Factory V4?

**Yes**, when:

1. `ENABLE_CREATIVE_FACTORY_V4=true` (or lower enabled factory per `resolveCreativeFactoryId()` cascade).
2. `ENABLE_CREATIVE_FACTORY_V1=true` (registry flag gate).
3. Intake classifies to a creative video tool (e.g. `create_video`).
4. `missionId` + `userId` present at dispatch.

**Expected telemetry / status for Father's Day promo video:**

```
FACTORY_ROUTE_ATTEMPTED
FACTORY_ROUTE_ACCEPTED
FACTORY_INTENT_ROUTED
FACTORY_EXECUTION_STARTED
… pipeline stages …
awaiting_factory_approval   (plan checkpoint)
```

**Not expected:** `BROKER_DIRECT_ACTION_BLOCKED` on the factory-matched path.

---

## Verification commands

```bash
cd apps/core/cardbey-core
npx vitest run src/lib/factoryRuntime/factoryIntentRouter.brokerBypass.test.js \
  src/lib/factoryRuntime/factoryIntentRouter.test.js \
  src/lib/broker/brokerRunwayGuard.test.js
```

Live smoke (requires core + dashboard, V4 flag, authenticated store context):

1. Performer chat: *Create a Father's Day promotional video for my store.*
2. Confirm `FactoryConsoleCard` with `creative_asset_factory_v4`.
3. Network: intake `result.dispatchedVia === 'factory_runtime'`, no broker blocker message.

---

## Changed files

| File | Change |
|------|--------|
| `src/routes/performerIntakeV2Routes.js` | Factory-before-broker dispatch order |
| `src/lib/factoryRuntime/factoryIntentRouter.js` | Telemetry + `skipDirectGuard` |
| `src/lib/factoryRuntime/factoryTelemetry.js` | Route attempt/accept/reject events |
| `src/routes/performerRuntimeRoutes.js` | `skipDirectGuard` on `/run-factory` |
| `src/lib/factoryRuntime/factoryIntentRouter.brokerBypass.test.js` | Regression tests |
| `docs/CREATIVE_FACTORY_ENTRYPOINT_FIX_REPORT.md` | This report |
