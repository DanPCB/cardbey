# Impact Report: Deterministic Loyalty Topology Builder

**Date:** 2026-07-09  
**Scope:** Replace LLM/generic loyalty topologies (all nodes → `setup_loyalty_program`) with typed cognitive stages.

## Problem

Compiler produces vague multi-agent nodes that all dispatch `setup_loyalty_program`. Execution fails with title-as-reason and dependency cascades. Unrelated Store readiness cards appear in the loyalty mission stream.

## What could break

| Risk | Why | Scope |
|------|-----|--------|
| Loyalty approve path uses new tools | Nodes no longer call `setup_loyalty_program` when spine compiles | Loyalty TopologyReview approve/execute |
| `needs_input` pauses instead of fails | Mission status may become `awaiting_owner_input` | Topology runner + UI |
| Store readiness filtering | Readiness guidance hidden when missionId mismatch | Console mission stream |
| Fallback still present | Generic `LOYALTY_AGENT_TOOL_MAP` kept when builder not used | Legacy/non-spine loyalty |

## Smallest safe patch

1. `loyaltyTopologyBuilder.js` — 7 deterministic nodes with stages/tools.
2. Early branch in `compileWithMultiAgent` for loyalty → builder (keep fallback).
3. Register `loyalty.*` executors wrapping existing draft/attachment/context services.
4. Runner: `needs_input` → pause (`awaiting_owner_input`), not failed.
5. `normalizeTopologyError(error, node)` — never use node title as reason.
6. Filter readiness guidance by `missionId === activeMissionId`.
7. TopologyReview: stages + ⚠ for needs_input.

## Out of scope

- Deleting multi-agent loyalty fallback
- Redesigning Store readiness globally
- OCR provider work
