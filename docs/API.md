# Cardbey API Documentation

## Unified Dispatch

All Performer mission execution converges on the Runtime Kernel. Client surfaces call Intake V2; confirmed actions dispatch via `unifiedDispatch`.

### POST `/api/performer/intake/v2`

Unified entry point for natural-language missions.

**Request:**

```json
{
  "text": "Create a store for my business",
  "currentContext": { "activeStoreId": "optional-store-id" },
  "history": []
}
```

**Response (tool execution):**

```json
{
  "success": true,
  "action": "tool_call",
  "tool": "analyze_store",
  "executionPath": "proactive_plan",
  "missionId": "cmq...",
  "result": { "executionState": "executed" }
}
```

### POST `/api/performer/intake/v2/confirm`

Confirms a gated action (e.g. `activate_campaigns`, `code_fix`).

### POST `/api/performer/runtime/run-factory`

Factory execution — routes through `unifiedDispatch({ type: 'run_factory' })`.

**Request:**

```json
{
  "factoryId": "creative_asset_factory_v4",
  "missionId": "m-1",
  "intent": "Create a promo video",
  "storeId": "store-1"
}
```

## Status & Observability

### GET `/api/health`

Core service health.

### GET `/api/reliability/slo/status`

SLO objectives with real vs stub execution metrics. Includes `executionStateStats`:

- `realSuccessRate`, `stubSuccessRate`
- `realCount`, `stubCount`, `blockedCount`, `plannedCount`

### GET `/api/admin/platform/runtime-metrics`

Control Center runtime tile data (24h execution state breakdown).

### GET `/api/observations/latest`

Recent observations with `executionState` and `isRealExecution` fields (platform admin).
