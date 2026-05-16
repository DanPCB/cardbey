# Reports Scheduler Implementation (Phase 1.1)

## Summary

Implemented automated daily and weekly report generation using `node-cron` for scheduled execution. The scheduler runs inside Cardbey Core and automatically generates reports for all active tenants without manual intervention.

## Files Created/Modified

### New Files

1. **`src/scheduler/reportScheduler.js`** (Refactored)
   - Uses `node-cron` for proper cron scheduling (replaces polling approach)
   - Exports `initReportScheduler()`, `runDailyReportsJob()`, `runWeeklyReportsJob()`
   - Includes idempotency checks to prevent duplicate reports
   - Tracks stats (created, skipped, errors)

2. **`scripts/runReportsOnce.js`** (New)
   - Manual test script for triggering report generation
   - Supports `daily`, `weekly`, or `both` modes
   - Useful for testing without waiting for cron schedule

### Modified Files

1. **`src/server.js`**
   - Updated to use `initReportScheduler()` instead of `startReportScheduler()`
   - Changed env var from `ENABLE_REPORT_SCHEDULER` to `REPORT_SCHEDULER_ENABLED`
   - Scheduler initialization happens automatically (controlled by env var)

2. **`package.json`**
   - Added `node-cron` dependency
   - Added npm scripts:
     - `reports:run-once:daily` - Run daily reports once
     - `reports:run-once:weekly` - Run weekly reports once
     - `reports:run-once:both` - Run both daily and weekly reports

## Features Implemented

### 1. Cron Scheduling

- **Daily Reports**: Runs at 01:00 UTC every day (`0 1 * * *`)
- **Weekly Reports**: Runs on Monday at 02:00 UTC (`0 2 * * 1`)
- Uses `node-cron` library for reliable scheduling
- Timezone: UTC (configurable)

### 2. Daily Reports Job

Generates for each active tenant:
- **Daily Tenant Report** (`kind: daily_tenant`)
  - Period: Yesterday (00:00:00 to 23:59:59)
  - PeriodKey: `YYYY-MM-DD`
  
- **Daily Device Reports** (`kind: daily_device`)
  - One report per device per tenant
  - Period: Yesterday
  - PeriodKey: `YYYY-MM-DD` (note: shared across devices, distinguished by tags)

### 3. Weekly Reports Job

Generates for each active tenant:
- **Weekly Tenant Report** (`kind: weekly_tenant`)
  - Period: Previous week (Monday to Sunday)
  - PeriodKey: `YYYY-MM-DD_week`
  
- **Content Studio Activity Report** (`kind: content_studio_activity`)
  - Period: Previous week
  - PeriodKey: `YYYY-MM-DD_YYYY-MM-DD`
  
- **Campaign Performance Report** (`kind: campaign_performance`)
  - Period: Previous week
  - PeriodKey: `YYYY-MM-DD_to_YYYY-MM-DD`

### 4. Idempotency

- Checks for existing reports before generation
- Uses `(tenantId, kind, periodKey)` uniqueness
- Prevents duplicate reports for the same period
- Device reports checked via tags (includes `device:${deviceId}`)

### 5. Active Tenant Discovery

- Queries `Device` table for distinct `tenantId` values
- Filters out null/empty tenant IDs
- Can be refined later to use dedicated Tenant model if available

### 6. Error Handling

- Individual tenant/device failures don't stop the job
- Errors are logged with context (tenantId, kind, error message)
- Job continues processing remaining tenants
- Summary stats include error count

### 7. Logging & Stats

Each job logs:
- Start/finish timestamps
- Number of tenants processed
- Reports created vs skipped
- Error count and details
- Duration in seconds

## Configuration

### Environment Variable

```bash
# Enable the scheduler (default: disabled)
REPORT_SCHEDULER_ENABLED=true
```

**Behavior:**
- If `REPORT_SCHEDULER_ENABLED=true`: Scheduler initializes and cron jobs are registered
- If `REPORT_SCHEDULER_ENABLED=false` or unset: Scheduler logs "Disabled" and does not register jobs
- Default: **disabled** (safe for development)

