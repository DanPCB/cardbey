# Context Engine Integration Guide

## Intake v2 (implemented)

`performerIntakeV2Routes.js`:

1. After conversation bootstrap → `bootstrapIntakeContext`
2. Merged `currentContext` passed to `classifyIntent` (includes `currentFlow`)
3. On response → `finalizeIntakeContext` records classification + results

Session id resolution order:

1. `X-Session-ID` header
2. `body.sessionId` / `body.conversationSessionId`
3. Conversation session id from bootstrap
4. `guest_${guestSessionId}` for guests

## Mission pipeline (implemented)

| Event | Hook | File |
|-------|------|------|
| Orchestrator start | `onMissionStarted` | `missionPipelineOrchestrator.js` |
| Checkpoint reached | `onMissionCheckpoint` | `missionPipelineRunner.js` |
| Checkpoint resolved | `onMissionCheckpointResolved` | `missionCheckpointRespond.js` |
| Mission completed | `onMissionCompleted` | `missionCheckpointRespond.js` |

Mission `createdBy` → `userId`. Session id from `metadataJson.sessionId` or `mission:{missionId}` fallback.

## Adding a new module

```js
import { isContextEngineEnabled, getContextProvider, getContextExtractor } from '../lib/context/contextEngine.js';
import { ContextQueries } from '../lib/context/contextQueries.js';

if (!isContextEngineEnabled()) return;

const provider = getContextProvider();
const ctx = await provider.getOrCreateContext(userId, sessionId);

if (ContextQueries.isInWorkflow(ctx, 'campaign_creation')) {
  // route upload to campaign assets
}

const update = getContextExtractor().extractFromToolExecution(toolResult, ctx);
await provider.updateContext(userId, sessionId, update);
```

## Classifier contract

`classifyIntent` already reads:

- `opts.currentContext.activeStoreId`
- `opts.currentFlow`

Merged intake context supplies both from persisted state.

## Testing

```bash
pnpm --filter @cardbey/core run test -- src/lib/context/__tests__/contextEngine.test.js
```

Use `resetContextEngineForTests()` and `clearContextCacheForTests()` in unit tests.
