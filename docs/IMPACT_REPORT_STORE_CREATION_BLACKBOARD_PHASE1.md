# IMPACT REPORT — Store Creation Blackboard Visibility (Phase 1)

**Date:** 2026-09-11  
**Status:** Implement visibility-only blackboard events (non-fatal)

## Change

Append MissionBlackboard events during `generateDraft` substages and a soft post-draft verify, without changing UX, intake, confirmation, retry, or stage logic.

## What could break

| Risk | Mitigation |
|------|------------|
| Blackboard write throws → draft fails | All appends wrapped non-fatal (catch + warn) |
| Wrong missionId (not MissionPipeline id) | Use same `context.missionId` / `reactMissionId` already used by structured_store_build (pipeline id) |
| Extra DB writes slow path | Same pattern as campaign; events are small |
| Dual path (React vs non-React) miss events | Hook via shared stepReporter wrapper used by both |

## Impact scope

- `draftStoreService.js` — wrap stepReporter + soft verify helper call sites
- `structured_store_build.js` — soft verify after successful generateDraft; stamp draft.input.missionId if missing
- `createStoreCheckpointDispatch.js` — stamp metadata.missionId = pipeline.id (additive)
- New helper: `storeCreationBlackboard.js` (thin wrapper over createOrchestrationBlackboard)

## Explicitly not doing

- Agent wrapping, retry, rollback, UX changes, DraftStore schema changes, campaign code
