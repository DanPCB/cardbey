# Impact Report: Phase D (PhaseOutputs + minimal read APIs)

**Date:** 2026-03-02  
**Scope:** Mission Execution panel enhancement only. Additive read-only APIs and a reusable PhaseOutputs component. No changes to mission execution behavior, agent chat, draft-store, or auth flows.

---

## 1. What could break

| Area | Risk | Why |
|------|------|-----|
| Mission execution | Low | No change to DAG, step handlers, or execution flow. Only UI and read-only APIs. |
| Agent chat | None | No touch to agent messages or chain plan. |
| Campaign APIs | Low | New GET by-mission is additive; existing GET /plan already exists. Same requireAuth and tenantKey. |
| Auth/session | None | New endpoints use same requireAuth; no new tokens or secrets. |
| Draft-store | None | No draft-store routes or context changed. |
| Routing | Low | No new pages; only expanding Execution drawer content. Misrouting risk: GET /by-mission must be registered before GET /:campaignId so "by-mission" is not parsed as campaignId. |

---

## 2. Mitigations

- **APIs:** Read-only GETs only; no secrets/tokens in response. Tenant-scoped. Fallback: by-mission finds campaign by missionId first, then by planId when campaign.missionId is null.
- **UI:** PhaseOutputs is additive under each step; default collapsed. Feature flag `MISSION_PHASE_OUTPUTS` disables rendering for rollback.
- **Route order:** Mount GET `/by-mission` before GET `/:campaignId` in campaign routes.
- **Admin-only:** Audit section in PhaseOutputs is gated (admin-only placeholder); no system health to non-admin.

---

## 3. Impact scope

- **Backend:** `apps/core/cardbey-core/src/routes/campaignRoutes.js` — add GET /by-mission; optionally include offer.data in campaign read responses.
- **Dashboard:** New PhaseOutputs component; campaign API helpers (getCampaignPlanByMission, getCampaignByMission); ExecutionDrawer enhancement with feature flag.
- **Unchanged:** Mission store, plan generator, step handlers, agent chat, validate-scope, create-from-plan, draft-store, image resolution, auth middleware.

---

## 4. Smallest safe patch

- Add GET `/api/campaign/by-mission?missionId=...` (requireAuth, tenantKey, latest CampaignV2 with schedules/creatives/offer/deployments; fallback by planId if no campaign by missionId).
- Add reusable `<PhaseOutputs missionId phaseId />` with phase mapping (validate_scope → plan API, create_campaign → by-mission API, campaign_report → placeholder).
- In ExecutionDrawer, under each step, add collapsible “Outputs” rendering PhaseOutputs when feature flag is on.
- Gate audit section to admin-only; no new ops audit endpoint required (placeholder).

---

## Phase D enhancement: Tasks + Audit (read-only)

**Risks:** (1) **Mission UI** — additive only (Tasks + Audit panels); no change to execution. (2) **Campaign APIs** — new GET `/:campaignId/tasks` is read-only, tenant-scoped; route must be registered before `/:campaignId`. (3) **Auth** — audit uses existing GET `/api/ops/audit-trail` with requireAdmin; non-admin gets 403, UI shows “Access denied”. (4) **Draft-store / orchestrator** — no change.

**Mitigations:** No polling; fetch tasks/audit only when user expands the respective panel. Cache in component state to avoid duplicate requests. Env flags `VITE_MISSION_PHASE_TASKS` and `VITE_MISSION_PHASE_AUDIT` allow disabling Tasks or Audit for rollback.
