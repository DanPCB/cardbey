# Impact Report: Ask Create store demoted after completed mission

**Date:** 2026-07-27  
**Symptom:** Tap Ask “Create store” → “I still have your upload, but store setup did not start…”

## Root cause (from live logs)

1. Request is correct: `fromAskSelection=create_store`, image ~155KB, `selectedTool=create_store`.
2. Client still attaches `missionId` of a **prior completed** store mission (`cmrw1nd3…`).
3. `guardClassificationAgainstCompletedCreateStore` rewrites `create_store` → `general_chat`.
4. DeepSeek multi-agent then runs with `originalGoal` often `(Image attached)` → `GENERAL_QUERY` → `action: chat`.
5. Client demotion guard surfaces the retry copy (twice on double-tap).

## Smallest safe patch

1. Client: treat upload Ask create_store as fresh store mission (no missionId); set `originalGoal` to selection goal.
2. Server: do not block completed-mission rewrite for explicit upload create; skip DeepSeek for that context.
3. Binding helper: detach when tool is create_store + upload ask / CREATE_STORE_FROM_UPLOAD.

## What could break

| Risk | Mitigation |
|------|------------|
| Follow-up create_store on same completed mission no longer blocked | Still blocked for non-upload NL chips; upload Ask is a new store |
| DeepSeek skipped for upload create | Desired — draft path owns this |

## No-parallel-stack proof

Uses existing draft upload path + mission binding; no new create_store stack.
