# Phase B.1: Create campaign from plan (Schedule + tasks only) — QA checklist

**Scope:** POST /api/campaign/create-from-plan creates CampaignV2 + 2 CampaignScheduleItem + OrchestratorTasks (campaign.create, schedule.create; optional creative.generate; channel.deploy) + AuditEvents. Phase B.3 adds Offer + ChannelDeployment rows and channel.deploy task. No schema changes (CampaignV2, CampaignScheduleItem, Offer, ChannelDeployment already exist).

**B.1 improvements:** (1) Task lifecycle: queued → running → completed (both transitions in same request). (2) CampaignV2.status set after tasks: SCHEDULED if both tasks completed, FAILED otherwise. (3) Default schedule uses plan.timeWindow.tz when present; else UTC with scheduleDefaultTz in schedule_created metadata; TODO for user timezone when available.

---

## Files changed

| File | Change |
|------|--------|
| `src/routes/campaignRoutes.js` | B.1 as above; B.2: optional 3 CreativeCopy + 1 CreativeAsset (template), creative.generate task, creative_created AuditEvent; B.3: Offer + ChannelDeployment rows, channel.deploy task (queued→running→completed), offer_created + deployments_created AuditEvents; response extended with `creatives` (B.2), `deployments` and `offer` (B.3) |
| `docs/IMPACT_REPORT_PHASE_B1.md` | Impact note (no draft-store/preview/publish/image/auth changes) |
| `docs/IMPACT_REPORT_PHASE_B2.md` | Phase B.2 impact (additive creatives; no change to B.1 or Phase A) |
| `docs/PHASE_B1_QA_CHECKLIST.md` | This file (includes Phase B.2 and B.3 QA sections) |

**Not changed:** Prisma schema, draft-store, preview, publishing, image resolution, auth. All OrchestratorTask status changes go through transitionOrchestratorTaskStatus.

---

## Example curl

**1) Validate-scope (Phase A) — get a validated plan**

```bash
curl -s -X POST http://localhost:3001/api/campaign/validate-scope \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{"objective":"Summer sale","missionId":"m1"}'
```

Use returned `planId` when `status` is `validated` and `blockers` is empty.

**2) Create-from-plan — success (Phase B.1)**

```bash
curl -s -X POST http://localhost:3001/api/campaign/create-from-plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{"planId":"PLAN_ID","title":"Summer campaign"}'
```

Expected: 200, `campaignId`, `status: "SCHEDULED"`, `schedules` (length 2), `tasks` (campaign.create, schedule.create, optional creative.generate, channel.deploy), `deployments`, `offer`, and when B.2 enabled: `creatives: { copies, assets }`.

**Example response snippet (Phase B.1 + B.2):**
```json
{
  "ok": true,
  "campaignId": "clxx...",
  "status": "SCHEDULED",
  "schedules": [
    { "id": "...", "scheduledAt": "2026-03-08T09:00:00.000Z", "status": "SCHEDULED" },
    { "id": "...", "scheduledAt": "2026-03-09T09:00:00.000Z", "status": "SCHEDULED" }
  ],
  "tasks": [
    { "id": "...", "type": "campaign.create", "status": "completed" },
    { "id": "...", "type": "schedule.create", "status": "completed" },
    { "id": "...", "type": "creative.generate", "status": "completed" },
    { "id": "...", "type": "channel.deploy", "status": "completed" }
  ],
  "deployments": [
    { "id": "...", "channel": "scheduled_posts", "mode": "scheduled_posts", "status": "ACTIVE" }
  ],
  "offer": {
    "id": "...",
    "type": "discount",
    "status": "ACTIVE",
    "data": { "value": "10%", "appliesTo": "all", "validFrom": "...", "validTo": "..." }
  },
  "creatives": {
    "copies": [
      { "id": "...", "text": "This weekend only! Enjoy Summer sale — your favorites." },
      { "id": "...", "text": "Summer sale. Don't miss out on your favorites." },
      { "id": "...", "text": "Limited time: Summer sale. Shop your favorites now." }
    ],
    "assets": [
      { "id": "...", "type": "image_prompt", "prompt": "Promotional image for Summer sale, featuring products, clean and inviting mood." }
    ]
  }
}
```

