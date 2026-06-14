# Runtime Authority Enforcement — Sprint 1 Exit Report

**Date:** 2026-06-12  
**Scope:** Close top 5 execution bypasses; no Creative Factory, no Mission Runtime rewrite, no skill removal.

---

## Objective

Convert Performer Runtime from optional path into mandatory execution gateway for highest-risk paths:

```
User Intent → Performer Runtime → Mission FSM / Skill Execution → Tool Execution → Artifact Authority
```

---

## Changed Files

| File | Change |
|------|--------|
| `src/lib/runtime/performerRuntime/runtimeAuthorityGuard.js` | **NEW** — guard, path-used/bypass telemetry |
| `src/lib/runtime/performerRuntime/runtimeAuthorityGuard.test.js` | **NEW** — guard unit tests |
| `src/lib/runtime/performerRuntime/orchestraRuntimeAdapter.js` | **NEW** — orchestra start runtime envelope |
| `src/lib/runtime/performerRuntime/executeRuntimeAction.js` | Added `run_skill`, `orchestra_start` action types |
| `src/lib/runtime/performerRuntime/runtimeAuthorityStaging.js` | Metrics: `runtimeAuthorityPathUsed`, `runtimeAuthorityBypass` |
| `src/lib/runtime/performerRuntime/index.js` | Export guard + orchestra adapter |
| `src/lib/toolDispatcher.js` | `assertRuntimeAuthorityContext` before dispatch |
| `src/lib/skills/SkillRouter.js` | Route skills via `executeRuntimeAction({ actionType: 'run_skill' })` |
| `src/lib/skills/__tests__/SkillRouter.test.js` | Mock runtime path |
| `src/routes/performerIntakeV2Routes.js` | Tool fallback always `performerRuntime.execute()` |
| `src/routes/miRoutes.js` | Orchestra start wrapped via runtime adapter |
| `scripts/runtime-authority-sprint1-gauntlet.mjs` | **NEW** — static + in-process gauntlet |
| `docs/RUNTIME_AUTHORITY_FLAG_PROFILE.md` | **NEW** — recommended staging flags |

---

## Bypasses Closed (Sprint 1)

| # | Bypass | Status |
|---|--------|--------|
| 1 | Intake V2 default → direct `dispatchTool()` | **CLOSED** — always `performerRuntime.execute()` + `RUNTIME_AUTHORITY_PATH_USED` |
| 2 | `SkillRouter.route()` → direct `SkillExecutor.execute()` | **CLOSED** — `run_skill` via `executeRuntimeAction` |
| 3 | Unguarded `dispatchTool()` outside runtime | **CLOSED** — dev throws `RUNTIME_AUTHORITY_BYPASS`; prod warns + telemetry |
| 4 | `POST /api/mi/orchestra/start` direct entry | **CLOSED** — runtime prelude via `orchestraRuntimeAdapter` |
| 5 | Runtime authority flags default OFF | **DOCUMENTED** — staging profile in `RUNTIME_AUTHORITY_FLAG_PROFILE.md` |

---

## Bypasses Remaining

| Area | Notes |
|------|-------|
| UI direct writes | Hero PATCH, publish, Content Studio uploads — not in Sprint 1 code changes |
| Mission pipeline internal paths | Some steps may still call tools with owned context only when facade flag ON |
| TS `SkillRuntime` parallel path | Unchanged; cooperative gate in intake still applies for non-legacy triggers |
| MCP / maintenance / cron | Direct `dispatchTool` callers outside user-initiated paths — will throw in `NODE_ENV=development` unless context marked |
| Phase F hard blocks | Individual `PHASE_F_BLOCK_*` flags remain default OFF |
| Vision intake, document ingestion routes | May need runtime wrapping in Sprint 2 |

---

## Gauntlet Result

```bash
cd apps/core/cardbey-core
node scripts/runtime-authority-sprint1-gauntlet.mjs
```

**Result: PASS**

| Check | Outcome |
|-------|---------|
| Static: intake_v2 → performerRuntime | PASS |
| Static: skill_router → run_skill | PASS |
| Static: dispatchTool guard | PASS |
| Static: orchestra adapter wired | PASS |
| In-process: 7 scenarios | 7× `RUNTIME_AUTHORITY_PATH_USED`, 0× bypass |
| Unit tests (guard, SkillRouter, staging) | 13/13 PASS |

Scenarios covered: create video, create store, launch campaign, generate slideshow, dashboard start, approval checkpoint, resume after approval (in-process simulation).

---

## Before / After Score Estimate

| Dimension | Before (Phase F audit) | After Sprint 1 |
|-----------|------------------------|----------------|
| Intake V2 mandatory runtime | Optional (flag OFF → direct dispatch) | **Mandatory** |
| SkillRouter mandatory runtime | No (direct executor) | **Mandatory** |
| dispatchTool guard | Ownership warn/block only | **Authority guard** (dev throw) |
| Orchestra start runtime | Direct handler | **Runtime prelude** |
| Overall runtime authority score | ~57/100 (RED) | **~72/100 (AMBER)** |

Remaining gap to GREEN (~85+): UI write elimination, Phase F block flags enabled in staging soak, full E2E gauntlet against live server with auth.

---

## Mandatory Runtime Verdict

| Path | Mandatory after Sprint 1? |
|------|---------------------------|
| Intake V2 tool fallback | **YES** — no flag gate; always `performerRuntime.execute()` |
| SkillRouter skill execution | **YES** — always `executeRuntimeAction({ actionType: 'run_skill' })` |
| Orchestra start | **YES** — runtime envelope before internal handler |
| All dispatchTool calls | **Guarded** — owned context required; dev throws on bypass |

---

## Final Verdict: Can Creative Factory Work Safely After This Sprint?

### **NO**

**Why not yet:**

1. **UI direct state writes** (hero PATCH, publish, uploads) still bypass Performer Runtime — Creative Factory cannot rely on a single execution authority for artifact mutations.
2. **Dual skill systems** (JS `SkillExecutor` + TS `SkillRuntime`) remain; Creative Factory needs one canonical skill runway.
3. **E2E gauntlet** validates static wiring and in-process telemetry, not full authenticated flows against a running server with all 7 scenarios end-to-end.
4. **Development-mode throws** on orphan `dispatchTool` will surface remaining internal callers that need runtime wrapping before Creative Factory agents can run safely in dev.

**What Sprint 1 did achieve:** The four highest-volume user-initiated bypasses (Intake V2, SkillRouter, orchestra start, unguarded dispatchTool) now route through or are guarded by Performer Runtime. This is the necessary foundation for Creative Factory, but not sufficient for safe operation.

---

## Recommended Next Steps (Sprint 2)

1. Wrap UI write paths (hero, publish, uploads) through runtime-governed mission actions.
2. Enable staging flag profile and run live E2E gauntlet with auth tokens.
3. Migrate remaining direct `dispatchTool` call sites (vision intake, MCP, maintenance) to runtime-owned context.
4. Enable Phase F block flags individually after zero bypass metrics in staging soak.

See also: `docs/RUNTIME_AUTHORITY_FLAG_PROFILE.md`, `docs/RUNTIME_AUTHORITY_CLOSURE_REPORT.md`.
