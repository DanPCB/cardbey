# Multi-Agent API Reference

## Orchestrator

### `new Orchestrator(options?)`

| Option | Type | Description |
|--------|------|-------------|
| `intentClassifier` | `IntentClassifier` | Custom classifier (testing) |
| `planner` | `Planner` | Custom planner |
| `critic` | `Critic` | Custom critic |
| `refiner` | `Refiner` | Custom refiner |
| `stepExecutor` | `StepExecutor` | Custom plan step executor |

### `processMission(userMessage: string): Promise<MissionResult>`

Processes a user message through the full pipeline.

**Returns `MissionResult`:**
- `missionId` — Unique mission identifier
- `status` — `completed` | `failed` | `pending_human_review`
- `intent` — Classified intent
- `plan` — Mission plan (setup intents only)
- `review` — Critic review (setup intents only)
- `execution` — Step results (setup intents only)
- `finalResponse` — User-facing response
- `telemetry` — Token usage, agents used, duration, cost

### `recordHitlFeedback(missionId, decision, notes?)`

Records human-in-the-loop feedback for quality improvement.

## Agents

| Agent | Method | Input | Output |
|-------|--------|-------|--------|
| `IntentClassifier` | `process(msg)` | `string` | `IntentResult` |
| `Planner` | `process(input)` | `{ message, context? }` | `MissionPlan` |
| `Critic` | `process(input)` | `{ plan, originalMessage? }` | `ReviewResult` |
| `Refiner` | `process(draft)` | `string` | `string` |
| `Specialist` | `process(msg)` | `string` | `string` |

## Intents

- `STORE_SETUP` — New store creation
- `STORE_UPDATE` — Modify existing store
- `STORE_QUERY` — Store information requests
- `MISSION_PLANNING` — Multi-store / complex missions
- `GENERAL_QUERY` — Platform questions
- `SUPPORT` — Help requests

## Specialist Domains

- `store_setup`
- `store_management`
- `general_assistance`
- `customer_support`

## Configuration Functions

```typescript
import {
  loadDeepSeekConfig,
  loadAgentConfig,
  loadMultiAgentRuntimeConfig,
  shouldRouteToDeepSeek,
} from './multiAgent/config/index.js';
```

## Telemetry

```typescript
import { globalMetrics, renderTelemetryDashboard } from './multiAgent/telemetry/index.js';

const snapshot = globalMetrics.getSnapshot();
console.log(renderTelemetryDashboard());
```
