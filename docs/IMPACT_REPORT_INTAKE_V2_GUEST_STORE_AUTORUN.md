## Impact report: Intake V2 guest store creation (auto-run) auth gate

### (1) What could break
- **Guest execution permissions could expand**: Guests may be able to trigger an automated store build (intended), which increases load/cost if abused.
- **Mission access checks could behave differently**: Passing a “guest user-like” object into shared helpers might bypass assumptions that `req.user` is a full user record.
- **Telemetry/tenant scoping**: If tenant id is derived from `getTenantId(req.user)`, guests might previously have had `null` tenant ids; changing this could affect how mission rows are keyed.

### (2) Why
- Intake V2 currently blocks `create_store` AUTO_RUN paths when `req.user?.id` is absent, even if the request is authenticated as a guest (guest JWT sets `req.guestId` / `req.userId`).
- The shared store runner `executeStoreMissionPipelineRun` requires a `user` object with an `id`; guests have an id but not a full user row.

### (3) Impact scope
- **Backend**: `apps/core/cardbey-core/src/routes/performerIntakeV2Routes.js` store auto-run shortcut and normalized contract `_autoSubmit` path.
- **Guest sessions**: Requests authenticated via `requireUserOrGuest` using guest JWT (`req.isGuest === true`).
- **Downstream**: `executeStoreMissionPipelineRun` and mission pipeline creation metadata/tenant fields.

### (4) Smallest safe patch
- Keep `requireUserOrGuest` as the only gate.
- For store auto-run paths, replace `req.user?.id` checks with an **actor id** resolution (`req.user?.id || req.userId || req.guestId`).
- Construct a minimal “user-like” object for guests (`{ id, role:'guest', isGuest:true }`) when calling shared store execution helper.
- Preserve auth-required behavior for SmartDocument/card flows (explicitly documented as requiring auth).

