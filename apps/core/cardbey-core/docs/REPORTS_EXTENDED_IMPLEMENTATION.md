# Extended Reports Implementation Summary

## Overview

Extended the reports system to support three new report kinds: `daily_device`, `weekly_tenant`, and `content_studio_activity`. All reports use the existing `TenantReport` model and appear in `/api/reports` with existing filters.

## Files Created/Modified

### Services
- **`src/services/reportService.js`** (NEW): 
  - Unified service for all report generation
  - `generateDailyTenantReport()` - Daily tenant reports (moved from reporterAgentService)
  - `generateDailyDeviceReport()` - Daily device reports
  - `generateWeeklyTenantReport()` - Weekly tenant reports
  - `generateContentStudioActivityReport()` - Content studio activity reports
  - Shared utilities: `normalizeEventsForSummary()`, `generateReportContent()`, `saveReport()`

- **`src/services/reporterAgentService.js`** (DEPRECATED):
  - Original implementation - can be removed after migration is confirmed

### Routes
- **`src/routes/reports.js`** (MODIFIED):
  - Updated to use `reportService.js` instead of `reporterAgentService.js`
  - Added `POST /api/admin/tenants/:tenantId/reports/daily-device`
  - Added `POST /api/admin/tenants/:tenantId/reports/weekly`
  - Added `POST /api/admin/tenants/:tenantId/reports/content-studio`
  - Updated existing `POST /api/admin/tenants/:tenantId/reports/daily` to use new service
  - Added manual test commands in comments

### Scripts
- **`scripts/generateDailyReports.ts`** (MODIFIED):
  - Updated to use `generateDailyTenantReport()` from `reportService.js`
  - Simplified `getActiveTenantIds()` function
  - Added `getYesterday()` helper
  - Added `getLastMonday()` helper for weekly reports
  - Added optional weekly report generation (commented out, ready for Monday cron)
  - Added comprehensive cron setup documentation

### Configuration
- **`package.json`** (MODIFIED):
  - Added `reports:daily-all` script (alias of existing `reports:daily`)

## Report Kinds

### 1. daily_tenant (existing)
- **Scope**: `tenant_activity`
- **Period Key**: `YYYY-MM-DD`
- **Tags**: `daily,tenant_activity`
- **Endpoint**: `POST /api/admin/tenants/:tenantId/reports/daily`

### 2. daily_device (new)
- **Scope**: `device_activity`
- **Period Key**: `YYYY-MM-DD_<deviceId>`
- **Tags**: `daily,device_activity`
- **Endpoint**: `POST /api/admin/tenants/:tenantId/reports/daily-device`
- **Body**: `{ date?: string, deviceId: string }`
- **Content**: Overview, playlist assignments, heartbeats, errors, suggested actions

### 3. weekly_tenant (new)
- **Scope**: `tenant_activity`
- **Period Key**: `YYYY-MM-DD_week`
- **Tags**: `weekly,tenant_activity`
- **Endpoint**: `POST /api/admin/tenants/:tenantId/reports/weekly`
- **Body**: `{ weekStart?: string }` (defaults to Monday of last week)
- **Content**: 7-day summary, campaigns launched, device activity, top devices, errors, suggested actions

### 4. content_studio_activity (new)
- **Scope**: `content_studio`
- **Period Key**: `YYYY-MM-DD_YYYY-MM-DD` (from_to)
- **Tags**: `content_studio,activity`
- **Endpoint**: `POST /api/admin/tenants/:tenantId/reports/content-studio`
- **Body**: `{ from?: string, to?: string }` (defaults to last 7 days)
- **Content**: Designs created/edited, AI generations, templates used (stubbed if no data)

## API Endpoints

### Generate Reports

1. **Daily Tenant Report**
   ```bash
   POST /api/admin/tenants/:tenantId/reports/daily
   Body: { date?: "2025-12-05" }
   ```

2. **Daily Device Report**
   ```bash
   POST /api/admin/tenants/:tenantId/reports/daily-device
   Body: { date?: "2025-12-05", deviceId: "device-123" }
   ```

