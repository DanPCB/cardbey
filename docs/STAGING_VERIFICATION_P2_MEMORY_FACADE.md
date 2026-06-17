# Staging Verification Report — P2 Unified Memory Facade

**Date:** 2026-06-14  
**Environment:** Render staging  
**Core:** `https://cardbey-core-staging.onrender.com`  
**Dashboard:** `https://cardbey-dashboard-staging.onrender.com`  
**Git staging HEAD:** `dece00690` (feat P2 Unified Memory Facade)  
**Dashboard staging HEAD:** `133d30e` (dashboard integration)

---

## Executive Summary

| Category | Result | Notes |
|----------|--------|-------|
| Core health | **PASS** | `/api/health` returns 200 |
| P2 memory routes (`/api/memory/*`) | **FAIL** | Both `/bundle` and `/invalidate` return **404** |
| Legacy compatibility (`/api/intelligence/memory`) | **PASS** | 200 OK, valid bundle shape |
| Cache behavior | **INCONCLUSIVE** | Same `meta.fetchedAt` not observed; likely multi-instance + routes not live |
| Cache invalidation | **FAIL** | Route 404 |
| Partial failure handling | **PARTIAL** | No 500s; `meta.partial` not triggered for invalid store (models skipped) |
| Authenticated store-owner bundle | **NOT RUN** | No staging JWT available in CI shell |
| Dashboard integration | **PARTIAL** | Dashboard loads (200); facade route unavailable → fallback path expected |
| Performance (legacy endpoint) | **PASS** | p95 385ms, avg 194ms (< 500ms target) |

### Overall verdict: **NOT READY for production**

Primary blocker: **P2 API routes are not mounted on staging Core** despite the commit being on `origin/staging`. Legacy intelligence memory works, but the unified facade surface area (`/api/memory/bundle`, cache invalidation, dashboard-first client path) is not verifiable until Core redeploy succeeds.

---

## Test Results

| # | Test | Expected | Actual | Status | Evidence |
|---|------|----------|--------|--------|----------|
| 1 | API health | `{ ok: true, status: "ok" }` | `{ ok: true, env: "staging", timestamp: "..." }` | **PASS** | HTTP 200, 434ms |
| 2a | OPTIONS `/api/memory/bundle` | CORS preflight OK | HTTP **204**, `access-control-allow-origin: https://cardbey-staging.onrender.com` | **PASS** | Preflight succeeds (route may still 404 on POST) |
| 2b | POST `/api/memory/bundle` (guest) | 200 + `{ ok: true, bundle }` | HTTP **404** `{ "error": "Not found" }` | **FAIL** | 194ms |
| 3 | Authenticated bundle (store owner) | business, suitcase, user, session, mission | **Not executed** — no staging JWT in verification environment | **SKIP** | Requires manual login token |
| 4 | Cache (sequential POST) | 2nd request faster, same `meta.fetchedAt` | T1=181ms T2=205ms; `fetchedAt` **different** (`…58.326Z` vs `…58.734Z`); no `cacheHit` field | **INCONCLUSIVE** | Legacy endpoint only; multi-instance cache |
| 5 | POST `/api/memory/invalidate` | 200 OK | HTTP **404** `{ "error": "Not found" }` | **FAIL** | Route not mounted |
| 6 | Partial failure (invalid store) | 200, `meta.partial: true` | HTTP 200, `business.skipped: true`, `meta.partial: **false**` | **PARTIAL** | No 500; partial flag not set when models absent |
| 7 | Legacy `/api/intelligence/memory` | 200 backward compatible | HTTP **200**, valid bundle | **PASS** | 170ms; includes `meta.fetchDurationMs` |
| 8 | Dashboard browser console | Facade fetch OK, no `userId: null` | **Not executed** (requires browser login) | **MANUAL** | See manual checklist below |
| 9 | Performance p95 | < 500ms | **385ms** p95, **194ms** avg (10 requests, legacy endpoint) | **PASS** | Cold/warm Render variance |

### Additional observations

1. **Dashboard URL correction:** `https://cardbey-staging.onrender.com` returns **404**. Use **`https://cardbey-dashboard-staging.onrender.com`** (matches `render.yaml`).
2. **P2 schema marker:** Legacy response lacks `mission` field entirely. Local P2 `memoryAdapter` always emits `mission: null`. This strongly indicates **staging Core is not running commit `dece00690`** (or build artifact is stale).
3. **Intelligence layer healthy:** `/api/intelligence/health` → `{ ok: true, status: "ok", llmAvailable: true }`.
4. **Intake probe:** `/api/performer/intake/v2` → `{ status: "ok", version: "v2", env: "staging" }`.

---

## Performance Metrics

Measured against **`POST /api/intelligence/memory`** (only working memory endpoint on staging):

| Metric | Value |
|--------|-------|
| Requests | 10 (guest + sessionHints) |
| Min | 152 ms |
| Max | 385 ms |
| Average | 194.3 ms |
| p95 | 385 ms |
| Target | < 500 ms → **PASS** |

**Cache effectiveness:** Could not validate. In-process TTL cache is per Core instance; Render load-balances across instances, so repeated curls may hit different pods. Even with P2 live, cache hit verification should use:
- repeated requests in a short window **and**
- Render logs grep for `[MemoryFacade] Cache hit`

