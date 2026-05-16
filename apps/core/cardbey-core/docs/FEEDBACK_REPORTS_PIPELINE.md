# Feedback & Reports → Knowledge Base Pipeline

## Overview

A minimal v1 pipeline that logs activity events, generates daily tenant reports using LLM, and ingests them into the RAG system for the assistant to use.

## Files Created/Modified

### Database Schema
- **`prisma/schema.prisma`**: 
  - `ActivityEvent` model (already existed) - tracks system events
  - `TenantReport` model (already existed) - stores generated reports
  - `RagChunk` model - added `tenantId` field for tenant-specific filtering

### Services
- **`src/services/activityEventService.js`**: 
  - `logActivityEvent()` - core logging function
  - `logDeviceError()` - helper for device errors
  - `logPlaylistAssigned()` - helper for playlist assignments
  - `logAssistantFeedback()` - helper for assistant feedback

- **`src/services/reporterAgentService.js`**: 
  - `generateTenantDailyReport()` - generates daily reports from activity events using LLM

- **`src/services/ragService.js`**: 
  - `ingestTenantReportToRag()` - ingests tenant reports into RAG
  - `buildRagContext()` - updated to support `tenantId` filtering
  - `getRagAnswer()` - updated to accept `tenantId` parameter

### API Routes
- **`src/routes/reports.js`**: 
  - `POST /api/admin/tenants/:tenantId/reports/daily` - trigger report generation

- **`src/routes/rag.js`**: 
  - Updated to accept `tenantId` parameter

- **`src/routes/deviceAgentRoutes.js`**: 
  - Integrated activity logging when playlists are assigned

- **`src/routes/deviceEngine.js`**: 
  - Integrated activity logging when playlists are pushed

### Scripts
- **`scripts/generateDailyReports.ts`**: 
  - Generates daily reports for all active tenants

### Configuration
- **`package.json`**: 
  - Added `reports:daily` script

- **`src/server.js`**: 
  - Registered reports routes

## How to Use

### 1. Log a Test Event

```javascript
import { logActivityEvent, logPlaylistAssigned } from './src/services/activityEventService.js';

// Log a playlist assignment
await logPlaylistAssigned({
  deviceId: 'device-123',
  playlistId: 'playlist-456',
  tenantId: 'tenant-789',
  storeId: 'store-abc',
  userId: 'user-xyz',
  metadata: {
    version: 'v1.0',
  },
});

// Log a device error
await logDeviceError({
  deviceId: 'device-123',
  tenantId: 'tenant-789',
  error: 'Playlist load failed',
  metadata: {
    errorCode: 'PLAYLIST_LOAD_ERROR',
  },
});
```

### 2. Generate a Daily Report for a Tenant

#### Via API

```bash
curl -X POST http://localhost:3001/api/admin/tenants/tenant-789/reports/daily \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"date": "2025-12-04"}'
```

Response:
```json
{
  "ok": true,
  "report": {
    "id": "clx...",
    "tenantId": "tenant-789",
    "kind": "daily_tenant",
    "periodKey": "2025-12-04",
    "title": "Daily Activity Report – tenant-789 (2025-12-04)",
    "contentMd": "# Daily Activity Report...",
    "scope": "tenant_activity",
    "tags": "daily,tenant_activity",
    "createdAt": "2025-12-05T00:00:00.000Z"
  }
}
```

#### Via Script

```bash
npm run reports:daily
```

This generates reports for all active tenants for yesterday's date.

### 3. Confirm Report Appears in RAG Answers

```bash
curl -X POST http://localhost:3001/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What issues happened yesterday?",
    "scope": "tenant_activity",
    "tenantId": "tenant-789"
  }'
```

The RAG system will:
1. Filter chunks by `scope: "tenant_activity"` and `tenantId: "tenant-789"`
2. Retrieve relevant chunks from the ingested report
3. Generate an answer based on the report content

## Activity Event Types

- `device_heartbeat` - Device heartbeat/ping
- `device_status_change` - Device status changed (online/offline)
- `playlist_assigned` - Playlist assigned to device
- `playlist_error` - Playlist error occurred
- `orientation_changed` - Device orientation changed
- `feedback_positive` - Positive user feedback
- `feedback_negative` - Negative user feedback
- `assistant_bad_answer` - Assistant gave bad answer
- `assistant_good_answer` - Assistant gave good answer

## Report Generation Flow

1. **Collect Events**: Load all `ActivityEvent` rows for tenant and date range
2. **Normalize**: Convert events to structured summary (counts, timeline, categories)
3. **LLM Generation**: Call OpenAI with Reporter Agent prompt to generate markdown report
4. **Save Report**: Store `TenantReport` in database
5. **Ingest to RAG**: Chunk report and ingest into RAG system with embeddings
6. **Return**: Return the created report

## RAG Integration

When a tenant report is ingested:
- **Scope**: `tenant_activity`
- **Source Path**: `tenant-reports/{tenantId}/{periodKey}.md`
- **Tenant ID**: Stored in `RagChunk.tenantId` for filtering

When querying RAG with `scope: "tenant_activity"` and `tenantId`:
- System prioritizes chunks with matching `tenantId` and `scope`
- Allows tenant-specific answers based on their activity reports

## Integration Points

Activity logging is integrated in:
1. **`src/routes/deviceAgentRoutes.js`** - When playlist is assigned via `/api/devices/:deviceId/assign-playlist`
2. **`src/routes/deviceEngine.js`** - When playlist is pushed via `/api/device/push-playlist`

## Future Enhancements

1. **Automatic Report Generation**: Schedule daily reports via cron job
2. **Feedback UI**: Add UI for users to provide assistant feedback
3. **Report Analytics**: Track report generation metrics
4. **Multi-period Reports**: Support weekly/monthly reports
5. **Report Templates**: Customizable report formats per tenant
6. **Real-time Event Streaming**: Stream events as they occur for live dashboards

## Environment Variables

Required:
- `OPENAI_API_KEY`: OpenAI API key for LLM report generation and embeddings

## Error Handling

- Activity logging failures are non-fatal (logged but don't break the app)
- Report generation failures are logged with tenant ID for debugging
- RAG ingestion failures don't prevent report creation (logged separately)

## Testing

To test the full pipeline:

1. **Log some events**:
```bash
# Use the API or directly call the service
```

2. **Generate a report**:
```bash
curl -X POST http://localhost:3001/api/admin/tenants/TEST_TENANT/reports/daily \
  -H "Authorization: Bearer TOKEN" \
  -d '{"date": "2025-12-04"}'
```

3. **Query RAG**:
```bash
curl -X POST http://localhost:3001/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What happened yesterday?",
    "scope": "tenant_activity",
    "tenantId": "TEST_TENANT"
  }'
```

The answer should reference the generated report content.

