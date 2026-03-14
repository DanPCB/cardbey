# Impact Report: Phase B — Create Campaign from Plan

**Date:** 2026-03-02  
**Scope:** Additive schema (CampaignV2, CreativeCopy, CreativeAsset, CampaignScheduleItem, Offer, ChannelDeployment); POST /api/campaign/create-from-plan; OrchestratorTasks for phase-2 execution; read endpoints. No Phase C/D; no UI; no draft-store/auth/missions changes.

---

## Risks and mitigations

| Risk | Mitigation |
|------|-------------|
| **Schema creep** | Additive only: new tables; existing Campaign, DraftStore, Store, Product, Media untouched. |
| **OrchestratorTask entry points** | New entry points (campaign.create, creative.generate, schedule.create, channel.deploy) only; no change to existing entry points or workers. All status changes via transitionOrchestratorTaskStatus. |
| **Draft-store / preview / publish** | No code in /api/draft-store/* or store preview/publish; campaign uses storeId/draftStoreId as input only. |
| **Auth** | requireAuth; tenantKey from getTenantId(req.user); plan.tenantKey must match. |
| **Mission/agent chat** | No changes to agent-messages or mission routes; campaign routes are separate. |

---

## Part 1 — Current state (verified)

- **Campaign (existing):** id, title, productId, data (Json), status (DRAFT/SCHEDULED/RUNNING/DONE), workflowId. No tenant/store keys; used by marketing-agent-test-flow script. **Left unchanged.**
- **CampaignPlan / CampaignValidationResult (Phase A):** tenantKey, planId, validation with checks/blockers/warnings. Used by validate-scope and GET /plan.
- **OrchestratorTask:** id, entryPoint, tenantId, userId, insightId, status (queued|running|completed|failed), request (Json), result (Json). Created via prisma.orchestratorTask.create({ status: 'queued', ... }). Status changes only via **transitionOrchestratorTaskStatus** (kernel); each transition writes AuditEvent.
- **transitionRules:** queued→running, running→completed, running→failed, queued→failed, queued→completed allowed.

Phase B creates new OrchestratorTask rows with entryPoint in { campaign.create, creative.generate, schedule.create, channel.deploy } and uses transitionOrchestratorTaskStatus for any status change.

---

## Bugfix: degradedFromPlan not defined (create-from-plan B.3)

**Issue:** POST /api/campaign/create-from-plan threw `ReferenceError: degradedFromPlan is not defined` in the B.3 block (offer + channel deployments). The variable was used but never declared.

**Change (bugfix only):** In `campaignRoutes.js`: (1) Define `degradedFromPlan = latestValidation?.degradedMode ?? plan?.degradedMode ?? degradedMode ?? null` in the same scope as `degradedMode`. (2) B.3 allowedChannels: null-safe use of `degradedFromPlan?.allowedChannels`; if degradedFromPlan exists but allowedChannels is empty, default to `['scheduled_posts']`. (3) Other usages already null-safe (`degradedFromPlan?.reasonCodes`, `!!degradedFromPlan`). No change to response shape, scheduling, creatives, offer, or deployments logic.
