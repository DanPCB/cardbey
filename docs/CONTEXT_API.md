# Context API Reference

## Feature flag

| Variable | Default | Effect |
|----------|---------|--------|
| `DISABLE_CONTEXT_ENGINE` | unset (enabled) | When `true`, all hooks no-op |

## Singleton accessors

```js
import {
  getContextProvider,
  getContextStore,
  getContextExtractor,
  isContextEngineEnabled,
} from '../lib/context/contextEngine.js';
```

## ContextProvider

| Method | Description |
|--------|-------------|
| `getContext(userId, sessionId)` | Load context; anonymous shell if ids missing |
| `getOrCreateContext(userId, sessionId)` | Load or initialize empty context |
| `updateContext(userId, sessionId, update)` | Deep-merge partial update and persist |
| `recordInteraction(userId, sessionId, input, output, intent, confidence, durationMs?)` | Append interaction |
| `recordAction(userId, sessionId, type, tool, result, success)` | Append completed action |
| `clearSession(userId, sessionId)` | Soft-end session (`active=false`) |

## ContextStore

Lower-level persistence used by the provider. Same method names; talks to Prisma + `contextCache`.

## ContextQueries

Pure helpers on `UserContext`:

- `hasActiveStore`, `getCurrentWorkflow`, `isInWorkflow`
- `getRecentInteractions`, `getLastInteractionOfType`
- `hasPendingCheckpoints`, `getActiveMissionId`, `getActiveMission`
- `hasCompletedAction`, `getDefaultAction`, `getFrequentlyUsedTools`
- `getBehaviorPattern`, `isFirstTimeUser`
- `getCurrentInputContext`, `isCurrentInputAttachmentOnly`

## ContextExtractor

| Method | Source event |
|--------|----------------|
| `extractFromIntake(input, currentContext)` | POST `/api/performer/intake/v2` body |
| `extractFromMission(mission, currentContext)` | Mission pipeline start / update |
| `extractFromToolExecution(result, currentContext)` | Tool success (e.g. `create_store`) |
| `extractFromUserFeedback(feedback, currentContext)` | Skips, tool usage, corrections |

## Intake bridge

```js
import {
  bootstrapIntakeContext,
  finalizeIntakeContext,
  mergePersistedWithClientContext,
  resolveContextSessionId,
  resolveContextUserId,
} from '../lib/context/contextIntakeBridge.js';
```

## Mission hooks

```js
import {
  onMissionStarted,
  onMissionCheckpoint,
  onMissionCheckpointResolved,
  onMissionCompleted,
} from '../lib/context/contextMissionHooks.js';
```

## Types

See `contextTypes.ts` — `UserContext`, `Interaction`, `PendingCheckpoint`, `WorkflowType`, etc.
