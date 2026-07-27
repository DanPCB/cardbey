# Insight Orchestrator Documentation

## Overview

The Insight Orchestrator handles AI-triggered actions from insight cards, reports, and PDF previews in the Cardbey dashboard. It provides a unified interface for executing various automated tasks across devices, campaigns, and content studio.

## Architecture

### Entry Points

Entry points are organized by domain:

- **Devices**: `device_health_check`, `playlist_assignment_audit`, `device_maintenance_plan`, `device_alert_setup_heartbeats`, `device_monitoring_review`
- **Campaigns**: `campaign_strategy_review`, `screen_distribution_optimizer`, `campaign_targeting_planner`, `campaign_ab_suggester`, `campaign_review_scheduler`
- **Studio/Content**: `studio_engagement_campaign`, `studio_training_guide`, `studio_goal_planner`, `content_calendar_builder`

### File Structure

```
src/orchestrator/
├── insightTypes.ts              # TypeScript types for entry points and payloads
├── handlers/
│   ├── deviceHandlers.ts       # Device-related handlers
│   ├── campaignHandlers.ts     # Campaign-related handlers
│   └── studioHandlers.ts       # Studio/content-related handlers
└── api/
    ├── insightsOrchestrator.js # Main orchestrator logic (routes to handlers)
    └── orchestratorRoutes.js   # Express routes
```

## API Endpoints

### POST /api/orchestrator/insights/execute

Execute an insight action.

**Request Body:**
```json
{
  "entryPoint": "device_health_check",
  "payload": {
    "scope": "tenant",
    "tenantId": "cmigvy38p0000jvx8vq6niqiu",
    "lookbackMinutes": 60
  },
  "context": {
    "tenantId": "cmigvy38p0000jvx8vq6niqiu",
    "userId": "cmirbt27u003qjvxge5t1dsfi",
    "source": "insight_card",
    "insightId": "optional-insight-id",
    "locale": "en"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "taskId": "cmisg95vj000ejvu4gt4d8xot",
  "status": "queued",
  "message": "Task queued: device_health_check"
}
```

### GET /api/orchestrator/insights/task/:taskId

Get task status and result.

**Response:**
```json
{
  "ok": true,
  "task": {
    "id": "cmisg95vj000ejvu4gt4d8xot",
    "entryPoint": "device_health_check",
    "status": "completed",
    "result": {
      "ok": true,
      "summary": "Found 2 device(s) with irregular heartbeats",
      "devices": [...],
      "suggestedActions": [...]
    },
    "createdAt": "2025-12-07T10:00:00Z",
    "updatedAt": "2025-12-07T10:00:05Z"
  }
}
```

## Adding a New Entry Point

To add a new entry point:

1. **Add to TypeScript types** (`src/orchestrator/insightTypes.ts`):
   - Add the entry point string to `OrchestratorEntryPoint` union type
   - Create a payload interface (e.g., `NewEntryPointPayload`)

2. **Create handler function** in the appropriate domain file:
   - `src/orchestrator/handlers/deviceHandlers.ts` for device actions
   - `src/orchestrator/handlers/campaignHandlers.ts` for campaign actions
   - `src/orchestrator/handlers/studioHandlers.ts` for studio/content actions

3. **Wire up in orchestrator** (`src/orchestrator/api/insightsOrchestrator.js`):
   - Import the handler function
   - Add case to `executeTask()` switch statement
   - Add entry point to `VALID_ENTRY_POINTS` array

4. **Example handler:**
```typescript
export async function handleNewEntryPoint(
  payload: NewEntryPointPayload,
  context: OrchestratorContext
) {
  // TODO: Implement real logic
  return {
    ok: true,
    summary: "New entry point executed",
    // ... result data
  };
}
```

## Database Schema

The `OrchestratorTask` model stores all task executions:

```prisma
model OrchestratorTask {
  id         String   @id @default(cuid())
  entryPoint String
  tenantId   String
  userId     String
  insightId  String?
  status     String   // "queued" | "running" | "completed" | "failed"
  request    Json     // Full request payload
  result     Json?    // Agent execution result
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([tenantId, createdAt])
  @@index([tenantId, status])
  @@index([entryPoint])
  @@index([insightId])
}
```

## Testing

### Manual Test Example

```bash
# Execute a device health check
curl -X POST http://localhost:3001/api/orchestrator/insights/execute \
  -H "Authorization: Bearer dev-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "entryPoint": "device_health_check",
    "payload": {
      "scope": "tenant",
      "tenantId": "cmigvy38p0000jvx8vq6niqiu",
      "lookbackMinutes": 60
    },
    "context": {
      "tenantId": "cmigvy38p0000jvx8vq6niqiu",
      "userId": "cmirbt27u003qjvxge5t1dsfi",
      "source": "insight_card"
    }
  }'

# Check task status
curl http://localhost:3001/api/orchestrator/insights/task/{taskId} \
  -H "Authorization: Bearer dev-admin-token"
```

## Notes

- Tasks are executed asynchronously; the API returns immediately with a `taskId`
- Use the GET endpoint to poll for task completion
- All handlers are currently stub implementations with TODO comments
- Future enhancements: job queue for long-running tasks, webhook notifications

