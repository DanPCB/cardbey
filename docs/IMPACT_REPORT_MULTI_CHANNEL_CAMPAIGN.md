# Impact Report: Multi-Channel Configuration for Campaign Mission

## Goal
Allow multi-channel configuration before campaign execution: channel selector in plan stage, store in mission artifacts, pass to create-from-plan, duplicate schedule entries per channel, show "X channel(s) configured" in report.

## Verification (no breaking changes)

### 1. Campaign schedule data structure
- **Current:** `CampaignScheduleItem` has `(tenantKey, campaignId, channel, scheduledAt, status)`. Create-from-plan creates one row per time slot with `channel = 'scheduled_posts'`.
- **Change:** Create one row per (time, channel) — same schema, no new fields. Loop: for each `scheduledAt` and each selected channel, insert one `CampaignScheduleItem`. So 8 times × N channels = 8×N rows.
- **Impact:** No breaking change. Existing campaigns and readers (scheduleCount, scheduleRange) remain valid; new campaigns simply get more rows.

### 2. Job runner / orchestration
- **Current:** create-from-plan runs in request handler; `transitionOrchestratorTaskStatus` for campaign.create, schedule.create, channel.deploy unchanged.
- **Change:** No changes to `transitionService.js`, task status transitions, or job runner. Only the **input** to create-from-plan (body.channels) and the **number of schedule rows** created.
- **Impact:** None. Orchestration logic untouched.

### 3. Schedule engine
- **Current:** Schedule items are created in create-from-plan; no separate "schedule engine" that processes one channel.
- **Change:** Simple clone logic inside create-from-plan: same `scheduledAt`, different `channel` per selected channel.
- **Impact:** None. No schedule engine code changed.

### 4. Store mission
- No code paths for store missions are modified. Store mission unaffected.

## Smallest safe patch
- **Backend:** In create-from-plan, derive `channelsForSchedule` from `body.channels ?? plan.channelsRequested ?? ['scheduled_posts']`, normalize to allow list (add `website_banner`). In the transaction, replace the single-channel loop with a nested loop: for each `scheduledAt`, for each channel in `channelsForSchedule`, create one `CampaignScheduleItem`. Phase B.3 (ChannelDeployments) already uses `body.channels`/`plan.channelsRequested` — no change.
- **Dashboard:** Add `channels?: string[]` to `MissionArtifacts`. In validate-scope payload and create-from-plan payload, send `mission.artifacts?.channels ?? ['scheduled_posts']`. Add channel selector UI in campaign plan stage; persist selection to `mission.artifacts.channels`. Report: backend already appends "X channel(s) configured" to summary when deploymentCount > 0; dashboard shows count in report section via `mission.artifacts.channels?.length ?? 1`. **Rendering:** Render `CampaignChannelSelector` in the campaign mission plan stage (e.g. above steps or in plan step output). Render `CampaignReportCreativeReview` where campaign report is shown; it now displays "X channel(s) configured".

## Acceptance
- Campaign still runs (default channels = ['scheduled_posts'] when none selected).
- 8 schedules become 8 × channel count (clone per channel).
- Store mission unaffected.
