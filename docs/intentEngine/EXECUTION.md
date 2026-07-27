# Intent Execution

Execution maps `(intent, context)` to an intake-compatible action. There are no hardcoded runways.

## Execution actions

| Action | When |
|--------|------|
| `chat` | Greeting, help, capabilities, question, clarify |
| `store_picker` | Business intent + multiple stores |
| `create_store` | Explicit create or prerequisite for other business intents |
| `campaign_creation` | Campaign intent + ready context |
| `analytics` | Analytics intent + ready context |
| `proactive_plan` | Catalog management + ready context |

## Response mapping

`intentResultToIntakeResponse()` converts engine output to intake V2 JSON:

- `chat` → `{ action: 'chat', response }`
- `store_picker` → `{ action: 'clarify', clarifyType: 'execution_context_store_picker' }`
- `create_store` → `{ action: 'create_store' }`
- Business intents with ready context → classification for legacy dispatch (`intentResultToClassification`)

## Early return vs dispatch

- **Early return:** chat, store picker, create_store (including prerequisite)
- **Continue dispatch:** campaign/analytics/catalog with resolved store context

## Implementation

See `apps/core/cardbey-core/src/intent/executor/IntentExecutor.ts` and `bridge/intentEngineBridge.ts`.
