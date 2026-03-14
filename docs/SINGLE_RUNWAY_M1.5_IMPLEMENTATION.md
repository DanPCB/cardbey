# Single Runway M1.5 — Durable Mission Inbox + Orchestrator-Only Execution

## Goal

Prevent drift by making Mission Execution the only execution runway:

- Artifact/outcome UIs (Draft Review, MI Assistant sidebar) must **NOT** call `/api/mi/orchestra/start` when `missionId` exists.
- They must create an **IntentRequest** in a durable Mission Inbox.
- Mission Execution UI renders the inbox and can run intents.

## Architecture (Single Runway)

```
User
   │
   ▼
Mission Execution (Control Tower)
   │
   ▼
Mission Inbox (IntentRequests)
   │
   ▼
MI Orchestrator
   │
   ▼
Agent Team
   │
   ▼
Artifacts (store / campaign / slideshow)
```

Artifacts can only: **view**, **edit**, **request action**. They cannot execute.  
**Rule:** No direct AI execution outside Mission Execution. Enforce via guardrail comments today; later add an eslint rule or code-search test that blocks direct `/api/mi/orchestra/start` from artifact code.

## IntentRequest: type + agent

- **type** — User intent (e.g. `rewrite_descriptions`, `generate_tags`, `generate_store_hero`). Intent-driven, not feature-driven.
- **agent** (optional) — Target agent for the orchestrator (e.g. `CopyAgent`, `CatalogAgent`, `MediaAgent`). Makes M3 routing simpler: orchestrator maps type → agent when not set; when set, routes directly.

## Constraints Respected

- Minimal diff; existing orchestra endpoints unchanged.
- Workflow integrity preserved (no skipped steps).
- Users who open Draft Review **without** `missionId` keep legacy direct-orchestra behavior.

---

## Files Changed

### Backend (core)

| File | Change |
|------|--------|
| `prisma/sqlite/schema.prisma` | Added model `IntentRequest` (id, missionId, userId, type, **agent**, payload, status, createdAt, updatedAt); relation `Mission.intentRequests`. |
| `prisma/postgres/schema.prisma` | Same `IntentRequest` model + relation. |
| `src/routes/miIntentsRoutes.js` | **New.** POST/GET `/missions/:missionId/intents`, POST `.../intents/:intentId/run`; requireAuth; mission-owner check via `canAccessMissionForIntents`. |
| `src/server.js` | Mount `miIntentsRoutes` at `/api/mi` before `miRoutes`. |

### Frontend (dashboard)

| File | Change |
|------|--------|
| `src/lib/missionIntent.ts` | When `missionId` exists: `dispatchMissionIntent` POSTs to `/api/mi/missions/:missionId/intents` then navigates. Added `createMissionIntent`, `listMissionIntents`, `runMissionIntent`. |
| `src/lib/missionRuntime/executeOrchestra.ts` | **New.** Only allowed module to call orchestra/start from dashboard; banner: "Outcome UIs must not execute." |
| `src/lib/orchestraClient.ts` | Guardrail comment: outcome UIs must not call startOrchestraTask when missionId exists; use dispatchMissionIntent. |
| `src/features/storeDraft/review/ImproveDropdown.tsx` | When `missionId` + gated goal: await `dispatchMissionIntent` (POST to inbox), toast success/error; no direct orchestra call. |
| `src/app/console/ExecutionDrawer.tsx` | Fetch intents via `listMissionIntents(mission.id)`; render "Mission Inbox" with queued/running/completed/failed; "Run" for queued calls `runMissionIntent`. |

---

## Manual Test Steps

1. **Backend: apply schema and generate client**
   - From `apps/core/cardbey-core`:  
     `npx prisma generate --schema prisma/sqlite/schema.prisma`  
     (or postgres if you use it)  
   - If using SQLite: `npx prisma db push --schema prisma/sqlite/schema.prisma`  
   - Restart core server.

2. **Start mission → Draft Review with missionId → "Generate tags"**
   - Create a store mission from Mission Console.
   - Open Draft Review (URL includes `missionId`).
   - Click Improve → "Generate tags".  
   - **Expected:** No `POST /api/mi/orchestra/start` from this click. Request goes to `POST /api/mi/missions/:missionId/intents`. Toast "Queuing in Mission Inbox…" then "Action queued in Mission Inbox. Opening Mission Console…". Browser navigates to mission.

3. **Mission Execution → see queued intent**
   - With the same mission open (Execution Drawer visible), confirm "Mission Inbox" section shows the new intent with status **queued** and a **Run** button.

4. **Run intent (stub)**
   - Click **Run** on a queued intent.  
   - **Expected:** Intent status moves to running then (after stub delay) completed. No orchestra/start call from this UI yet (stub only).

5. **Draft Review without missionId (legacy)**
   - Open Draft Review without `missionId` in the URL (e.g. direct link or old bookmark).
   - Click Improve → "Generate tags".  
   - **Expected:** Legacy behavior: direct `POST /api/mi/orchestra/start` and job run as before.

---

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Prisma client missing `intentRequest` | Run `prisma generate` after schema change. Routes check `prisma.intentRequest` and return 503 with clear message if missing. |
| Mission not in DB (dashboard-only missionId) | `canAccessMissionForIntents` checks Mission table then OrchestratorTask. If neither exists, 403. Dashboard missions that never hit backend will need to be created via getOrCreateMission (e.g. when first intent is created we could create mission — not done in M1.5; mission must exist for POST intents). |
| Cross-tenant access | All intents routes use `canAccessMissionForIntents(missionId, req.user)`; only mission owner (Mission.createdByUserId / tenantId or OrchestratorTask userId/tenantId) can create/read/run. |
| Run intent stub only | POST `.../intents/:intentId/run` currently sets status to running then completed after 500ms. Follow-up: wire to real orchestrator run. |
| Pipeline vs AI Operator still two runways | Unchanged in M1.5; M2 will unify. M1.5 stops outcome UIs from executing when missionId exists. |

---

## M2 / M3 Direction (from strategy)

- **M2 — One mission start:** Unify Pipeline and AI Operator into a single backend runway. Same mission start endpoint (e.g. `POST /api/mi/missions/start`) instead of separate `/api/mi/orchestra/start` and `/api/ai-operator/start`. UI can switch modes; backend runtime is identical.
- **M3 — Agent layer:** Orchestrator runs a defined agent team (e.g. Context Agent → Catalog Agent → Copy Agent → Media Agent → QA Agent → Publish Agent). Each agent emits events; Mission Execution consumes them and asks the user at checkpoints. IntentRequest.type (and optional .agent) drives which agent runs.

## Open Issues / Follow-Ups

- **Run intent for real:** Wire `POST .../intents/:intentId/run` to start the actual orchestra job (goal from intent.type + payload, optionally agent) and update intent status from job completion.
- **Mission creation:** First intent POST already uses getOrCreateMission when mission is missing so inbox works for dashboard-originated missionIds.
- **Enforce no direct execution:** Add eslint rule or code-search test that blocks direct `/api/mi/orchestra/start` (or `startOrchestraTask`) from artifact/outcome UI code; only `missionRuntime/executeOrchestra` and Mission Execution paths may call it.
- **MI Assistant:** Route Agent Mode actions through dispatchMissionIntent when on a mission-backed draft (no direct store/draft mutation).
- **Other Draft Review CTAs:** Power Fix, Generate products, Fix Image Mismatch: when missionId present, route through dispatchMissionIntent instead of direct orchestra/start.
