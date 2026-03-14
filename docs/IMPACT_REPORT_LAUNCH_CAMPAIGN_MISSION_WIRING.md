# Impact Report: Launch campaign mission wiring (Phase A/B + PhaseOutputs)

**Date:** 2026-03-02  
**Scope:** Wire mission step handlers for campaign type to call POST validate-scope and POST create-from-plan with missionId; persist planId/campaignId in mission artifacts; improve PhaseOutputs 404 UX; verify auth on campaign GETs.

---

## 1. What could break

| Area | Risk | Why |
|------|------|-----|
| Mission execution DAG | Low | Only adding handlers for plan.type === 'campaign'; store handlers unchanged. Handler runs before step marked completed; if API fails, step fails (same as store). |
| Campaign APIs | Low | New callers (dashboard step handlers) use same auth as PhaseOutputs. No change to validate-scope or create-from-plan contract. |
| Auth/session | Low | Dashboard already uses apiPOST/apiGET with credentials and buildAuthHeader. If user not logged in, 401 and step fails. |
| Draft-store | None | No draft-store changes. |

---

## 2. Why green steps didn’t imply persisted outputs

Previously, **campaign** missions had **no step handlers**: `runStepHandler` only handled `plan.type === 'store'`. For campaign, it always returned `{ ok: true }` without calling any backend. So the DAG marked validate-context and execute-tasks as completed after the delay, but **no CampaignPlan or CampaignV2 was ever created** with that missionId. PhaseOutputs then called GET plan?missionId= and GET by-mission?missionId= and got **404** because no rows existed. Step status was “green” from the executor only; it did not reflect real Phase A/B persistence.

---

## 3. Mitigations

- **Auth:** Campaign GETs already use requireAuth (401 when unauthenticated). Dashboard request() uses credentials: 'include' and buildAuthHeader(). Server log added to confirm req.user on GET /plan and GET /by-mission.
- **Handlers:** Campaign validate step calls POST validate-scope with missionId; execute step calls POST create-from-plan with planId from artifacts. On blocked validation, step fails and blockers surface; no create-from-plan call.
- **404 UX:** PhaseOutputs shows “No outputs yet. Run the mission to generate outputs.” for 404; optional debug line for admins with status code.

---

## 4. Smallest safe patch

- Add POST validate-scope and POST create-from-plan wrappers in dashboard api.ts (use existing apiPOST; no new credentials logic).
- Extend MissionArtifacts with planId?, validationId?, campaignId?.
- In stepHandlers: for plan.type === 'campaign' and validate-context, call validate-scope; persist planId/validationId; if blocked return ok: false. For execute-tasks, call create-from-plan with mission.artifacts.planId; persist campaignId.
- Server: one-line log in GET /plan and GET /by-mission (req.user ? 'authenticated' : 'anon').
- PhaseOutputs: on 404, show friendly message and optional debug expandable.
