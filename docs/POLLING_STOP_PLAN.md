# Polling stop plan – Draft Review → Publish flow

## 1) PLAN (no code)

### A) Poll sources for the four endpoints

| Endpoint | File(s) | Function / mechanism | Interval / trigger |
|----------|---------|----------------------|--------------------|
| **GET /api/mi/orchestra/job/:jobId** | `useOrchestraJobUnified.ts` | `setInterval` in effect after initial fetch | **1250 ms** (when job non-terminal). Stops when `isJobTerminal(status)` or no subscribers or 10 min cap. |
| | `useJobPoll.ts` | Used by **MagicMomentOverlay** only. Exponential backoff (2s → 15s). Stops when terminal or SSE connected. | 2s–15s (not 60s). |
| **GET /api/stores/temp/draft?generationRunId=...** | `StoreReviewPage.tsx` | `loadDraft` runs when `pollTrigger` updates. Two triggers: (1) `setInterval(..., DRAFT_POLL_WHILE_PROGRESS_MS)` = **1s** while `showProgressScreen && !draft && !jobTerminal`; (2) `setTimeout(..., DRAFT_POLL_INTERVAL_MS)` = **2s** when draft status is `running` or `not_found` (until job terminal or draft ready). | 1s or 2s (not 60s). |
| **GET /api/v2/flags** | `featureFlags.ts` | `initFeatureFlags()` – one-time fetch on init (AppShell, RequireFeature, useBusinessBuilder). **No polling.** | Once per app/session. |
| **GET /api/stream?key=admin** | `useJobPoll.ts` | **EventSource** (long-lived). Fallback admin key when job key errors. Also: health/SSE checks may hit stream/health. | Connection/reconnect (not a 60s poll). |

Other 60s refetches in app (different endpoints):

- `useSystemHealth.js`: `refetchInterval: 15000` → `/api/health?full=true` (15s).
- `useServiceHealth(service)`: `refetchInterval: 60000` → `/api/health/:service` (60s) – only when that hook is used.
- `useDashboardOverview.js`, `useDashboardTrend.js`, `WatcherInsightFeed.tsx`, `useIntegrationsStatus.js`, `SystemWatcherModal.tsx`: 60s refetch for **dashboard/watcher**, not job/draft/stream.

### B) Why ~60s shows up in proxy logs

- **Job/draft:** Intervals found are **1s, 1.25s, 2s** (and 2–15s in useJobPoll). So the **~60s** pattern is likely **not** from the store draft review page’s job/draft polling itself.
- Possible causes for ~60s:
  1. **Terminal status mismatch:** If the backend returns a terminal status that we **don’t** treat as terminal (e.g. `READY_FOR_REVIEW`, `BLOCKED`), then **orchestra job polling never stops** and keeps running at 1.25s; over time, other factors (e.g. React Query refetch, health, or reconnection) can make logs look “every ~60s” or the user may be describing “keeps polling” rather than exactly 60s.
  2. **useServiceHealth or other 60s hooks** mounted somewhere in the app (e.g. layout) would add a real 60s request to **other** endpoints; not job/draft/stream directly.
  3. **SSE reconnection:** If the server or client closes the stream (e.g. every 60s), each reconnect would log a new GET `/api/stream?key=admin` (or job key).

So the main fix on the store flow is: **ensure job and draft polling stop** when the job is terminal (including `READY_FOR_REVIEW` and `BLOCKED`) and on unmount; and ensure no duplicate/lingering timers.

### C) Minimal fix design (safest)

1. **Terminal status coverage (jobStatus.ts)**  
   - Add `ready_for_review` and `blocked` (and `blocked_review` if used) to the terminal set used by `isJobTerminal` so that when the backend returns `READY_FOR_REVIEW` or `BLOCKED`, we stop polling immediately.  
   - **Risk:** None. Only expands “terminal” so we stop sooner.

2. **useOrchestraJobUnified (already correct)**  
   - Already stops when `isJobTerminal(status)`, on unmount (cleanup), and when no subscribers.  
   - After (1), any backend terminal status will stop the interval.  
   - No code change needed here beyond relying on fixed `isJobTerminal`.

