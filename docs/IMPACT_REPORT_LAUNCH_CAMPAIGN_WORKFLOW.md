# Impact Report: Mission “Launch campaign” — Deterministic Workflow with Real Outcomes

**Date:** 2026-03-02  
**Scope:** Convert “Mission: Launch campaign” (Validate scope → Create campaign → Campaign report) from mostly-text steps into a deterministic, observable workflow with real DB rows, OrchestratorTasks, AuditEvents, and phase-by-phase outcome UI. No changes to /api/draft-store/*; no new UI pages; only enhance mission page panels.

---

## ⚠️ WARN FIRST — Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Schema and API creep** | New models (CampaignDraft, ValidationResult, CreativeAsset, Schedule, Offer, ChannelDeployment, TrackingLink, CampaignReport) and endpoints could conflict with existing Campaign/OrchestratorTask usage or require migrations that affect other features. | Additive only: new tables or new columns with defaults; no alter/delete of existing columns used by draft-store, preview, or publishing. Reuse kernel transitions for OrchestratorTask; do not write task status directly. |
| **Draft-store / preview / publishing** | Any shared types or services (e.g. storeId, draftId, Business, DraftStore) used in the new flow could change behavior. | Do not touch /api/draft-store/generate, /api/draft-store/commit, or preview/publish paths. Campaign flow uses storeId/draftStoreId as input only; no mutation of draft generation or commit logic. |
| **Image mapping** | Campaign creatives or asset generation might touch the same image/Media pipelines as store or promo. | Scope creative generation to new Campaign/CreativeAsset (or Media) rows only; do not change existing itemImageMapping, ops rebind, or draft preview image logic. |
| **Auth** | New endpoints (e.g. validate-scope, create-campaign, campaign-report) must enforce same auth as mission/agent (requireAuth, mission ownership). | All new routes use requireAuth; mission/campaign access checked by tenantId or createdByUserId; admin-only “View Audit Trail” behind requireAdmin. |
| **Mission page UI** | Adding Validation/Created/Report subpanels and links could break existing Execution drawer or plan display. | Minimal additions only: extend existing Execution panel with phase-specific output blocks; no redesign of global layout or navigation. |
| **OrchestratorTask lifecycle** | Creating many tasks (campaign.create, creative.generate, schedule.create, channel.deploy, campaign.monitor.performance) must not conflict with existing task types (e.g. llm_generate_copy, marketing_agent_test). | Use distinct entryPoint values; use transitionOrchestratorTaskStatus for all status changes; ensure worker/job runner only runs known entry points. |

---

## Current state vs. deliverable (gap analysis)

### Backend — What exists today

- **Campaign:** Used in `scripts/marketing-agent-test-flow.js`: `prisma.campaign.create` with `title`, `productId`, `data` (JSON), `status` (DRAFT/SCHEDULED/RUNNING). No structured CampaignDraft, ValidationResult, CreativeAsset, Schedule, Offer, ChannelDeployment, TrackingLink, or CampaignReport in that script.
- **OrchestratorTask:** Created with `entryPoint: 'marketing_agent_test'`; status transitions via `transitionOrchestratorTaskStatus` (queued → running → completed); AuditEvent created by transition service.
- **AuditEvent:** Created for Campaign status_transition (DRAFT, SCHEDULED, RUNNING) and for OrchestratorTask transitions.
- **LoyaltyProgram:** Created in test script; not part of the requested Phase 1/2/3 checklist but may be reused for “Offer” (loyalty).

**Not present (or not verified in codebase):**

- **CampaignDraft / PlanProposal** as a stored record with structured fields (objective, target product/service, time window, budget, channels).
- **ValidationResult** record: `{ checks[], blockers[], warnings[], risk }`.
- **CreativeCopy / CreativeAsset / MediaAsset** for 3+ captions, image prompts, generated images.
- **Offer** row (discount/loyalty) linked to Campaign.
- **Schedule** rows (time, channel, creative reference, status).
- **ChannelDeployment** rows per channel.
- **TrackingLink** rows with UTM.
- **CampaignReport** row (summary, links, schedule list, assets list, recommendations).
- **Phase 1 API:** Validate scope with hard validations (store publishable, products with images, payment/channel prerequisites), feasibility estimate, write CampaignDraft + ValidationResult + AuditEvent `campaign_plan_validated`, gating on blockers.
- **Phase 2 API:** Create Campaign + ChannelDeployments, creatives (CreativeCopy/CreativeAsset), Offer, Schedule, OrchestratorTasks (campaign.create, creative.generate, schedule.create, channel.deploy), status draft → scheduled/running, AuditEvents (campaign_created, creative_generated, schedule_created).
- **Phase 3 API:** CampaignReport, TrackingLinks, campaign.monitor.performance task(s), AuditEvent campaign_report_created.

### Frontend — What exists (from Phase 4 docs)

- **Plan types:** `planGenerator` has type `campaign` with steps validate → execute → report (and dependsOn).
- **Execution:** `dagExecutor` runs steps in order; `missionStore` holds `execution` (nodeStatus per step) and `report`.
- **ExecutionDrawer:** Shows step list (pending/running/completed), status pill, “View report” when completed.
- **No phase-specific output panels** today: no “Validation” subpanel (checks/blockers/risk), no “Created” subpanel (campaign link, assets, schedule table), no “Report” subpanel (summary, links, monitor tasks), no “View Audit Trail” / “View Tasks” links.

---

## Deliverable A — Phase-by-phase outcome checklist (verification targets)

| Phase | Required outcomes | Current status |
|-------|-------------------|----------------|
| **Phase 1: Validate scope** | Inputs (storeId/draftStoreId, objective, target product/service, time window, budget, channels) → System checks (store publishable, products with images, payment/channel prerequisites) → Feasibility (reach estimate, risk) → CampaignDraft/PlanProposal + ValidationResult saved → AuditEvent `campaign_plan_validated` → If blockers, stop and UI “Fix inputs”. | **Not implemented.** No CampaignDraft/ValidationResult models or validate-scope API. |
| **Phase 2: Create campaign** | Campaign row (draft/scheduled) + ChannelDeployments → CreativeCopy (3+ captions) + image prompts + optional MediaAsset → Offer row linked to Campaign → Schedule rows + scheduler jobs → OrchestratorTasks (campaign.create, creative.generate, schedule.create, channel.deploy) with status lifecycle + AuditEvents → Campaign draft → scheduled/running; on failure failed/needs_attention → Return campaignId, asset IDs, schedule summary, deployment links, audit trail. | **Partially present.** Campaign exists (minimal); no CreativeAsset/Schedule/Offer/ChannelDeployment as first-class rows; no phase-2 API or task types. |
| **Phase 3: Campaign report** | CampaignReport row (summary, links, schedule list, assets list, recommendations) → TrackingLink rows (UTM) → Optional campaign.monitor.performance task(s) → Report view + Monitor section. | **Not implemented.** No CampaignReport, TrackingLink, or report API. |

---

## Deliverable B — UI surfaces (where to show outcomes)

| Surface | Requirement | Current status |
|---------|-------------|----------------|
| Mission page Execution panel | Per-phase: Status (pending/running/completed/failed), Output summary (count + key IDs), Links to created objects, Errors with reason codes. | ExecutionDrawer shows step status and report; no per-phase output summary or links. |
| Phase 1 output | “Validation” subpanel: checks list (pass/fail), blockers with required actions, risk + confidence. If blockers: “Fix inputs” CTA → small form/modal. | **Missing.** |
| Phase 2 output | “Created” subpanel: Campaign link, Assets (preview thumbnails + links), Schedule table (channel, time, creative), Deployments links. | **Missing.** |
| Phase 3 output | “Report” subpanel: Summary, Links (storefront, UTMs, QR), Schedule recap, Monitor tasks status. | **Missing.** Report section exists but not structured for campaign links/schedule/monitor. |
| Cross-cutting | “View Audit Trail” (admin) → load AuditEvents for campaign + tasks; “View Tasks” → load OrchestratorTasks for mission/campaign. | **Missing.** |

---

## Deliverable C — Instrumentation and acceptance

- **Logging:** correlationId = missionId + runId; log each OrchestratorTask creation and completion. (Partially present in transition service / test script; extend to new tasks.)
- **Manual QA:** Minimal inputs → Phase 1 pass, Phase 2 creates campaign+assets+schedule, Phase 3 creates report; missing OAuth → Phase 1 warns, Phase 2 “scheduled posts only”; creative failure → Phase 2 error, Campaign failed/needs_attention, no report.
- **Audit:** campaign_plan_validated, campaign_created, creative_generated/uploaded, schedule_created, campaign_report_created. (campaign_created and status transitions exist in test script; others to add.)

---

## Recommended approach (minimal diffs, no breakage)

1. **Do not implement the full deliverable in one change.** It requires new schema (or significant JSON shape), multiple new APIs, and UI changes. One large PR would be high risk for existing workflows.
2. **Phase the work:**
   - **Phase A (schema + Phase 1 backend):** Add or extend models (e.g. CampaignDraft or reuse Campaign with a “scope” JSON; ValidationResult or equivalent). Add single “validate campaign scope” API (POST or GET with params); hard validations (store, products, channels); write ValidationResult + AuditEvent `campaign_plan_validated`; return blockers. No UI yet.
   - **Phase B (Phase 2 backend):** Add Schedule, CreativeCopy/CreativeAsset (or Media), Offer, ChannelDeployment as needed; add “create campaign” API that creates Campaign + related rows + OrchestratorTasks; use kernel transitions; AuditEvents for campaign_created, creative_generated, schedule_created. No change to draft-store or preview.
   - **Phase C (Phase 3 backend):** CampaignReport, TrackingLink; “campaign report” API; optional monitor task. AuditEvent campaign_report_created.
   - **Phase D (UI only):** Extend ExecutionDrawer (or mission detail) with phase-specific blocks: Validation subpanel (from Phase 1 response), Created subpanel (from Phase 2 response), Report subpanel (from Phase 3 response); “View Audit Trail” / “View Tasks” links (admin / user). No new pages.
3. **Keep existing flows unchanged:** /api/draft-store/*, preview, publishing, image mapping, auth middleware untouched. Mission “Launch campaign” becomes one plan type that, when executed, calls the new APIs in order (validate → create → report) and displays results in the new subpanels.

---

## Constraints compliance

- **Keep existing /api/draft-store/* flows unchanged.** ✓ Impact report only; no code change to draft-store.
- **Do not add new UI pages; only enhance mission page panels.** ✓ Deliverable B specifies subpanels inside existing Execution/phase areas.
- **Do not expose system health or infra diagnostics to normal users.** ✓ “View Audit Trail” admin-only.
- **Use kernel transitions where applicable.** ✓ All OrchestratorTask status changes via transitionOrchestratorTaskStatus; no direct status writes.

---

## Next steps (after approval)

1. Confirm Prisma schema location and current Campaign (and related) model definitions.
2. Implement Phase A (validate-scope API + ValidationResult + audit) behind a feature flag or route that is not yet wired from the mission executor.
3. Add Phase 1 output to mission Execution panel (Validation subpanel) when Phase 1 API is called and response is stored in mission.report or mission.context.
4. Proceed to Phase B/C/D in order, with the same “assess then minimal diff” rule for each.
