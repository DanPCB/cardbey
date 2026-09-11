# IMPACT REPORT — websiteUrl not reaching mode classifier

**Date:** 2026-09-11  
**Status:** Explicit fix task — minimal metadata stamp

## Audit summary

| Step | Finding |
|------|---------|
| 1. Dispatch | `resolveCreateStoreHandoffFields` returns `websiteUrl` (L362). `researchContactFieldsForMissionBody` spreads into `createMissionPipeline` metadata (L759) and `missionRunBody` (L851). |
| 2. structured_store_build | Reads `mission.metadataJson` only (`meta.websiteUrl ?? meta.website`, L79–81). Does **not** see deferred `body`. |
| 3. Drop point | Checkpoint path (`executeStoreMissionPipelineRun` L285–305) runs `runMissionUntilBlocked` **without** merging `body.websiteUrl` into `metadataJson`. Reused missions / incomplete stamps leave `metadataJson` without URL. User DB check used `$.website` while code stores `websiteUrl`. |

## Fix

In `dispatchCreateStoreCheckpointPipeline` Phase 1 metadata stamp: always merge `researchContact` and dual-write `website` + `websiteUrl` onto `metadataJson` (covers reuse + consumers querying `$.website`).

## Constraints honored

- No classifier / resolveCreateStoreHandoffFields / structured_store_build reader / draftStoreService classifier builder changes
