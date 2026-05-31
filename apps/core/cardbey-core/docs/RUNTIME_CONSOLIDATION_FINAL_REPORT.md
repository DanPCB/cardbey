## Runtime Consolidation — Final Report (Stages A–E)

**Status:** PASSED — Performer Runtime is operationally enforceable as the **Single Runway**.

### Executive summary

Cardbey execution authority is now consolidated such that:

- **All allowed execution is runtime-owned** (Performer Runtime kernel + runtime facades).
- **Legacy “direct_action” bypasses are blocked** (Stage D), with explicit proof.
- **Orphan (non-runtime-owned) dispatch is blocked** (Stage E), with explicit proof.
- Critical workflows remain intact: **S2/P1/P2**, **signage.list-devices**, **pipeline store missions**.

This completes the Phase 1.5 milestone: **Single Runway is enforceable** (without enabling orchestra blocking yet).

---

### Scope and constraints (kept)

- **No Phase 2 features introduced** (no dynamic routing, autonomous orchestration, graph-native execution, ACP optimizations, scoring, or optimization logic).
- Changes were restricted to **staged routing + guards + telemetry** to prove operational authority consolidation safely.

---

### Rollout stages and what each stage guarantees

| Stage | Flag(s) enabled | Guarantee |
|------:|------------------|----------|
| A | `BROKER_DIRECT_VIA_FACADE=true` | Intake “direct tool” executes through `executeMissionAction` facade (not raw tool dispatch). |
| B | `PERFORMER_RUNTIME_ENABLED=true` | Intake “direct tool” executes through `performerRuntime.execute()` (runtime-owned). |
| C | `PERFORMER_RUNTIME_PIPELINE_FACADE=true` | Mission pipeline steps execute via `executeRuntimeAction` facade (runtime-owned). |
| D | `BROKER_BLOCK_DIRECT_ACTION=true` | Legacy `direct_action` bypass is rejected; runtime/facade-owned execution remains allowed. |
| E | `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true` | **No execution without runtime ownership** (hard block). |

Orchestra bypass blocking remains explicitly off:

- `BROKER_BLOCK_ORCHESTRA_WITH_MISSION=false`

---

### Evidence and acceptance criteria (met)

**Stage A–E:** Verified via live `GET /api/broker/runtime-authority` snapshots and controlled reruns.

**Functional validations (must-pass):**

- **S2** (store analyze/update) — PASS
- **P1** (offer draft create) — PASS
- **P2** (offer revise) — PASS
- **signage.list-devices** (intake direct tool) — PASS
- **Pipeline store mission** (mission create + `run-until-blocked`) — PASS (no stuck runs)

**Authority/guard proofs (explicit):**

- **Stage D direct bypass proof:** dev-only probe returns **`BROKER_DIRECT_ACTION_BLOCKED`**
- **Stage E orphan block proof:** dev-only orphan dispatch returns **`RUNTIME_OWNERSHIP_REQUIRED`**

**Operational signals (normal flow):**

- `orphanWarnings` stays **0**
- `ownershipBlocks` stays **0**
- `duplicationWarnings` stays **0**
- `bypassDirectDispatch` stays **0**

---

### What is now “Single Runway”

With Stage E enabled, **tool execution that is not runtime-owned is blocked**. In practice:

- Runtime/facade-owned flows continue to work (mission pipeline and intake runtime paths).
- Legacy bypass paths can no longer silently execute tools outside Performer Runtime ownership.

---

### Recommended Stage E “stable” staging defaults

See `.env.example` “Stage E stable” block. Key points:

- Keep:
  - `BROKER_EXECUTION_TELEMETRY=true`
  - `BROKER_DIRECT_VIA_FACADE=true`
  - `PERFORMER_RUNTIME_ENABLED=true`
  - `PERFORMER_RUNTIME_PIPELINE_FACADE=true`
  - `BROKER_BLOCK_DIRECT_ACTION=true`
  - `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true`
- Keep OFF until validated:
  - `BROKER_BLOCK_ORCHESTRA_WITH_MISSION=false`

---

### Production hardening / safety notes

- Dev-only probe endpoints are **never mounted** when `NODE_ENV=production`.
- Rollback remains safe and staged (disable in reverse order).

---

### Rollback plan (reverse order)

Disable in reverse order, one stage at a time:

```env
# E rollback
PERFORMER_RUNTIME_OWNERSHIP_BLOCK=false

# D rollback (optional after E rollback)
BROKER_BLOCK_DIRECT_ACTION=false

# C rollback
PERFORMER_RUNTIME_PIPELINE_FACADE=false

# B rollback
PERFORMER_RUNTIME_ENABLED=false

# A rollback
BROKER_DIRECT_VIA_FACADE=false

# keep telemetry on for visibility
BROKER_EXECUTION_TELEMETRY=true
```

Restart Core API after each change.

---

### What remains before Phase 2

1. **Soak test** with normal UI flows under Stage E stable defaults.
2. Keep `BROKER_BLOCK_ORCHESTRA_WITH_MISSION=false` until orchestra path is explicitly validated.
3. Continue monitoring:
   - `broker.runtime.violation`
   - `broker.runtime.bypass`
   - `broker.runtime.duplication`

Once soak is clean, Cardbey is ready to begin Phase 2 workstreams:

- IntentGraph
- CapabilityGraph
- OutcomeGraph
- ActionGraph
- dynamic routing
- agent scoring
- execution optimization