**3) Optional: custom schedule times (ISO)**

When `schedule.times` is provided, the backend creates one CampaignScheduleItem per time (min 2, max 14). No truncation.

```bash
curl -s -X POST http://localhost:3001/api/campaign/create-from-plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{"planId":"PLAN_ID","schedule":{"times":["2026-03-08T09:00:00Z","2026-03-09T09:00:00Z"]}}'
```

**4) Two-week campaign (8 times)**

When the Mission Console runs the create-campaign step, it sends 8 times from `twoWeekScheduleTimes()` (Tue/Thu/Sat/Sun at 09:00 UTC over ~14 days). Expected: **8** CampaignScheduleItem rows; `schedules` array length 8; schedule recap in Phase C report shows count 8 and date range spanning ~14 days.

- Backend: `schedule.times` with 8 valid ISO strings → 8 schedule rows created (no slice to 2).
- Caps: fewer than 2 valid times → 400 `invalid_schedule`; more than 14 → only first 14 used.

**5) Plan with blockers → 409**

Call create-from-plan with a plan that has not been validated or has blockers. Expected: 409, `error: "plan_not_validated"`, `reasonCodes` present.

**6) No auth → 401**

Omit `Authorization` header. Expected: 401.

**7) Wrong tenant → 404/403**

Use a planId that belongs to another tenant. Expected: 404 or 403.

---

## QA checklist

- [ ] **1. Validate-scope with blockers:** create-from-plan returns 409 and reasonCodes.
- [ ] **2. Validated plan:** create-from-plan returns 200; CampaignV2 row exists with status SCHEDULED; CampaignScheduleItem rows = length of `schedule.times` (default 2 when no times sent; 8 when Mission Console sends intent-derived schedule); channel scheduled_posts, status SCHEDULED; OrchestratorTask rows (campaign.create, schedule.create, …) and both transitioned via kernel to completed; AuditEvents campaign_created and schedule_created (metadata includes count: schedule item count).
- [ ] **3. 401 without auth.**
- [ ] **4. Tenant mismatch:** 404 or 403 for plan not owned by current tenant.
- [ ] **5. Default schedule:** With no schedule.times, 2 items use next Saturday 09:00 and Sunday 09:00 (UTC for now; plan.timeWindow.tz passed to defaultScheduleTimes; schedule_created metadata includes scheduleDefaultTz).
- [ ] **5b. Two-week campaign (Mission Console):** Run create-campaign step from Mission Console; schedule engine infers from intent (e.g. "2 week promotion") and sends 8 times. Expect **8** schedule rows; Create campaign PhaseOutputs shows “8 schedules” (or equivalent); list of scheduledAt dates spans ~14 days (Tue/Thu/Sat/Sun at 09:00 UTC). Schedule recap in Phase C report: count 8, firstAt/lastAt range ~14 days.
- [ ] **5c. Schedule engine (intent-based):** Mission text drives schedule.times via parseScheduleIntent + deriveScheduleParams + generateScheduleTimes. Explicit schedule.times in request body still respected (2–14). Backend caps: min 2, max 14.
- [ ] **6. B.1-only (generateCreatives=false):** No CreativeCopy, CreativeAsset, or creative.generate task; Offer, ChannelDeployment, and channel.deploy task are still created (Phase B.3).
- [ ] **7. Task lifecycle:** Each task goes queued → running → completed (AuditEvents for both transitions).
- [ ] **8. Campaign status from tasks:** If both tasks complete, CampaignV2.status = SCHEDULED; if either fails, CampaignV2.status = FAILED.

---

## Phase B.2 — Creatives (template only)

