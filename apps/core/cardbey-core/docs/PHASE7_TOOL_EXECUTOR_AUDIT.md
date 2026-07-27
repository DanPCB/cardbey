# Phase 7 — Tool Executor Audit

Programmatic source of truth: `src/lib/execution/toolExecutorAudit.js`

Run audit report in Node:

```js
import { buildToolExecutorAuditReport } from './src/lib/execution/toolExecutorAudit.js';
console.log(JSON.stringify(buildToolExecutorAuditReport(), null, 2));
```

## Kernel routing model

| Route | Meaning | Examples |
|-------|---------|----------|
| `dedicated_checkpoint` | Dedicated `dispatchCreate*ViaKernel` wrapper; blocked from generic intake | `create_store`, `create_campaign`, `launch_campaign`, `activate_campaigns` |
| `generic_kernel` | `dispatchToolViaKernel` → `executeRuntimeAction` | All other registered executors (~120+) |
| `pipeline_internal` | Mission pipeline step runners only | `mission.checkpoint`, `structured_store_build` |

## KERNEL_ONLY_INTAKE_TOOLS

Tools blocked from `dispatchIntakeToolViaUnifiedKernel` and maintenance direct bypass:

- `create_store`, `create_campaign` — use `dispatchCreateStoreViaKernel` / `dispatchCreateCampaignViaKernel`
- `launch_campaign` — legacy; route to `create_campaign` checkpoint pipeline
- `activate_campaigns` — governance-sensitive; mission pipeline only

## Documented direct-dispatch exceptions

Still allowed outside kernel for internal orchestration (see `DIRECT_DISPATCH_ALLOWLIST`):

- `business_operations_api`
- `factory_runtime_internal`
- `vision_orchestration_internal`
- `capability_api_internal`

## Phase 7 changes

1. **`dispatchToolViaKernel`** — generic kernel wrapper for all tools
2. **`toolExecutorAudit.js`** — audit report + regression tests
3. **Expanded `KERNEL_ONLY_INTAKE_TOOLS`**
4. **Maintenance routes** — `/maintenance/confirm` and `/maintenance/health` use `maintenanceDispatchTool` (kernel when mandatory)
5. **Unified events** — `dispatchToolViaKernel` emits canonical `execution.step.*` when `missionId` is present

## Tests

- `src/lib/execution/__tests__/toolExecutorAudit.test.js`
- `src/lib/execution/__tests__/kernelPipelineDispatch.test.js` (`dispatchToolViaKernel`)
- `src/lib/intake/__tests__/intakeShortcutPolicy.test.js`
- `src/lib/intake/__tests__/intakeKernelToolDispatch.test.js`
