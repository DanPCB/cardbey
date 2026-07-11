# Intent Classification

Classification is **pure**: it inspects message content and explicit entry-point signals only. It never reads store context, session state, or routing hints (except explicit form submit / `action` fields).

## Intent types

| Type | `requiresBusiness` | Example messages |
|------|-------------------|------------------|
| `greeting` | false | Hi, Hello, Good morning |
| `help` | false | Help, I need help |
| `capabilities` | false | What can you do? |
| `question` | false | Answer a question., What is... |
| `clarify` | false | Low-signal ambiguous input |
| `create_store` | true | Create a store |
| `create_campaign` | true | Create a campaign |
| `analytics` | true | Show analytics |
| `manage_catalog` | true | Manage products, Add products |

## Rules

1. Greeting/help/capabilities always win over stale `primaryModeHint` values.
2. `primaryModeHint` is honored only for **explicit entry points** (e.g. store form handoff with matching message).
3. `storeCreateForm` with `storeName` forces `create_store` regardless of message text.
4. No regex guard stacking — one classifier, one result.

## Implementation

See `apps/core/cardbey-core/src/intent/classifier/IntentClassifier.ts`.

## Tests

Acceptance cases are covered in `src/intent/__tests__/IntentClassifier.test.ts`.
