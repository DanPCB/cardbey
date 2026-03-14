# Campaign missionId persist – files changed & QA

## Summary

Ensure `missionId` is persisted on CampaignPlan (validate-scope) and CampaignV2 (create-from-plan) so GET /plan and GET /by-mission return 200 after a mission run. Confirmed missionId is already included in create/update data; added dev-only logs to verify stored values and to debug 404s (query inputs + plan count by tenant when not found).

## Files changed (campaignRoutes.js only)

| Location | Change |
|----------|--------|
| **POST /validate-scope** | missionId was already in `planPayload` (`missionId: missionId ?? undefined`) and used in both update and create. No data change. Added **dev-only** log after plan save: `[Campaign] validate-scope saved plan { planId, tenantKey, missionIdStored, status }`. |
| **POST /create-from-plan** | CampaignV2 create already uses `missionId: plan.missionId ?? undefined`. No data change. Added **dev-only** log after transaction: `[Campaign] create-from-plan saved campaign { campaignId, tenantKey, missionIdStored, planId }`. |
| **GET /plan** | Added **dev-only** log of query inputs: `[Campaign] GET /plan query { tenantKey, missionId }` (truncated). When no plan found, **dev-only** log: `[Campaign] GET /plan no plan found { tenantKey, missionId, planCountForTenant }` to detect tenant/missionId mismatch. |

All new logs are gated with `process.env.NODE_ENV !== 'production'`.

## Verification (no code change)

- **validate-scope:** `planPayload` includes `missionId: missionId ?? undefined`; same payload used for both `update` and `create`. Step handler sends `missionId: mission.id`.
- **create-from-plan:** Plan is loaded with `missionId` in select; `tx.campaignV2.create` uses `missionId: plan.missionId ?? undefined`.

If GET still returns 404, use the new logs: `missionIdStored` on validate-scope and create-from-plan should match the `missionId` used in GET /plan. If `missionIdStored` is null, the client did not send missionId (or plan had null). If `planCountForTenant` > 0 but no plan for this missionId, plans exist under that tenant with a different missionId (e.g. client sending wrong id).

## Manual QA steps

1. **Restart core server** so it loads the updated routes.
2. **Run a campaign mission** (validate-context → create campaign) with a single mission from the console.
3. **Check server logs (dev):**
   - After validate-scope: `[Campaign] validate-scope saved plan` with `missionIdStored` equal to the mission id (e.g. `mission-...`). If `missionIdStored` is null, the request body did not include missionId.
   - After create-from-plan: `[Campaign] create-from-plan saved campaign` with `missionIdStored` set.
4. **GET /plan:** Call `GET /api/campaign/plan?missionId=<same-mission-id>` with the same mission id. Expect **200** with `plan` and `validation`. Logs: `[Campaign] GET /plan query` then success. If 404, check `[Campaign] GET /plan no plan found` and `planCountForTenant` (if > 0, tenant has plans but none for this missionId).
5. **GET /by-mission:** Call `GET /api/campaign/by-mission?missionId=<same-mission-id>`. Expect **200** with `campaign` (schedules, creatives, offer, deployments).
6. **PhaseOutputs:** In the mission detail UI, PhaseOutputs should show validation and created outputs, not “No outputs yet”.
