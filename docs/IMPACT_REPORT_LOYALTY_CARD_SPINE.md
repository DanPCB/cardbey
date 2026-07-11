# IMPACT REPORT: Route Loyalty Card Through Spine

## Date: 2026-07-08

## What could break
- Dashboard loyalty scan may fail to open Performer review if spine compile errors or IntentReasoner misses loyalty.
- TopologyReviewCard may show a generic plan if loyalty mission kind is not recognized.
- Approving a loyalty topology may run wrong tools if compiler maps nodes to campaign tools.

## Why
- Replaces (behind flag) `POST /runtime/ui-action` with IntentReasoner → compileWithMultiAgent → writeMetadata.
- Default loyalty tool today is `setup_loyalty_program` (not `create_loyalty_program`); both must be compiler-eligible.
- Compiler currently only defaults/maps campaign agent types.

## Impact scope
- `/api/orchestrator/loyalty-from-card`
- Dashboard `loyaltyCardScan.ts` handoff
- Multi-agent compiler tool map + `MULTI_AGENT_COMPILER_TOOLS`
- Topology review kind labels (loyalty → generic or loyalty)

## Smallest safe patch
1. Add `USE_LOYALTY_SPINE` (default **false**) — old ui-action path unchanged when off.
2. Add thin `lib/intake/index.js` → `handlePerformerIntake` (classify → compile → writeMetadata).
3. Extend compiler eligibility + loyalty default topology (LoyaltyCampaignSkill tools).
4. When flag on: orchestrator extract → spine → return `missionId` + `show_execution_plan`.
5. Dashboard: if spine payload present, skip ui-action; else keep fallback.
6. Path telemetry: `loyalty_spine` vs `loyalty_ui_action_fallback`.

## Acknowledgement
User requested IMPLEMENTATION; fallback preserved via `USE_LOYALTY_SPINE=false`.
