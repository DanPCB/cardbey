# Phase 9 — EXECUTION_MODE Flag Consolidation

## Summary

Execution authority is now controlled by a single canonical env var:

```bash
EXECUTION_MODE=kernel   # production default
EXECUTION_MODE=hybrid   # transitional rollout
EXECUTION_MODE=legacy   # emergency rollback only
```

## Scope (minimal / Option A)

`EXECUTION_MODE` governs **execution authority only**:

| Concern | Controlled by |
|---------|----------------|
| Kernel mandatory enforcement | `EXECUTION_MODE` |
| Runtime kernel / step execution / shared registry | `EXECUTION_MODE` |
| Broker direct-action routing | `EXECUTION_MODE` |
| Performer runtime + pipeline facade | `EXECUTION_MODE` |
| Mission graph, skill runtime, queues, etc. | Separate capability flags (unchanged) |

## Mode presets

### `kernel` (default)

- Kernel mandatory: **on**
- Runtime kernel / step execution / shared registry: **on**
- Broker direct via facade: **on**
- Broker block direct action: **on**
- Performer runtime + pipeline facade: **on**

### `hybrid`

- Same as kernel except broker direct block: **off**
- For staged migration when some legacy direct paths must remain open

### `legacy`

- Kernel mandatory: **off**
- Runtime kernel / shared registry: **off**
- Broker enforcement: **off**
- Logs `[execution-mode] legacy mode active` on boot

## Backward compatibility

When `EXECUTION_MODE` is **unset**, behavior is derived from legacy env flags (same semantics as pre-Phase 9):

| Legacy signal | Inferred mode |
|---------------|---------------|
| `EMERGENCY_BYPASS_KERNEL` or `DISABLE_KERNEL_MANDATORY` | `legacy` |
| `BROKER_BLOCK_DIRECT_ACTION=false` | `hybrid` |
| Otherwise | `kernel` |

Deprecated flags log a migration hint: prefer `EXECUTION_MODE`.

When `EXECUTION_MODE` is **explicit**, preset values win; deprecated authority flags are ignored (with a warning if still set).

## Code changes

| Module | Change |
|--------|--------|
| `executionMode.js` | New canonical resolver + presets |
| `kernelMandatory.js` | Delegates authority booleans |
| `runtimeFlags.js` | Delegates performer runtime authority |
| `brokerFlags.js` | Delegates broker authority |
| `runtimeCapabilitiesService.js` | Kernel capabilities read from execution mode |
| `runtimeAuthorityStaging.js` | Snapshot includes `executionMode` |

## Tests

```bash
cd apps/core/cardbey-core
npx vitest run src/lib/runtime/__tests__/executionMode.test.js \
  src/lib/runtime/performerRuntime/runtimeAuthorityStaging.test.js \
  src/lib/broker/brokerRunwayGuard.test.js \
  tests/runtimeCapabilities.test.js \
  src/__tests__/kernel/bypassRemoval.test.js
```

## Migration

1. Add `EXECUTION_MODE=kernel` to production `.env`
2. Remove deprecated authority flags once validated
3. Use `EXECUTION_MODE=legacy` only for emergency rollback (never in production)
