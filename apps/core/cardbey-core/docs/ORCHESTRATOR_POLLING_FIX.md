# Orchestrator Task Polling Fix

## Issue
Frontend `useOrchestratorTask` hook is getting 404 errors when polling for task status.

## Root Cause
The frontend is calling the wrong URL path. The backend route uses **singular "task"**, not "tasks".

## Backend Route (Source of Truth)

**Path:** `GET /api/orchestrator/insights/task/:taskId`

**Location:** `src/orchestrator/api/orchestratorRoutes.js` (line 589)

**Response Format:**
```json
{
  "ok": true,
  "task": {
    "id": "string",
    "entryPoint": "string",
    "status": "queued" | "running" | "completed" | "failed",
    "result": any,
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

**404 Response:**
```json
{
  "ok": false,
  "error": "not_found",
  "message": "Task not found"
}
```

## Frontend Fix Required

### 1. Update `useOrchestratorTask` Hook

The hook should call:
```typescript
const res = await apiGET(`/api/orchestrator/insights/task/${taskId}`);
```

**NOT:**
- ❌ `/api/orchestrator/tasks/${taskId}` (wrong - plural "tasks")
- ❌ `/api/orchestrator/insights/tasks/${taskId}` (wrong - plural "tasks")
- ❌ `/api/orchestrator/task/${taskId}` (wrong - missing "insights" segment)

### 2. Handle 404 Gracefully

Update the polling function to handle 404 errors:

```typescript
async function poll(taskId: string) {
  try {
    const res = await apiGET(`/api/orchestrator/insights/task/${taskId}`);
    
    if (res.ok && res.task) {
      setTask(res.task);
      setStatus(res.task.status as OrchestratorStatus);

      if (res.task.status === "completed" || res.task.status === "failed") {
        stopPolling();
      }
    }
  } catch (err: any) {
    // Handle 404 gracefully - task not found/expired
    if (err?.status === 404 || err?.message?.includes("not_found")) {
      console.warn("[useOrchestratorTask] Task not found, stopping poll", taskId);
      setStatus("failed");
      stopPolling();
      return;
    }

    console.error("[useOrchestratorTask] Polling error:", err);
    setStatus("failed");
    stopPolling();
  }
}
```

## API Client Function

A helper function has been added to `packages/api-client/src/index.ts`:

```typescript
import { getOrchestratorTask } from '@cardbey/api-client';

const task = await getOrchestratorTask(baseUrl, taskId, { headers });
```

This function:
- Uses the correct path: `/api/orchestrator/insights/task/:taskId`
- Handles 404 errors gracefully
- Returns typed response

## Verification

After fixing:

1. Restart backend (if needed)
2. Open dashboard
3. Click "Ask Cardbey" on any insight action
4. Check browser console - no 404 errors
5. Check Network tab - GET requests to `/api/orchestrator/insights/task/<taskId>` return 200
6. Status badge should progress: queued → running → completed
7. Result drawer should open correctly

## Summary

**Correct URL:** `/api/orchestrator/insights/task/:taskId` (singular "task")
**Wrong URLs:** Any path with plural "tasks" or missing "insights" segment