- [ ] **B.2.1** Validated plan → create-from-plan: CampaignV2 exists, 2 schedules exist, **3 CreativeCopy** (kind=caption), **1 CreativeAsset** (type=image_prompt), **3 tasks** (campaign.create, schedule.create, creative.generate), AuditEvents include **creative_created** (metadata copyCount: 3, assetCount: 1).
- [ ] **B.2.2** Scheduling unchanged: same transaction and same two schedule items; campaign status still from campaign.create + schedule.create only.
- [ ] **B.2.3** Response includes **creatives: { copies: [{ id, text }], assets: [{ id, type, prompt }] }** when generateCreatives !== false and creative step succeeds.
- [ ] **B.2.4** Tenant scoping: CreativeCopy and CreativeAsset have tenantKey = current tenant; plan must match tenant (409/403 unchanged).
- [ ] **B.2.5** Plan with blockers → 409 unchanged.
- [ ] **B.2.6** Body `generateCreatives: false` → no CreativeCopy/Asset created, no creative.generate task, response has no `creatives` key; B.3 (offer, deployments, channel.deploy) still runs.

---

## Phase B.3 — Offer + ChannelDeployments + channel.deploy

- [ ] **B.3.1** create-from-plan → **Offer** row created and linked to campaign (campaignId); response includes `offer: { id, type, status, data }`.
- [ ] **B.3.2** **ChannelDeployment** rows created for each allowed channel; response includes `deployments: [{ id, channel, mode, status }]`. Default channel when none requested: `scheduled_posts`.
- [ ] **B.3.3** If plan validation had **degradedMode** (e.g. allowedChannels from validation): deployments use mode `scheduled_posts` and deployment `data` includes `reasonCodes` when present.
- [ ] **B.3.4** **channel.deploy** OrchestratorTask exists and transitions queued → running → completed (via transitionOrchestratorTaskStatus); task request/result includes `mode: "scheduled_posts"` and `degraded: true` when degradedMode.
- [ ] **B.3.5** **AuditEvents** exist: `offer_created` (metadata: type, appliesTo), `deployments_created` (metadata: count, channels).
- [ ] **B.3.6** **generateCreatives=false** still works and does not block B.3: offer and deployments are created regardless; response has no `creatives` key but has `deployments` and `offer`.

**Example response snippet (B.3 additive):**
```json
{
  "deployments": [
    { "id": "dep_cuid_1", "channel": "scheduled_posts", "mode": "scheduled_posts", "status": "ACTIVE" }
  ],
  "offer": {
    "id": "off_cuid_1",
    "type": "discount",
    "status": "ACTIVE",
    "data": { "value": "10%", "appliesTo": "all", "validFrom": "2026-03-02T00:00:00.000Z", "validTo": "2026-04-01T00:00:00.000Z" }
  }
}
```

---

## Schedule engine scenarios (Mission Console)

Rule-based intent parsing (no LLM) + deterministic generation. Mission prompt/title + plan objective are used.

| Scenario | Example prompt / intent | Expected schedule count | Notes |
|----------|------------------------|-------------------------|-------|
| 2-week campaign | "run 2 week promotion campaign …" / "plan and schedule 2 week …" | **8** | windowDays=14, default count 8, weekdays Tue/Thu/Sat/Sun. |
| Daily for 2 weeks | "schedule daily for 2 weeks" | **14** | perDay=1, windowDays=14, cap 14. |
| 3 per week, 2 weeks | "3 posts per week for 2 weeks" | **6** | perWeek=3, 2 weeks. |
| Weekends only, 2 weeks | "weekends only for 2 weeks" | **4** | weekdays [Sat, Sun] only; 4 weekend days in 14 days. |
| Explicit times | API sends `schedule.times` with 5 ISO strings | **5** | Backend uses all provided (min 2, max 14). |

- [ ] **Screenshot checklist:** Create campaign outputs show expected schedule count and date range for each scenario above.

---

## Prisma

No new migration for B.1. Existing Phase B schema (CampaignV2, CampaignScheduleItem) is used. SQLite: `npm run db:push` if needed. Postgres: existing migration already applied.
