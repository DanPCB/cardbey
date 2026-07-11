# Impact Report: Loyalty Topology Artifact Emission

## Problem

Loyalty typed topology completed with "Loyalty program plan complete." but `loyalty.persist_draft` / `loyalty.present_review` only returned in-memory objects — no mission artifact, metadata persistence, or SSE — so the dashboard had nothing to render.

## What could break

| Risk | Why |
|------|-----|
| Missions marked failed after successful node run | Completion guard requires `loyalty_program_draft` artifact when `executionMode === 'loyalty'` |
| Duplicate SSE artifacts on re-run | `missionDeliveredArtifacts` replaces prior `loyalty_program_draft` row |
| Store missions unaffected | Guard only applies to loyalty execution mode |

## Smallest safe patch

1. `loyaltyProgramDraftArtifactService.js` — build, persist metadata, emit `mission.artifact`
2. `executePersistDraft` — write draft record to metadata
3. `executePresentReview` — persist + emit canonical artifact
4. `topologyExecutor` — fail completion without artifact; `aggregateTopologyOutputs` includes loyalty artifact
5. Dashboard `LoyaltyProgramDraftCard` + TopologyReviewCardSlot completed state + SSE thread merge

## Success criteria

After owner input + topology completion:

- `loyalty_program_draft` in metadata + SSE
- UI: "Loyalty program draft created." + review card with reward / stamp threshold
- Mission not marked `completed` without artifact
