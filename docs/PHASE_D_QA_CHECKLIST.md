# Phase D: PhaseOutputs + minimal read APIs — QA checklist

**Date:** 2026-03-02  
**Scope:** Mission Execution panel enhancement only. Read-only APIs and reusable PhaseOutputs component. No changes to mission execution behavior, agent chat, draft-store, or auth.

---

## Files changed

| File | Change |
|------|--------|
| `docs/IMPACT_REPORT_PHASE_D_PHASE_OUTPUTS.md` | Impact report (risks + mitigations). |
| `apps/core/cardbey-core/src/routes/campaignRoutes.js` | GET `/api/campaign/by-mission?missionId=...`; GET `/api/campaign/:campaignId/tasks` (OrchestratorTask for campaign, newest 20); shared `campaignWithRelationsSelect` with `offer.data`. |
| `apps/core/cardbey-core/src/routes/opsRoutes.js` | Allow `CampaignV2` in `ALLOWED_AUDIT_TYPES` for GET `/api/ops/audit-trail` (requireAdmin). |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` | `getCampaignPlanByMission`, `getCampaignByMission`, `getCampaignTasks(campaignId)`, `getOpsAuditTrail(entityType, entityId, limit)`; `/api/ops` in protected prefixes. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/PhaseOutputs.tsx` | `<PhaseOutputs missionId phaseId showAudit />`: validate_scope, create_campaign (schedules/deployments/offer/creatives), campaign_report placeholder; collapsible **Tasks** (fetch on expand, cache); admin-only **Audit trail** (fetch on expand, 403 → “Access denied”); env flags `VITE_MISSION_PHASE_TASKS`, `VITE_MISSION_PHASE_AUDIT`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` | Feature flag `MISSION_PHASE_OUTPUTS` (env `VITE_MISSION_PHASE_OUTPUTS`); under each campaign step, render PhaseOutputs (default collapsed). |
| `docs/PHASE_D_QA_CHECKLIST.md` | This file. |

**Not changed:** Mission execution flow, step handlers, agent chat, campaign create/validate APIs, draft-store, auth, routing (no new pages).

**Tasks query robustness:** create-from-plan now sets `request.tags: { campaignId, missionId, phaseId: 'create_campaign' }` on every OrchestratorTask. GET `/:campaignId/tasks` matches either `request.campaignId === campaignId` or `request.tags?.campaignId === campaignId`, so historical tasks (without tags) and future tasks (with tags or changed request shape) both appear.

---

## Example screenshots checklist

- [ ] **Validate scope output:** Mission with validated plan → open Execution drawer → expand “Outputs” on “Validate campaign scope” step → status chip (validated/blocked), checks/blockers/warnings, risk/confidence, degradedMode banner when present.
- [ ] **Create campaign output:** Mission with created campaign → expand “Outputs” on “Create campaign” step → campaign id, schedules table, deployments list, offer summary (type/value/appliesTo/window), creatives count.
- [ ] **Tasks panel:** Expand “Create campaign” Outputs → expand “Tasks” → list shows campaign.create, schedule.create, creative.generate, channel.deploy with status and updatedAt (and short error if any).
- [ ] **Audit trail (admin):** With `showAudit={true}` and admin user → expand “Audit trail” → last 20 events (time, action, metadata summary); no secrets.
- [ ] **Campaign report:** “Campaign report” step → Outputs shows “Not available yet”.

---

## Manual QA checklist

1. [ ] **create_campaign phase shows schedules/deployments/offer/creatives as before:** After create-from-plan → expand Outputs on Create campaign → schedules, deployments, offer summary, creatives summary visible.
2. [ ] **Tasks panel shows campaign tasks with correct statuses:** Expand Outputs → expand “Tasks” → campaign.create, schedule.create, creative.generate, channel.deploy with status (e.g. completed) and updatedAt; optional short error when failed.
3. [ ] **Audit only visible for admin and shows expected actions:** With admin user and `showAudit={true}` → expand “Audit trail” → events include campaign_created, schedule_created, creative_created, deployments_created, offer_created (time, action, small metadata). Non-admin: audit section not shown when `showAudit={false}`; or when shown and user is non-admin, API returns 403 and UI shows “Access denied”.
4. [ ] **Feature flag still disables PhaseOutputs entirely:** Set `VITE_MISSION_PHASE_OUTPUTS=false` → rebuild → Execution drawer does not show PhaseOutputs under steps. Optional: `VITE_MISSION_PHASE_TASKS=false` disables Tasks subsection; `VITE_MISSION_PHASE_AUDIT=false` disables Audit subsection.

---

## Rollback plan

- **Disable PhaseOutputs in UI:** Set `VITE_MISSION_PHASE_OUTPUTS=false` in env and rebuild dashboard. Execution drawer no longer shows PhaseOutputs under steps.
- **Disable Tasks or Audit only:** Set `VITE_MISSION_PHASE_TASKS=false` or `VITE_MISSION_PHASE_AUDIT=false` and rebuild; Tasks or Audit subsection is hidden.
- **Revert backend:** Remove GET `/by-mission`, GET `/:campaignId/tasks`; revert `CampaignV2` from `ALLOWED_AUDIT_TYPES` if needed. Existing GET `/plan`, GET `/by-plan/:planId`, GET `/api/ops/audit-trail` (DraftStore, OrchestratorTask) remain.
- **Revert dashboard:** Remove PhaseOutputs tasks/audit UI and API helpers if unused elsewhere.

---

## Launch campaign mission wiring (Phase A/B + PhaseOutputs)

**Why green steps didn’t imply persisted outputs:** Campaign missions had no step handlers; `runStepHandler` only handled `plan.type === 'store'`. For campaign it returned `{ ok: true }` without calling the backend, so the DAG marked steps completed but no CampaignPlan or CampaignV2 was created with that missionId. PhaseOutputs then got 404.

**Files changed (wiring):**

| File | Change |
|------|--------|
| `docs/IMPACT_REPORT_LAUNCH_CAMPAIGN_MISSION_WIRING.md` | Impact note + why green ≠ outputs. |
| `apps/core/cardbey-core/src/routes/campaignRoutes.js` | Log req.user (authenticated/anon) for GET /plan and GET /by-mission (non-prod). |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` | `postCampaignValidateScope`, `postCampaignCreateFromPlan` (use apiPOST; credentials + auth unchanged). |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/missionStore.ts` | `MissionArtifacts`: add `planId`, `validationId`, `campaignId`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/stepHandlers.ts` | Campaign validate-context → POST validate-scope (missionId, objective, timeWindow 2w, channels); persist planId/validationId; if blocked fail step. Execute-tasks → POST create-from-plan (planId, title, generateCreatives, schedule 2w); persist campaignId. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/PhaseOutputs.tsx` | 404 → “No outputs yet. Run the mission to generate outputs.” + optional Debug expandable (status code). |

**Manual acceptance tests:**

- [ ] **A)** Create mission “plan and run 2 week promotion campaign…”, click Confirm & Run.
- [ ] **B)** After Step 1 (validate) completes, GET /api/campaign/plan?missionId=... returns 200 with plan + validation.
- [ ] **C)** After Step 2 (execute) completes, GET /api/campaign/by-mission?missionId=... returns 200 with campaign (schedules, deployments, offer, creatives).
- [ ] **D)** PhaseOutputs shows Validation and Created outputs instead of 404.
- [ ] **E)** Unauthenticated request to GET /plan or GET /by-mission returns 401 (not 404).
