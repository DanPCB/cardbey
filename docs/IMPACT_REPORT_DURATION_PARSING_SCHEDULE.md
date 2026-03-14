# Impact Report: Natural Language Duration Parsing for Campaign Schedule

## Goal
Parse duration from mission objective ("2 months", "1 month", "3 weeks", date ranges); for duration >= 1 month spread posts evenly at 2 posts/week (totalPosts = weeks * 2); show campaign window and cadence in report.

## Verification (no breaking changes)

### 1. Existing campaign generation
- **Current:** scheduleEngine.parseScheduleIntent has windowDays 7, 14, 30; deriveScheduleParams defaults count by window (≤3→2, ≤7→4, ≤14→8, else 12 cap 14). stepHandlers sends times.slice(0, 14). Backend SCHEDULE_MAX = 14.
- **Change:** Add duration patterns (2 months→60d, 1 month→30d, 3 weeks→21d). When windowDays >= 30 and no explicit totalPosts/perWeek: use perWeek = 2, totalPosts = weeks * 2, cap by raised SCHEDULE_MAX (e.g. 30). **Short campaigns unchanged:** when no "X months/weeks" in text, existing windowDays and count logic preserved (14 days → 8 posts).
- **Impact:** No regression for prompts that don’t mention duration; only additive behavior when duration is parsed.

### 2. Recurring campaigns
- **Current:** No recurring-campaign logic found in campaign routes or schedule engine.
- **Change:** None. Duration parsing only affects the single schedule window and post count for create-from-plan.
- **Impact:** None.

### 3. Schedule persistence
- **Current:** Backend creates one CampaignScheduleItem per (time, channel); accepts up to SCHEDULE_MAX times.
- **Change:** Backend SCHEDULE_MAX raised from 14 to 30 so long campaigns can send more times. Same persistence model; more rows when duration is long.
- **Impact:** No schema or persistence format change.

## Implementation summary
- **scheduleEngine:** Parse "N months", "N weeks"; set windowDays. In deriveScheduleParams, when windowDays >= 30 default cadence 2/week and totalPosts = weeks * 2; raise SCHEDULE_MAX to 30.
- **stepHandlers:** Use full times from generateScheduleTimes (remove hard .slice(0, 14) or use params count already capped).
- **Backend:** SCHEDULE_MAX 14 → 30; buildCampaignReportContent: add campaign window line and cadence (e.g. from scheduleRecap).
