# Impact Report: Phase B.1 — Create campaign from plan (Schedule + tasks only)

**Scope:** Minimal create-from-plan: CampaignV2 + 2 CampaignScheduleItem + 2 OrchestratorTasks (campaign.create, schedule.create) + AuditEvents. No creatives, offer, or deployments.

**Risks:**  
- **Draft-store / preview / publish / image / auth:** No changes. Campaign routes only; no touch to draft-store, image resolution, or auth.  
- **Breaking change:** Replacing full Phase B handler with B.1 reduces response shape (no `created.copies`, `created.assets`, `created.deployments`, `created.offerId`; only `campaignId`, `status`, `schedules`, `tasks`). Callers expecting full Phase B response must adapt.  

**Mitigations:** Additive schema already exists (CampaignV2, CampaignScheduleItem). Minimal diff: only the create-from-plan handler and response shape are changed.
