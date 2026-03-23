# Impact Report: Phase 0 Headless Agents v1 API

## Summary
Add new headless/read-only v1 routes under `/api/agents/v1/missions/{missionId}/...` that wrap the existing Mission Console mission spawn + MissionBlackboard read logic.

This is intended to be additive (no changes to existing `/api/missions/...` routes), preserving current Mission Console UX while exposing a cleaner API surface for external clients.

## 1. What could break
| Risk | Why | Mitigation |
|------|-----|------------|
| Mission Console regression | New routes added but could accidentally affect Express routing order/mount paths. | Mount v1 router under `/api/agents/v1` only; do not modify existing `/api/missions` handlers. |
| Auth/tenant scoping mismatch | v1 routes must use the same permission checks as console routes (`requireAuth` + `canAccessMission`). | Reuse existing `requireAuth`/`canAccessMission` helpers and the same spawn-child implementation approach. |
| Pagination shape mismatch | Existing blackboard read uses `afterSeq` semantics; v1 docs mention `offset`. | Support both query params: treat `offset` as `afterSeq` (numeric) and keep `afterSeq` as an alias if needed. Default to current behavior (`limit` default). |
| SSE stream load | Implementing the initial `blackboard/stream` via polling increases query volume per connected client. | Keep polling interval conservative (e.g. 2–3s), tail read using `afterSeq`, and cap `limit`/batch size. This does not alter append/broadcast write paths. |
| Event detail lookup errors | v1 `events/{eventId}` must resolve either MissionBlackboard `id` (string) or `seq` (int). | Validate/parse eventId; if numeric use `seq`, otherwise use `id`. Return consistent `not_found`/`validation` error shapes. |

## 2. Impact scope
- **Backend (core):**
  - `apps/core/cardbey-core/src/createApp.js`: mount new router at `/api/agents/v1`.
  - `apps/core/cardbey-core/src/routes/agentsV1Routes.js` (new): add endpoints for:
    - `POST /api/agents/v1/missions/{missionId}/spawn`
    - `GET /api/agents/v1/missions/{missionId}/blackboard`
    - `GET /api/agents/v1/missions/{missionId}/blackboard/stream` (initial SSE via polling)
    - `GET /api/agents/v1/missions/{missionId}/events/{eventId}`
  - `apps/core/cardbey-core/src/lib/missionBlackboard.js`: add a small helper to fetch a single MissionBlackboard event by `id` or `seq`.

- **Not in scope (for the initial patch):**
  - No orchestration refactor (Phase 1+).
  - No change to existing mission blackboard append/broadcast write paths.
  - No change to existing Mission Console routes or UI.

## 3. Smallest safe patch
1. Create `agentsV1Routes.js` that reuses existing backend building blocks:
   - For `spawn`: call the existing OpenClaw child spawn function (same as `/api/missions/:missionId/spawn-child`) and return `childRunId` with `202`.
   - For `blackboard` (GET): call existing `getEvents()` and return `{ ok: true, events }`.
   - For `blackboard/stream` (SSE): implement a minimal polling loop that:
     - keeps `lastSeqSent`
     - calls `getEvents(missionId, { afterSeq: lastSeqSent, correlationId, limit })`
     - streams incremental events to the client until disconnect
   - For `events/{eventId}`: parse `eventId`:
     - if numeric -> query by `seq`
     - else -> query by `id`
2. Mount router in `createApp.js` at `/api/agents/v1`.
3. Do not change existing `/api/missions/...` endpoints or any UI call sites.

## Acknowledgement
Proceeding with this patch is expected to be low risk because it is additive and reuses the existing MissionBlackboard + spawn execution paths. The only functional risk is SSE polling overhead, which is capped by interval and batch size.

