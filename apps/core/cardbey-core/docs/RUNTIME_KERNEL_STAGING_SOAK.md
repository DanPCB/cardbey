# Runtime Kernel Staging Soak + Flag Enablement

**Purpose:** Safely enable Runtime Kernel phases in staging — **one phase per deploy + soak pass**. Do not enable B–E all at once.

**Status:** Staged enablement + soak validation (no further implementation until Phase E soak is green).

---

## Rollout rule (locked)

```
Foundation → deploy → soak → Performer check
    → Phase B → deploy → soak → Performer check
        → Phase C → …
            → Phase D → …
                → Phase E → full soak → gate Phase F
```

**Never** uncomment the full stack block in `.env.staging.runtime-kernel.example` until each prior phase has passed independently.

---

## Rollout phases

| Stage | Env flags to add (cumulative) | `rolloutStage` |
|-------|-------------------------------|----------------|
| **Foundation** | `ENABLE_PERFORMER_RUNTIME_KERNEL`, `ENABLE_RUNTIME_STEP_EXECUTION`, `ENABLE_SHARED_RUNTIME_TOOL_REGISTRY`, `ENABLE_PROACTIVE_CAMPAIGN_RUNWAY` | `FOUNDATION` |
| **Phase B** | + `ENABLE_RUNTIME_MISSION_ORCHESTRATOR` | `PHASE_B` |
| **Phase C** | + `ENABLE_RUNTIME_MISSION_GRAPH`, `ENABLE_RUNTIME_GRAPH_SCHEDULER` | `PHASE_C` |
| **Phase D** | + `ENABLE_RUNTIME_SKILL_RUNTIME`, `ENABLE_RUNTIME_WORKER_MANAGER`, `ENABLE_RUNTIME_EXECUTION_LEASES` | `PHASE_D` |
| **Phase E** | + `ENABLE_RUNTIME_EXECUTION_QUEUE`, `ENABLE_RUNTIME_LEASE_RECOVERY`, `ENABLE_RUNTIME_REPLAY_PROTECTION`, `ENABLE_RUNTIME_HEARTBEAT_MONITOR` | `PHASE_E` |

Live check:

```bash
curl -s $API_BASE/api/runtime/capabilities | jq '.runtimeKernelRollout.rolloutStage, .runtimeKernelRollout.recommendations'
```

---

## Per-phase runbook

For **each** phase (Foundation through E):

### 1. Enable flags

Copy the **next section only** from `.env.staging.runtime-kernel.example` → Render **cardbey-core-staging** Environment.

### 2. Deploy / restart

Redeploy staging API so capabilities re-init at boot.

### 3. API verification

| Check | Command / expectation |
|-------|----------------------|
| Rollout stage | `GET /api/runtime/capabilities` → `runtimeKernelRollout.rolloutStage` **matches expected phase** |
| Next-step hints | `runtimeKernelRollout.recommendations.nextStage` points to the *following* phase (or null at E) |
| Broker authority | `GET /api/broker/runtime-authority` → `rolloutStage` still E (broker) — independent track |

### 4. Soak script

From `apps/core/cardbey-core`:

```bash
node scripts/ensure-soak-fixture.mjs   # first time only

# Capabilities + authority (no mission execution)
RUNTIME_KERNEL_SOAK_USE_MOCK=true node scripts/runtime-kernel-staging-soak.mjs

# Full probe (Phase B+)
EXPECTED_RUNTIME_KERNEL_STAGE=PHASE_B node scripts/runtime-kernel-staging-soak.mjs
# … repeat with PHASE_C, PHASE_D, PHASE_E as you advance
```

**Pass:** soak prints `PASS` and `authority metrics clean` (no deltas on `orphanWarnings`, `ownershipBlocks`, `duplicationWarnings`, `bypassDirectDispatch`).

Phase-specific metadata checks (after run-next probe):

| Phase | Metadata expectation |
|-------|---------------------|
| B | Orchestrator responds (not 503); `orchestrationState` / step status updated |
| C | `metadataJson.runtimeMissionGraph` present |
| D | `metadataJson.runtimeWorkerState.workers` present |
| E | `metadataJson.runtimeExecutionQueue.items` present |

### 5. Performer UI verification (manual, each phase)

Open Performer Console on staging dashboard against staging core:

- [ ] **No duplicate runway** — single execution path; no parallel client + server loops for the same step
- [ ] **No orphan mission** — mission stays attached to session; refresh rehydrates cleanly
- [ ] **No fake completion** — step marked complete only after kernel/orchestrator success; stream events match outcome
- [ ] Stream shows expected lifecycle events for enabled phase (`runtime.orchestration.*`, `runtime.graph.*`, `runtime.worker.*`, `runtime.queue.*` as applicable)
- [ ] Run proactive plan **Run next** / **Run all** once; behavior matches capability flags (orchestrator POST when B+)

**Do not advance** until API + soak + Performer checklist all pass.

### 6. Record sign-off

Note in deploy log: phase, date, `rolloutStage` snapshot, soak PASS, Performer OK.

---

## Rollback (any phase)

Disable flags for **current phase only** (reverse order: E → D → C → B). Restart API. Re-run soak. Confirm `rolloutStage` regressed one step.

Foundation flags can remain on while rolling back B+ if kernel step execution is still desired.

---

## npm scripts

```bash
pnpm --filter @cardbey/core soak:runtime-kernel:mock
pnpm --filter @cardbey/core soak:runtime-kernel
pnpm --filter @cardbey/core soak:stage-e    # broker Single Runway (separate track)
```

---

## Gate: Phase F (do not start until Phase E soak passes)

After **Phase E** staging soak is green (API + soak + Performer UI), the next work item is:

**Phase F — Legacy Bypass Closure Plan**

See `docs/PHASE_F_LEGACY_BYPASS_CLOSURE_PLAN.md` (audit + gradual closure only — not started until E is validated).

---

## Related docs

- `.env.staging.runtime-kernel.example` — flag template
- `docs/RUNTIME_STAGING_TEST_MATRIX.md` — broader broker/performer matrix
- `docs/STAGE_E_SOAK_TEST.md` — broker Stage E authority soak
- Phase impact reports: `IMPACT_REPORT_RUNTIME_MISSION_ORCHESTRATOR.md` through `IMPACT_REPORT_RUNTIME_DURABLE_EXECUTION.md`
