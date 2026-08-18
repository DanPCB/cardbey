# Performer O→I→S→C→E — Agent distribution

**Date:** 2026-08-13  
**Wave:** P1 finish + P2 projector + proof  
**Impact:** `docs/IMPACT_REPORT_PERFORMER_OISCE_AGENT_WAVE.md`

## Loop ownership

| Stage | Owner module | Agent |
|-------|--------------|-------|
| Observe | Frozen evidence + OCR bind | A |
| Infer | TurnBelief builder (existing) + persist | B |
| Suggest | Belief chips / summary (existing + status fields) | C |
| Confirm | Governance + AWAITING_CONFIRM (existing; projector maps) | C |
| Execute | Fresh mission gate + dispatch | A |

## Parallel wave 1 (in flight)

| ID | Mission | Exit criteria |
|----|---------|---------------|
| A | Fresh mission + refuse stale frozen on identity conflict | SPA≠PTH handoff starts new mission; unit green |
| B | Persist TurnBelief on sourceContext/missionContext | Belief readable after gate |
| C | `projectPerformerStatus` + response fields | BLOCKED forbids celebratory; same enum |
| D | Run/expand vitest matrices → testing report | Pass/fail table |

## Follow-on (wave 2 — after wave 1 green)

| ID | Mission |
|----|---------|
| E | P3 runway: grounded draft consumes belief identity/offerings/hours |
| F | P4 delete dirty: celebrate templates, dead planners off default path |
| G | P5 E2E live: PTH→SPA→AWE matrix against running core |

## Success definition (this wave)

1. Evidence identity can rebind or fresh-mission away from sticky title.  
2. TurnBelief persisted per gated turn.  
3. One status projector on responses.  
4. Automated tests + testing report delivered.
