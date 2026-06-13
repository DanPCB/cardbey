# Runtime Kernel Mandatory — Implementation Report

**Date:** 2026-06-13  
**Priority:** P0 — Make Runtime Kernel the only execution authority

---

## Verdict

**Partial P0 complete** — Core enforcement layer is in place: kernel flags default ON, broker blocks direct dispatch by default, `skipDirectGuard` removed codebase-wide, proactive-step legacy fork removed, classifier/registry tools route through `proactive_plan`, intake shortcuts disabled under kernel mandatory mode.

**Not yet complete:** Full removal of all shortcut code paths, dashboard `executeProactiveStepFromIntent` intake bypass, unified capability-selection module, and 100% test suite green.

---

## Success criteria checklist

| Criterion | Status |
|-----------|--------|
| No execution outside kernel (unauthorized sources blocked) | **YES** — `assertKernelAuthorizedExecution` + broker guard |
| `direct_action` removed from classifier/registry | **YES** — registry → `proactive_plan`; classifier normalizes legacy LLM output |
| `skipDirectGuard: true` removed | **YES** — 0 occurrences in repo |
| `ENABLE_RUNTIME_STEP_EXECUTION` flag removed | **Partial** — replaced by default-ON + `DISABLE_RUNTIME_STEP_EXECUTION` opt-out |
| Legacy proactive-step fork deleted | **YES** |
| All tests pass | **Partial** — kernel + capabilities + factory bypass + performerRuntime tests pass |
| Canary deployment | **Not run** (code ready) |

---

## Files created

| File | Purpose |
|------|---------|
| `src/lib/runtime/kernelMandatory.js` | Default-ON kernel mode, authorized sources, classification normalize |
| `src/lib/runtime/emergencyBypass.js` | `EMERGENCY_BYPASS_KERNEL` catastrophic rollback |
| `src/lib/runtime/kernelAudit.js` | In-process audit + SkillDispatchLog best-effort |
| `tests/runtime/kernelMandatory.test.js` | Enforcement unit tests |

---

## Files modified (core)

| File | Change |
|------|--------|
| `src/lib/runtime/runtimeCapabilitiesService.js` | Kernel caps default `true`; `DISABLE_*` opt-out |
| `src/lib/runtime/performerRuntime/runtimeFlags.js` | Delegates to `kernelMandatory.js` |
| `src/lib/runtime/performerRuntimeKernel.js` | Kernel flags + audit on step complete |
| `src/lib/runtime/performerRuntime/executeRuntimeAction.js` | Kernel auth + broker guard always; removed `skipDirectGuard` |
| `src/lib/broker/brokerFlags.js` | `BROKER_BLOCK_DIRECT_ACTION` defaults **block** |
| `src/lib/broker/brokerRunwayGuard.js` | Emergency bypass + source logging |
| `src/routes/performerProactiveStepRoutes.js` | Kernel-only path (legacy runway deleted) |
| `src/routes/performerIntakeV2Routes.js` | Shortcuts gated; `direct_action` returns `KERNEL_EXECUTION_REQUIRED`; normalize before plan |
| `src/lib/intake/intakeToolRegistry.js` | All tools `executionPath: proactive_plan` |
| `src/lib/intake/intakeClassifier.js` | `normalizeClassificationForKernel` on output |
| `src/lib/factoryRuntime/factoryIntentRouter.js` | Removed `skipDirectGuard` |
| `src/lib/missionPipelineOrchestrator.js` | Removed `skipDirectGuard` |
| `src/lib/skills/SkillRouter.js` | Removed `skipDirectGuard` |
| `src/lib/runtime/performerRuntime/uiRuntimeActionService.js` | Removed `skipDirectGuard` |
| `src/lib/runtime/performerRuntime/orchestraRuntimeAdapter.js` | Removed `skipDirectGuard` |
| `src/routes/performerRuntimeRoutes.js` | Removed `skipDirectGuard` |
| `.env.example` | Documented `DISABLE_*` / `EMERGENCY_BYPASS_KERNEL` |

---

## Bypass audit (post-change)

```bash
rg skipDirectGuard apps/core/cardbey-core   # → 0 matches
rg "skipDirectGuard" apps/core/cardbey-core # → 0 matches
```

**Authorized runtime sources:** `performer_proactive_step`, `runtime_kernel`, `factory_intent_router`, `skill_router`, `run_mission_until_blocked`, `ui_*`, etc. (see `KERNEL_AUTHORIZED_RUNTIME_SOURCES` in `kernelMandatory.js`).

**Blocked by default:** `intake_v2` direct `executeRuntimeAction`, unguarded tool dispatch.

---

## Rollback (< 5 minutes)

```bash
# Catastrophic rollback — restores legacy bypass behavior
EMERGENCY_BYPASS_KERNEL=true

# Surgical disable
DISABLE_KERNEL_MANDATORY=true
DISABLE_RUNTIME_STEP_EXECUTION=true
BROKER_BLOCK_DIRECT_ACTION=false
```

Restart Core API after env change.

---

## Operator steps

```bash
cd apps/core/cardbey-core
# Remove stale ENABLE_*=false from local .env if present
npx vitest run tests/runtime/kernelMandatory.test.js tests/runtimeCapabilities.test.js
node scripts/repair-sqlite-schema.mjs   # if DB drift
node --import tsx scripts/dev-api-entry.mjs
```

---

## Known follow-ups

1. Remove dead `if (false && direct_action)` block in `performerIntakeV2Routes.js` after soak period.
2. Route dashboard `executeProactiveStepFromIntent` through intake POST (currently still calls kernel API directly).
3. Delete shortcut handler bodies once proactive_plan soak validates.
4. Update `runtimeKernelStaging.js` recommendations to use `DISABLE_*` wording instead of `ENABLE_*`.
5. Run full CI / E2E suite before production canary.