### Cron Schedule

Currently hardcoded in `reportScheduler.js`:
- Daily: `'0 1 * * *'` (01:00 UTC)
- Weekly: `'0 2 * * 1'` (Monday 02:00 UTC)

These can be made configurable via environment variables in the future.

## Usage

### Automatic (Production)

1. Set environment variable:
   ```bash
   REPORT_SCHEDULER_ENABLED=true
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Scheduler will automatically:
   - Run daily reports at 01:00 UTC
   - Run weekly reports on Monday at 02:00 UTC

### Manual Testing

Run reports manually without waiting for cron:

```bash
# Run daily reports once
npm run reports:run-once:daily

# Run weekly reports once
npm run reports:run-once:weekly

# Run both
npm run reports:run-once:both
```

## Testing Checklist

### 1. Scheduler Disabled (Default)

- [ ] Start server without `REPORT_SCHEDULER_ENABLED`
- [ ] Verify log: `[ReportScheduler] Disabled (REPORT_SCHEDULER_ENABLED != true)`
- [ ] No cron jobs registered

### 2. Scheduler Enabled

- [ ] Set `REPORT_SCHEDULER_ENABLED=true`
- [ ] Start server
- [ ] Verify logs:
  - `[ReportScheduler] ✅ Scheduler initialized`
  - `[ReportScheduler] Daily reports: 01:00 UTC`
  - `[ReportScheduler] Weekly reports: Monday 02:00 UTC`

### 3. Manual Script - Daily Reports

- [ ] Run: `npm run reports:run-once:daily`
- [ ] Verify:
  - Daily tenant reports created for active tenants
  - Daily device reports created (if devices exist)
  - Stats logged (created, skipped, errors)
- [ ] Check database: New reports in `TenantReport` table
- [ ] Check dashboard: Reports appear in Insights → Reports

### 4. Manual Script - Weekly Reports

- [ ] Run: `npm run reports:run-once:weekly`
- [ ] Verify:
  - Weekly tenant reports created
  - Content studio reports created
  - Campaign performance reports created
  - Stats logged
- [ ] Check database: New reports with correct `kind` values
- [ ] Check dashboard: Reports appear with correct filters

### 5. Idempotency Test

- [ ] Run daily script twice for the same date
- [ ] First run: Reports created
- [ ] Second run: Reports skipped (idempotency check works)
- [ ] Verify: No duplicate reports in database

### 6. Error Handling

- [ ] Simulate error (e.g., invalid tenantId)
- [ ] Verify: Job continues processing other tenants
- [ ] Verify: Errors logged but don't crash the job
- [ ] Verify: Summary includes error count

## Known Limitations

1. **Device Report PeriodKey**: Daily device reports use date-only periodKey (`YYYY-MM-DD`), which means multiple devices for the same tenant on the same day share the same key. Reports are distinguished by tags (`device:${deviceId}`), but this could be improved by including deviceId in periodKey.

2. **Active Tenant Discovery**: Currently uses `Device` table. If a tenant has no devices, they won't receive reports. Consider adding a dedicated `Tenant` model or Business model check in the future.

3. **Timezone**: Currently hardcoded to UTC. Consider making timezone configurable.

4. **Cron Schedule**: Hardcoded in code. Consider making configurable via environment variables.

## Next Steps (Future Phases)

- **Phase 1.2**: RAG indexing of reports
- **Phase 2**: New report types (CAI usage, Device Health)
- **Phase 3**: PDF export
- **Phase 4**: Search + pagination
- **Phase 5**: Weekly AI Summary

## Dependencies

- `node-cron`: ^3.x (installed)
- Existing: `@prisma/client`, `reportService.js` functions

## Notes

- Scheduler runs in the same process as the Express server
- No external cron daemon required
- Jobs are lightweight and can run concurrently with API requests
- Consider monitoring job execution times and adding alerts for failures

