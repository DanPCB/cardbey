# Phase B: Create campaign from plan — QA checklist

**Date:** 2026-03-02  
**Scope:** Phase B only. Additive schema (CampaignV2, CreativeCopy, CreativeAsset, CampaignScheduleItem, Offer, ChannelDeployment); POST /api/campaign/create-from-plan; GET /api/campaign/:campaignId and GET /api/campaign/by-plan/:planId. No Phase C/D; no UI; no draft-store changes.

---

## Files changed

| File | Change |
|------|--------|
| `prisma/sqlite/schema.prisma` | CampaignPlan + campaignV2s relation; CampaignV2, CreativeCopy, CreativeAsset, CampaignScheduleItem, Offer, ChannelDeployment (additive) |
| `prisma/postgres/schema.prisma` | Same additive models |
| `prisma/postgres/migrations/20260302120000_phase_b_campaign_v2/migration.sql` | New Postgres migration |
| `src/routes/campaignRoutes.js` | transitionOrchestratorTaskStatus import; defaultScheduleTimes(); POST /create-from-plan; GET /by-plan/:planId; GET /:campaignId |
| `docs/IMPACT_REPORT_PHASE_B_CREATE_CAMPAIGN.md` | Impact report (Part 1) |
| `docs/PHASE_B_QA_CHECKLIST.md` | This file |

**Not changed:** Existing Campaign, DraftStore, Store, Product, Media, /api/draft-store/*, auth, missions/agent chat. All OrchestratorTask status changes go through transitionOrchestratorTaskStatus.

---

## Prisma

- **SQLite:** `npm run db:push` (or `DATABASE_URL="file:.../prisma/dev.db" npx prisma db push --schema prisma/sqlite/schema.prisma`).
- **Postgres:** `npx prisma migrate deploy --schema prisma/postgres/schema.prisma`.

---

## Example curl

**1) Create validated plan (Phase A) — required before create-from-plan**

```bash
curl -s -X POST http://localhost:3001/api/campaign/validate-scope \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{"objective":"Summer sale","missionId":"mission-1"}'
```

Save `planId` and `validationId` from the response. Plan must have `status: "validated"` and `blockers: []`.

**2) Create campaign from plan — success**

```bash
curl -s -X POST http://localhost:3001/api/campaign/create-from-plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{"planId":"PLAN_ID","title":"Summer campaign"}'
```

Expected: 200, `campaignId`, `planId`, `status: "DRAFT"`, `created.copies` (3), `created.assets` (1), `created.schedules` (2), `created.deployments`, `created.offerId`, `tasks` (4 entries: campaign.create, creative.generate, schedule.create, channel.deploy).

**3) Create from plan with blockers — 409**

First ensure the plan has blockers (e.g. call validate-scope with empty objective or invalid storeId). Then:

```bash
curl -s -X POST http://localhost:3001/api/campaign/create-from-plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{"planId":"PLAN_ID_WITH_BLOCKERS"}'
```

Expected: 409, `error: "plan_not_validated"`, `reasonCodes` array.

**4) GET campaign by id**

```bash
curl -s "http://localhost:3001/api/campaign/CAMPAIGN_ID" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN"
```

Expected: 200, `{ ok: true, campaign: { id, title, creativeCopies, creativeAssets, scheduleItems, channelDeployments, offer } }`. 404 if wrong tenant or missing.

**5) GET campaign by plan id**

```bash
curl -s "http://localhost:3001/api/campaign/by-plan/PLAN_ID" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN"
```

Expected: 200, same campaign shape (latest CampaignV2 for that plan). 404 if no campaign for plan or wrong tenant.

**6) Degraded mode (OAuth warning)**

Create a plan that returns `degradedMode` (e.g. validate-scope with `channels: ["instagram"]`). Then create-from-plan. Expected: CampaignV2 has `degradedMode`; ChannelDeployment rows have `mode: "scheduled_posts"`; schedules use `scheduled_posts`.

---

## QA checklist

- [ ] **1. Validated plan required:** With plan that has blockers or no validation, POST create-from-plan returns 409 and reasonCodes.
- [ ] **2. Create from validated plan:** Returns 200, campaignId, created (copies, assets, schedules, deployments, offerId), tasks (4). DB has CampaignV2, CreativeCopy (3), CreativeAsset (1), CampaignScheduleItem (2), Offer (1), ChannelDeployment rows; all tenantKey scoped.
- [ ] **3. OrchestratorTasks:** Four tasks created (campaign.create, creative.generate, schedule.create, channel.deploy); each transitioned to completed via transitionOrchestratorTaskStatus. AuditEvent rows exist for each transition (entityType OrchestratorTask, action status_transition).
- [ ] **4. AuditEvents:** campaign_created, schedule_created, creative_created, offer_created present (entityType CampaignV2 or Offer; no secrets in metadata).
- [ ] **5. Degraded mode:** When plan validation had OAUTH_NOT_CONNECTED warning, CampaignV2.degradedMode set; deployments.mode = scheduled_posts; schedules.channel = scheduled_posts.
- [ ] **6. GET /api/campaign/:campaignId:** 200 with campaign + copies/assets/scheduleItems/channelDeployments/offer; 401 without auth; 404 for wrong tenant.
- [ ] **7. GET /api/campaign/by-plan/:planId:** 200 with latest campaign for plan; 404 when no campaign for plan or wrong tenant.
- [ ] **8. No impact:** /api/draft-store/*, preview, publish, auth, missions unchanged.

---

## Rollback notes

- **Schema:** Phase B adds new tables only. Rollback = drop new tables (CampaignV2, CreativeCopy, CreativeAsset, CampaignScheduleItem, Offer, ChannelDeployment) and remove CampaignPlan.campaignV2s relation from schema; revert migration or run inverse migration.
- **API:** Remove POST /create-from-plan, GET /by-plan/:planId, GET /:campaignId from campaignRoutes.js; remove transitionOrchestratorTaskStatus import and defaultScheduleTimes. No changes to validate-scope or Phase A GET /plan, /plan/:planId, /validation/:validationId.
- **OrchestratorTask:** New entry points (campaign.create, creative.generate, schedule.create, channel.deploy) are only created by create-from-plan. No worker consumes them in Phase B. Rollback of route removes new task creation; existing tasks can remain or be ignored by workers.