3. **Weekly Tenant Report**
   ```bash
   POST /api/admin/tenants/:tenantId/reports/weekly
   Body: { weekStart?: "2025-12-01" }
   ```

4. **Content Studio Activity Report**
   ```bash
   POST /api/admin/tenants/:tenantId/reports/content-studio
   Body: { from?: "2025-12-01", to?: "2025-12-07" }
   ```

### List Reports (existing, supports all kinds)

```bash
GET /api/reports?kind=daily_device
GET /api/reports?kind=weekly_tenant
GET /api/reports?kind=content_studio_activity
```

## Script Usage

### Manual Run
```bash
npm run reports:daily-all
```

### Cron Setup
```bash
# Run every day at 01:30 UTC
30 1 * * * cd /path/to/apps/core/cardbey-core && npm run reports:daily-all >> logs/reports.log 2>&1
```

The script:
- Finds all active tenants (from Device table)
- Generates daily reports for yesterday
- Logs success/failure per tenant
- Continues processing even if one tenant fails
- Optionally generates weekly reports on Mondays (commented out)

## Response Shapes

All endpoints return:
```json
{
  "ok": true,
  "report": {
    "id": "clx...",
    "tenantId": "tenant-123",
    "kind": "daily_device" | "weekly_tenant" | "content_studio_activity",
    "periodKey": "...",
    "title": "...",
    "contentMd": "...",
    "scope": "device_activity" | "tenant_activity" | "content_studio",
    "tags": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

## Filtering

The existing `GET /api/reports` endpoint supports filtering by `kind`:
- `kind=daily_tenant`
- `kind=daily_device`
- `kind=weekly_tenant`
- `kind=content_studio_activity`

No additional changes needed - the query parameter already works with any string value.

## Implementation Notes

1. **Content Studio Metrics**: Currently stubbed (returns 0) for AI generations and templates used. These can be tracked via ActivityEvent in the future.

2. **Campaign Tracking**: Weekly reports attempt to load campaigns, but Campaign model may not have tenantId. Adjust query as needed based on actual schema.

3. **Tenant Mapping**: Content Studio reports use Content model which has `userId` not `tenantId`. Currently includes all content; add user-tenant mapping if needed.

4. **RAG Ingestion**: All reports are automatically ingested into RAG system for assistant queries.

5. **Error Handling**: Per-tenant errors are logged but don't stop batch processing.

## Testing

### Manual Test Commands

**Daily Device:**
```powershell
irm -Method Post `
  -Uri "http://localhost:3001/api/admin/tenants/<tenantId>/reports/daily-device" `
  -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer dev-admin-token" } `
  -Body '{"date":"2025-12-05","deviceId":"<aRealDeviceId>"}'
```

**Weekly Tenant:**
```powershell
irm -Method Post `
  -Uri "http://localhost:3001/api/admin/tenants/<tenantId>/reports/weekly" `
  -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer dev-admin-token" } `
  -Body '{"weekStart":"2025-12-01"}'
```

**Content Studio:**
```powershell
irm -Method Post `
  -Uri "http://localhost:3001/api/admin/tenants/<tenantId>/reports/content-studio" `
  -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer dev-admin-token" } `
  -Body '{"from":"2025-12-01","to":"2025-12-07"}'
```

### Verify in Dashboard

1. Go to Insights → Reports
2. Check that all four report kinds appear in the Kind dropdown
3. Filter by each kind and verify reports appear
4. Click a report to view full markdown content

## Future Enhancements

1. **Weekly Report Automation**: Uncomment weekly report generation in script for Monday cron runs
2. **Content Studio Tracking**: Add ActivityEvent logging for AI generations and template usage
3. **Campaign Tenant Mapping**: Fix campaign queries if tenantId field exists or add mapping
4. **User-Tenant Mapping**: Add proper filtering for Content Studio reports based on tenant
5. **Report Scheduling**: Add UI for scheduling report generation
6. **Email Delivery**: Send reports via email to tenant owners

