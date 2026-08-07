# Impact report: Multi-Agent Health CRITICAL (createParser)

## Observed

Performer Multi-Agent Health showed success 33.3% / error 66.7%, critical alerts, last error:

`config must be an object, got a function instead. Did you mean createParser({onEvent: fn})?`

Agents idle at 0ms; active missions 0.

## Root cause (sourced)

1. Dashboard `src/lib/adminApi/fetchSse.ts` called `createParser(fn)` — **eventsource-parser v3** requires `createParser({ onEvent })`.
2. Failure surfaces as browser `unhandledrejection` → posted to `/api/runtime/diagnostics`.
3. `diagnosticStore` bridges every error diagnostic via `notifyRuntimeDiagnostic`, which **records a fake failed mission** into multi-agent metrics.
4. Metrics/alerts then report CRITICAL even though Intent/Planner/etc. were not processing those “missions”.

## What could break

| Risk | Scope |
|------|--------|
| Store pulse / admin SSE clients that relied on v1/v2 callback shape | `connectFetchSse` consumers |
| Fewer multi-agent alerts from pure client unhandledrejections | Monitoring noise reduction (intentional) |

## Smallest safe patch

1. Update `fetchSse.ts` to v3 `createParser({ onEvent })`.
2. Do not bridge client `unhandledrejection` / createParser noise into multi-agent mission history.
3. Do **not** add circuit breakers / new health APIs in this patch (out of scope for the confirmed root cause).
