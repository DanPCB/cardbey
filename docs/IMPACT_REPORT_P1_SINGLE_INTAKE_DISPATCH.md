# Impact Report — P1 Single Intake Dispatch Path

**Date:** 2026-06-12  
**Status:** Applied with minimal safe patch  
**Objective:** Route UI mutations through one `unifiedDispatch()` choke point instead of ad-hoc `executeUiRuntimeAction` / direct API calls.

---

## 1. What could break

| Area | Risk | Why |
|------|------|-----|
| Publish / republish | **High** | Extra confirmation gate could block publish if `requireConfirmation` defaults wrong |
| Hero / avatar patch | **Medium** | Mis-routed capability could reintroduce broker/kernel 409 blocks |
| Store delete | **High** | Delete must still honor `DeleteConfirmationModal` + `confirmedDelete` semantics |
| Performer console CTAs | **Medium** | Console already has capability executors; duplicate planning could add latency |
| Upload multipart routes | **Low** | Uploads use dedicated `/ui-action/upload-*` paths; kept outside unified POST |
| Hybrid publish review | **Medium** | `_preferAgent` / `confirmed` payload fields must pass through kernel unchanged |
| Tests mocking `apiPOST` | **Medium** | Tests mocking `executeUiRuntimeAction` still work; tests hitting `apiPOST` directly need kernel mock |

## 2. Why

- P0 made kernel mandatory but **call sites remained fragmented** (`uiRuntimeClient`, `confirmedDelete`, hybrid API, intake v2).
- Without a single dispatch function, governance and capability selection drift per feature.
- Broker allowlist on core only covered upload actions, not publish/delete metadata.

## 3. Impact scope

- **Dashboard:** `src/lib/intake/*`, `uiRuntimeClient.ts`, `createdItemActions.ts`, publish/hero call sites (via `executeUiAction` redirect).
- **Core:** `runtimeActionTypes.js` metadata only (no execution behavior change).
- **Out of scope (this patch):** Orchestra start, intake v2 mission submit, multipart upload handlers, read-only GETs.

## 4. Smallest safe patch

1. Add `unifiedDispatch()` + thin pipeline modules that **delegate to existing** `apiPOST`, `confirmedDelete`, governance helpers.
2. Make `executeUiRuntimeAction` a wrapper over `unifiedDispatch` (no direct `apiPOST` in `uiRuntimeClient`).
3. Migrate **store delete** and document high-impact publish paths (already on `executeUiAction`).
4. Extend core `runtimeActionTypes.js` with publish/delete/republish config for allowlist parity.
5. Add unit tests for dispatch routing and confirmation gating.

## 5. Rollback

- Revert `uiRuntimeClient.ts` to direct `apiPOST` if dispatch regression occurs.
- Set `DISABLE_KERNEL_MANDATORY=true` only as emergency backend bypass (unchanged from P0).