3. **StoreReviewPage draft poll**  
   - Already skips starting the progress poll when `jobTerminal`.  
   - When draft fetch returns `running` / `not_found`, it schedules `setTimeout(..., DRAFT_POLL_INTERVAL_MS)`. Ensure we **clear** that timeout on unmount and that `latestJobStatusRef` is used so we don’t schedule again when job is already terminal.  
   - Minimal change: ensure `pollTimeoutRef` is cleared in a cleanup on unmount (if not already).

4. **SSE vs poll**  
   - useJobPoll already disables polling when SSE is connected.  
   - useOrchestraJobUnified does not use SSE; it’s the main job poll on StoreReviewPage. We do **not** add SSE there in this change; we only ensure terminal stops the interval.

5. **Deduplication / route**  
   - useOrchestraJobUnified already uses a **module-level singleton** per jobId (one interval per jobId, shared by hook instances).  
   - No extra deduplication needed for this fix.

### D) Guardrails (already present or added)

- **One poll per jobId:** useOrchestraJobUnified singleton Map by jobId.  
- **Route/unmount:** Cleanup in useEffect return clears interval and unsubscribes; when last subscriber leaves, interval is cleared.  
- **Terminal:** After adding `ready_for_review` and `blocked`, all backend terminal statuses stop job polling.  
- **Draft poll:** Only runs while on progress screen without draft and not job terminal; timeout cleared on unmount (verify/add cleanup).  
- **Publish Review / Public preview:** StoreReviewPage with `readonly` still uses same useOrchestraJobUnified; if no jobId in URL, no job polling. No change.

### E) Risks and mitigations

| Risk | Mitigation |
|------|------------|
| New terminal values break a consumer that expects “only completed/failed” | isJobTerminal is already the single source of truth; all callers (useOrchestraJobUnified, StoreReviewPage) use it. Adding READY_FOR_REVIEW/BLOCKED is consistent with useJobPoll and quickStart. |
| Draft poll timeout not cleared on unmount | Add/verify cleanup of `pollTimeoutRef.current` in StoreReviewPage when component unmounts or storeId/jobId changes. |
| 60s traffic from other hooks (health, dashboard) | Out of scope for this change; only store creation flow polling is addressed. |

---

## 2) IMPLEMENTATION (code)

### Files changed

1. **`src/utils/jobStatus.ts`**  
   - Added `'ready_for_review'` and `'blocked'` to `TERMINAL_ORCHESTRA` so `isJobTerminal('READY_FOR_REVIEW')` and `isJobTerminal('BLOCKED')` return true. Orchestra job polling and draft polling (which both use `isJobTerminal`) now stop when the backend returns these statuses.  
   - Added `'ready_for_review'` to `SUCCESS_ORCHESTRA` so `isJobCompleted('READY_FOR_REVIEW')` is true (UI shows completion, not failure).

2. **`tests/jobStatus.test.ts`**  
   - Added tests for `ready_for_review`, `READY_FOR_REVIEW`, `blocked`, and `BLOCKED` to ensure they are treated as terminal.

3. **`src/pages/store/StoreReviewPage.tsx`**  
   - No change. Cleanup on unmount (and when deps change) already clears `pollTimeoutRef.current` and aborts in-flight requests (see effect cleanup around lines 1313–1325).

---

## 3) Manual test checklist

- [ ] **Open draft review, job running:** Network shows repeated GET `/api/mi/orchestra/job/:jobId` and GET `/api/stores/temp/draft?generationRunId=...` at ~1–2s while job is running and progress screen is shown.
- [ ] **Job completes (e.g. READY_FOR_REVIEW or COMPLETED):** Within one poll cycle (or immediately after next response), orchestra job polling stops (no further GET orchestra/job). Draft poll also stops once draft is loaded or job is terminal.
- [ ] **Navigate away (e.g. to another route):** Polling stops immediately (no background GETs for the left route). Verify by switching route and watching network for 10–15s.
- [ ] **SSE connected (e.g. Magic Moment flow with useJobPoll):** No parallel job polling when SSE is active (useJobPoll already disables poll when SSE connected).
- [ ] **No regressions:** Store still updates during generation (progress, then transition to editor when draft ready); publish-review and public preview still load without extra polling when no jobId.
