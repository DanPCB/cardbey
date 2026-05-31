# Phase F — Legacy Bypass Closure Plan (GATED)

**Status:** NOT STARTED — blocked until **Phase E** staging soak passes (API + soak script + Performer UI verification).

**Goal:** Audit and gradually close legacy execution bypasses so all proactive/tool dispatch flows through Runtime Kernel authority.

---

## Prerequisite gate

Before any Phase F work:

1. `GET /api/runtime/capabilities` → `runtimeKernelRollout.rolloutStage` = `PHASE_E`
2. `node scripts/runtime-kernel-staging-soak.mjs` with `EXPECTED_RUNTIME_KERNEL_STAGE=PHASE_E` → PASS
3. Performer UI checklist in `docs/RUNTIME_KERNEL_STAGING_SOAK.md` → signed off
4. `docs/STAGE_E_SOAK_TEST.md` broker authority soak still clean (parallel track)

---

## Audit scope (Phase F — planning only)

Each bypass gets: **(1) what could break**, **(2) impact scope**, **(3) smallest safe patch**, **(4) flag for gradual closure**.

| # | Bypass surface | Current role | Closure target |
|---|----------------|--------------|----------------|
| 1 | `POST /api/mi/orchestra/start` | MI orchestra with optional `missionId` bypass | Block or facade through runtime when mission-bound |
| 2 | `POST /api/draft-store/*` | Draft runway shortcuts | Route through kernel step / graph node where overlapping |
| 3 | `POST /api/performer/proactive-step` (fallback) | Legacy proactive step when orchestrator flags OFF | Remove fallback once B+ stable in staging + prod |
| 4 | Client `executeCapabilityPlan` | Frontend-owned step loop | Viewer-only; all sequencing via `run-next` / `run-all` |
| 5 | MCP dispatch bypass | Direct tool dispatch outside broker/runtime | Facade or block under ownership flags |

---

## Recommended closure order (after gate)

1. **Document** — extend `docs/RUNTIME_OWNERSHIP_GAP_MAP.md` with Phase F entries
2. **Measure** — enable telemetry on bypass paths; baseline `bypassDirectDispatch` in staging
3. **Flag each closure** — one bypass per deploy + soak (same discipline as B–E)
4. **Frontend last** — `executeCapabilityPlan` removal only after backend paths proven

---

## Explicit non-goals (Phase F)

- No new orchestration features
- No distributed workers
- No schema migrations unless audit proves unavoidable
- No production enforcement until staging soak per bypass

---

## Deliverables (when unblocked)

- [ ] `docs/IMPACT_REPORT_PHASE_F_LEGACY_BYPASS.md` — per-surface impact reports
- [ ] Feature flags per bypass closure (default OFF)
- [ ] Soak extension or dedicated `scripts/phase-f-bypass-audit.mjs`
- [ ] Performer Console migration checklist (viewer-only confirmation)

**Do not implement until Phase E soak passes.**
