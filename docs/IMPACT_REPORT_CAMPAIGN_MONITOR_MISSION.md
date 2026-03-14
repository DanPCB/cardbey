# Impact Report: campaign_monitor Mission Type

## Goal
Add new mission type `campaign_monitor` with steps: Fetch campaign metrics, AI analyze performance, Recommend optimizations, Generate summary report. Button "Monitor performance" on completed campaign creates a separate monitor mission. No impact on original campaign.

## Verification (no breaking changes)

### 1. Mission type registry (planGenerator.ts)
- **Current:** `PlanType` = 'store' | 'campaign' | 'social' | 'cnet' | 'analytics' | 'recovery' | 'unknown'. `baseSteps(type)` switch; `classifyType(text)` never returns campaign_monitor.
- **Change:** Add `'campaign_monitor'` to `PlanType`. Add `case 'campaign_monitor':` in `baseSteps`, `objectiveFor`, `validationChecksFor`, `confidenceAndRisk`. Do **not** add campaign_monitor to `classifyType()` — this type is only created when user clicks "Monitor performance" (programmatic plan).
- **Impact:** Existing campaign (and all other) types unchanged. New type is additive.

### 2. stepHandlers.ts
- **Current:** Handlers for store (validate-context, execute-tasks, report) and campaign (same step ids). Fallback `return { ok: true }` when no handler.
- **Change:** Add branches for `plan.type === 'campaign_monitor'` and stepId in `fetch-metrics`, `analyze-performance`, `recommend-optimizations`, `performance-report`. Each handler: mock implementation (mock metrics if real unavailable), no API calls that mutate the original campaign. Use `mission.artifacts?.campaignId` as read-only reference.
- **Impact:** No change to existing campaign or store handlers. New branches only; state transitions follow same pattern (handler returns ok true/false, DAG marks step completed/failed).

### 3. Database schema
- **Current:** Console missions are client-only (missionStore.ts), persisted in localStorage. No backend mission table in scope.
- **Change:** None. Mission store already supports arbitrary plan types and artifacts. campaign_monitor missions stored like any other mission; artifacts.campaignId holds source campaign id (read-only reference).
- **Impact:** No schema change.

## UI
- **Monitor performance button:** `MonitorPerformanceButton` in `missions/MonitorPerformanceButton.tsx`. Renders when `mission.plan?.type === 'campaign'`, `mission.status === 'completed'`, and `mission.artifacts?.campaignId` is set. On click: `createMonitorMissionFromCampaign(mission)` then `onMonitorCreated(monitorMissionId)`. Parent should call `openDrawerForMission(id)` and optionally `startExecution(id)` so the user sees the new monitor mission and can run it.

## Acceptance
- Running monitor mission does not affect original campaign (read-only reference; mock handlers).
- Separate mission record created (createMission with plan.type campaign_monitor).
- State transitions follow existing doctrine (same DAG executor, same nodeStatus/events flow).
