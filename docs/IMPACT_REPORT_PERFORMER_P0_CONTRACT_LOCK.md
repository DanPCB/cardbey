# Impact Report — Performer P0 Contract Lock

**Date:** 2026-08-12  
**Change type:** Contract + schema + agent freeze rule (no intake/runtime wiring yet)

## (1) What could break

- Nothing in live dispatch paths **yet** — P0 does not wire TurnBelief into intake.
- Future P1 may change chat copy and when create-store starts (intentional).

## (2) Why

P0 only adds docs, `performerTurnBelief` module, Cursor freeze rule, and unit tests.

## (3) Impact scope

- Docs under `docs/`
- `apps/core/cardbey-core/src/lib/performerTurnBelief/**`
- `.cursor/rules/performer-p0-contract-freeze.mdc`

## (4) Smallest safe patch

Lock contract/schema first; wire in P1 after `ACK PERFORMER_CAPABILITY_CONTRACT_V1`.
