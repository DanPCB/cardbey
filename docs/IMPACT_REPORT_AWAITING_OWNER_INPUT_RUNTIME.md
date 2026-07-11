# Impact Report: First-class `awaiting_owner_input` + resume

**Date:** 2026-07-09  
**Scope:** Treat expected owner clarification as a runtime state (not failure); add resume API + Owner Input Card; fix Business.category Prisma select.

## Problem

Topology pause for missing reward/stamps already sets metadata `awaiting_owner_input`, but:
1. Dashboard remaps it to `mode: 'failed'` → “Loyalty setup hit an issue” + Retry
2. No `POST /owner-input` — Retry re-approves and restarts
3. `Business.category` select can fail silently on load_store_context

## What could break

| Risk | Why | Scope |
|------|-----|--------|
| MissionPipeline status enum | Adding or using `awaiting_owner_input` vs mapping to `awaiting_confirmation` | Mission status APIs / UI filters |
| TopologyReviewCard modes | New `awaiting_owner_input` mode vs failed chrome | All topology missions (loyalty, campaign, store…) |
| Resume from cursor | Wrong node replay duplicates side effects | Persist draft / present review |
| Owner-input body shape | Fields merge into wrong metadata keys | Loyalty draft generation |
| Business select change | Removing `category` if some DBs still have it | load_store_context |

## Smallest safe patch

1. Fix `loyaltyProgramContext` select: use `type` only (canonical Business model).
2. Runner: return `missingFields`, `pendingNodeId`, `executionCursor`; emit `owner_input_requested` (not execution_failed).
3. Executor: keep mission active; never finalize as `failed` for needs_input; persist cursor in metadata.
4. Add `POST /api/missions/:id/owner-input` → merge input → resume from pending node (no recompile).
5. Dashboard: view-model mode `awaiting_owner_input` + OwnerInputCard (Continue, no Retry/Reject/error banner).
6. Generic: any topology node returning `needs_input` inherits this path.

## Out of scope

- Full product redesign of clarification for non-topology missions
- Deleting legacy Retry for genuine `failed` executions
