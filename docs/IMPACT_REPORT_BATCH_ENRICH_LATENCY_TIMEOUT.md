# Impact Report — Batch enrich timeout / ERR_HTTP_HEADERS_SENT

## What could break
- Other long-running APIs if LONG_RUNNING list is wrong
- Latency SLO / circuit breaker behaviour for enrichment paths
- QA Review `POST /api/business-candidates/batch/enrich` client UX

## Why
Default `API_REQUEST_TIMEOUT_MS` is **10s**. Live enrichment often takes **~24s**. `latencyGuard` sends **408** at 10s and opens `api_latency`, then the handler finishes and calls `res.json` → **ERR_HTTP_HEADERS_SENT**. Client sees NetworkError / “Unable to connect” even though enrichment may have written PARTIAL results.

## Impact scope
- `latencyGuard.js` long-running allowlist
- `businessCandidateRoutes.js` enrich response guard
- Optional: brief/media discover if same pattern

## Smallest safe patch
1. Treat `/api/business-candidates/batch/enrich` (and related candidate enrich paths) as long-running (120s default).
2. Before `res.json` / error responses on enrich: if `res.headersSent`, log and return (no double-send).
3. Do not open `api_latency` on timeout for long-running routes (already excluded from SLO on finish; timeout path still opens today — fix that for long-running).
