# Impact report: Multi-Agent Health CRITICAL (createParser)

## Observed

Performer Multi-Agent Health showed success 33.3% / error 66.7%, critical alerts, last error:

`config must be an object, got a function instead. Did you mean createParser({onEvent: fn})?`

## Root cause (sourced)

1. Dashboard `fetchSse.ts` called `createParser(fn)` — eventsource-parser v3 requires `createParser({ onEvent })`.
2. Browser `unhandledrejection` → `/api/runtime/diagnostics`.
3. `notifyRuntimeDiagnostic` recorded each as a **failed multi-agent mission**, collapsing success rate and firing CRITICAL alerts.

## Smallest safe patch

1. Fix `fetchSse.ts` for v3 API.
2. Skip bridging client `unhandledrejection` / createParser noise into mission history.
