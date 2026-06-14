# Runtime Authority Flag Profile (Sprint 1)

Recommended **local / staging** environment for Runtime Authority Enforcement Sprint 1.

## Core runtime gateway (enable together)

```env
PERFORMER_RUNTIME_ENABLED=true
PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true
ENABLE_PERFORMER_RUNTIME_KERNEL=true
```

| Flag | Purpose |
|------|---------|
| `PERFORMER_RUNTIME_ENABLED` | Route user-initiated execution through `performerRuntime.execute()` |
| `PERFORMER_RUNTIME_OWNERSHIP_BLOCK` | Block `dispatchTool` when context is not runtime-owned |
| `ENABLE_PERFORMER_RUNTIME_KERNEL` | Enable runtime kernel step authority layer |

## Supporting visibility (recommended ON in staging)

```env
PERFORMER_RUNTIME_OWNERSHIP_WARN=true
PERFORMER_RUNTIME_UNIFIED_STREAM=true
PERFORMER_RUNTIME_STATE_PERSIST=true
BROKER_EXECUTION_TELEMETRY=true
PERFORMER_RUNTIME_DUPLICATION_DETECT=true
```

## Phase F hard blocks (staged individually — default OFF)

Do **not** enable all at once until gauntlet passes in staging.

```env
# PHASE_F_BLOCK_LEGACY_INTAKE=false
# PHASE_F_BLOCK_SKILL_ROUTER_DIRECT=false
# PHASE_F_BLOCK_ORCHESTRA_START=false
# PHASE_F_BLOCK_UI_DRAFT_WRITES=false
# PHASE_F_BLOCK_UI_PUBLISH=false
```

See `docs/PHASE_F_LEGACY_BYPASS_CLOSURE_PLAN.md` for rollout order.

## Sprint 1 behavior without Phase F flags

With the profile above:

1. **Intake V2** tool fallback always calls `performerRuntime.execute()` (no direct `dispatchTool`).
2. **SkillRouter** routes skills via `executeRuntimeAction({ actionType: 'run_skill' })`.
3. **Orchestra start** enters through `performerRuntime.execute({ actionType: 'orchestra_start' })`.
4. **dispatchTool** throws `RUNTIME_AUTHORITY_BYPASS` in `NODE_ENV=development` when called without `runtimeOwned` context; warns + telemetry in production.

## Rollback

Unset in reverse order:

1. `PERFORMER_RUNTIME_OWNERSHIP_BLOCK=false`
2. `ENABLE_PERFORMER_RUNTIME_KERNEL=false`
3. `PERFORMER_RUNTIME_ENABLED=false`

Keep `BROKER_EXECUTION_TELEMETRY=true` for visibility during rollback.

## Verification

```bash
cd apps/core/cardbey-core
node scripts/runtime-authority-sprint1-gauntlet.mjs
curl http://localhost:3001/api/broker/runtime-authority
```

Expect `metrics.runtimeAuthorityPathUsed > 0` and `metrics.runtimeAuthorityBypass === 0` after gauntlet scenarios.
