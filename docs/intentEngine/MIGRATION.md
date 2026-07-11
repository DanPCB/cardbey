# Migration: Runner-Led → Intent-First

## Current state (Phase 1)

The intent-first engine runs **alongside** the legacy pipeline:

- `INTENT_ENGINE_SHADOW=true` (default) logs comparisons after legacy classification
- Legacy guards remain active until Phase 2
- No production behavior change unless `INTENT_ENGINE_PRIMARY=true`

## Phase 2 checklist

1. Set `INTENT_ENGINE_PRIMARY=true` in staging
2. Verify acceptance criteria (see below)
3. Remove legacy pre-classification guards:
   - `isOpenPerformerChatTurn` short-circuit in `performerIntakeV2Routes.js`
   - `intakeSystemShortcuts.detectIntent` create-store forcing
   - `primaryModeHint` overrides in `IntentReasoner`
4. Delete deprecated files:
   - `intakeSystemShortcuts.js` (after entry points migrated)
   - `intakeCasualChatTurn.js` guard usage (keep patterns in classifier)
5. Remove `start_new_workflow` → `create_store` in `intentIntegration.js`

## Phase 3

- Expand intent types (loyalty, graphics, device)
- LLM-assisted classification behind same orchestrator interface
- Remove `lib/intent/intentReasoner.js` mixed routing

## Acceptance criteria

| Test | Expected |
|------|----------|
| "Hi" | Hello response — NO store picker |
| "What can you do?" | Capabilities — NO store picker |
| "I need help" | Help options — NO store picker |
| "answer a question." | Clarification — NO store picker |
| "Create a store" | Store creation flow |
| "Create a campaign" (0 stores) | Guide to store creation |
| "Create a campaign" (1 store) | Auto-select, campaign flow |
| "Create a campaign" (5 stores) | Store picker |
| "Hi" (5 stores) | Hello — NO store picker |

## Rollback

Set `INTENT_ENGINE_PRIMARY=false`. Shadow logging can remain enabled for diagnostics.

## Client changes

`useIntakeV2.ts` handles `_intentEngine` metadata and normalizes intent-engine response actions. No client-side store-creation guards run before the server classifies intent.