**Network request count:** Dashboard `memoryClient.ts` tries `/api/memory/bundle` first, then falls back to `/api/intelligence/memory`. With facade 404, each memory fetch likely incurs **2 HTTP attempts** (failed facade + legacy success) until Core deploy is fixed.

---

## Issues Found

### P0 — `/api/memory/*` returns 404 on staging Core

```
POST https://cardbey-core-staging.onrender.com/api/memory/bundle
→ 404 { "error": "Not found" }

POST https://cardbey-core-staging.onrender.com/api/memory/invalidate
→ 404 { "error": "Not found" }
```

**Likely causes:**
- Render deploy for `cardbey-core-staging` failed or is still on pre-P2 artifact
- Build succeeded but service not restarted
- Manual `USE_UNIFIED_MEMORY=false` on Render (not in `render.yaml`; default should enable routes)

**Impact:**
- Dashboard `memoryFacadeClient` fails first hop (fallback saves UX)
- Cache invalidation API unavailable
- P2 success criteria not met on staging

### P1 — Cache hit not observable via HTTP alone

Sequential legacy requests returned different `meta.fetchedAt` values. Not a definitive failure, but cache validation requires log inspection or sticky-session testing.

### P2 — Partial failure semantics differ from test spec

Invalid store ID with `store_owner` actor returns `business.skipped: true` and `meta.partial: false` when business memory tables/models are absent on staging Postgres. This is graceful (no 500) but does not match the spec’s `partial: true` expectation.

---

## Manual Checklist (Task 8 — Browser)

After Core redeploy, on `https://cardbey-dashboard-staging.onrender.com`:

1. Log in as store owner.
2. Open DevTools → Console.
3. Run:

```javascript
const token = localStorage.getItem('cardbey_dev_bearer');
const res = await fetch('https://cardbey-core-staging.onrender.com/api/memory/bundle', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    context: {
      actor: { type: 'store_owner' },
      storeId: '<your-store-id>',
      sessionId: 'browser-verify',
    },
  }),
});
const data = await res.json();
console.log('Status:', res.status, 'OK:', data.ok, 'Sources:', data.bundle?.meta?.sources);
```

4. Confirm **HTTP 200**, `data.ok === true`, bundle has `business`, `suitcase`, `user`, `session`, `mission`, `meta`.
5. Search console/network logs for `userId: null` — should be absent (P2 logs use `actor=<id>` or `anon:<type>`).

---

## Recommendations (before production)

1. **Verify Render deploy** for `cardbey-core-staging` against commit `dece00690`:
   - Render Dashboard → `cardbey-core-staging` → Events / Logs
   - Confirm build + deploy succeeded after push
   - If failed, fix build error and redeploy

2. **Confirm env:** `USE_UNIFIED_MEMORY` is unset or not `false` on staging Core.

3. **Re-run this verification suite** after redeploy. Critical pass gates:
   - `POST /api/memory/bundle` → 200
   - `POST /api/memory/invalidate` → 200 (with valid JWT)
   - Legacy `/api/intelligence/memory` still 200
   - Response includes `mission` key (even if null)

4. **Optional hardening:** Add a lightweight version endpoint (e.g. git SHA in `/api/health`) to avoid ambiguous deploy state in future verifications.

5. **Dashboard:** After Core fix, confirm single-request memory fetch (no double-hop fallback) in Network tab.

---

## Rollback (if verification continues to fail)

```bash
# Render → cardbey-core-staging → Environment
USE_UNIFIED_MEMORY=false

# Redeploy / restart service
```

Legacy `/api/intelligence/memory` remains available. Dashboard `memoryClient.ts` already falls back on facade failure.

---

## Commands Used (reproducible)

```bash
# Health
curl.exe -s https://cardbey-core-staging.onrender.com/api/health

# Guest memory (P2 route — currently 404)
curl.exe -s -X POST https://cardbey-core-staging.onrender.com/api/memory/bundle \
  -H "Content-Type: application/json" \
  -d "{\"context\":{\"actor\":{\"type\":\"guest\",\"id\":null}}}"

# Legacy memory (works)
curl.exe -s -X POST https://cardbey-core-staging.onrender.com/api/intelligence/memory \
  -H "Content-Type: application/json" \
  -d "{\"actor\":{\"type\":\"guest\",\"userId\":null},\"storeId\":null,\"sessionId\":\"verify\",\"sessionHints\":{\"recentEventTypes\":[\"attention_signal\"]}}"
```

---

## Production deployment gate

| Criterion | Staging status |
|-----------|----------------|
| All API tests 200 with correct structure | **NO** — `/api/memory/*` 404 |
| Cache faster on 2nd request | **Not verified** |
| Invalidation clears cache | **NO** — route 404 |
| Partial failures graceful (no 500) | **YES** (legacy path) |
| Legacy endpoint compatible | **YES** |
| Dashboard loads without errors | **YES** (200) |
| No `userId: null` logs | **Not verified** (manual) |
| Performance < 500ms p95 | **YES** (194ms avg, 385ms p95) |

**Recommendation:** **Do not merge to production** until `/api/memory/bundle` returns 200 on staging and authenticated bundle test passes.
