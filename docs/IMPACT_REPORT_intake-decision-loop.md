# Impact Report: Intake Decision Loop (Root Architecture Fix)

**Date:** 2026-06-29  
**Status:** Phase 0 + Phase 1 in progress  
**Scope:** `POST /api/performer/intake/v2` and supporting intake libs

---

## 1. What could break

| Area | Risk | Severity |
|------|------|----------|
| Upload → store creation | Belief merge may disagree with legacy handoff until Phase 3 cutover | High (later phases) |
| Campaign launch | Removing route-level `_autoSubmit` bypass changes checkpoint timing | High (Phase 4) |
| Guest draft onboarding | Unified guest constraint layer may alter sign-in gate ordering | Medium |
| Mission resume / refinement | Persisted intent moved into rank step may change follow-up behavior | Medium |
| Dashboard intake handoff | Response contract adds fields; client must not depend on broken handoff | Medium |
| Manual / operator mode | Must remain isolated from automated decision loop | Low |
| Performance | Additional belief load per turn (~async reads) | Low |

**Phase 0 + Phase 1 only:** Read-only shadow mode — **no user-visible behavior change** unless belief logging volume affects ops.

---

## 2. Why

- Decision authority is fragmented across routes, upload guards, and post-classification overrides.
- Belief state is split across 8+ stores; Turn 2 often loses upload context.
- Pattern matchers act as deciders instead of advisors.

Phase 1 introduces `loadBelief()` shadow logging to measure divergence before any execution path changes.

---

## 3. Impact scope

**Affected:**

- `apps/core/cardbey-core/src/routes/performerIntakeV2Routes.js`
- `apps/core/cardbey-core/src/lib/decision/*` (new)
- `apps/core/cardbey-core/src/lib/intake/*` (advisors, later phases)
- Dashboard Performer composer handoff (Phase 5)

**Not affected:**

- Auth, payments, public store pages, signage push, unrelated dashboard modules

---

## 4. Smallest safe patch (phased)

| Phase | Change | User-visible |
|-------|--------|--------------|
| **0** | Docs, golden spec, bypass telemetry, decision freeze | No |
| **1** | `loadBelief` shadow + divergence logs | No |
| **2** | Advisor extraction + shadow rank | No |
| **3** | `decideTurn` behind feature flag | Yes (flagged) |
| **4** | Remove P0 bypasses, slim routes | Yes |
| **5** | Server-authoritative belief, client contract | Yes |

**Minimum viable fix if full plan deferred:** Phase 1 + Phase 5 only (belief persistence without full loop).

---

## 5. Rollback

- Phase 1: set `INTAKE_BELIEF_SHADOW_ENABLED=false` — zero runtime effect.
- Phase 3+: set `INTAKE_DECISION_LOOP_AUTHORITY=false` — revert to legacy pipeline.

---

## 6. Sign-off checkpoint

Proceed to Phase 3 cutover only when:

- Golden conversation suite ≥ 15/15 under decision-loop flag
- Shadow divergence < 5% on staging soak
- Real UI verification on upload → create store flow (per AGENT_TESTING_REPORTING_RULES.md)
