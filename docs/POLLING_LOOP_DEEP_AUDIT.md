# Deep Audit: 1-Minute Polling Loop and Store Review Flash

## Scope

Find and eliminate **all** periodic activity that runs while the user is on the store review page (`/app/store/:id/review`) and causes:
- Repeated GET `/api/mi/orchestra/job/:id` and/or GET `/api/auth/me`
- Re-renders and UI flash every ~1 minute

## Audit Findings

### 1. React Query – currentUser (GET /api/auth/me)

- **Where:** `services/user.ts` – `useCurrentUser()` with `queryKey: ['currentUser']`
- **Used on store review:** Yes – `StoreDraftReview` uses `useCurrentUser()`
- **Settings:** `staleTime: 60_000`, `refetchOnWindowFocus: false`, `refetchInterval: false`
- **Risk:** In React Query v5, `refetchOnReconnect` defaults to **true**. When the browser fires the `online` event (e.g. after a brief network blip or wake), all **stale** queries refetch. After 60s currentUser is stale → one reconnection could trigger GET /api/auth/me and re-renders.
- **Also:** After 60s the query is stale; if any component using it **remounts** (e.g. due to key change or conditional), `refetchOnMount` (default true) would refetch.

### 2. Orchestra job polling (GET /api/mi/orchestra/job/:id)

- **Where:** `hooks/useOrchestraJobUnified.ts` – single `setInterval(..., 1250)` per jobId until terminal
- **Used on store review:** Yes – `StoreReviewPage` uses it; job passed to `StoreDraftReview` via `orchestraState`
- **Stopping condition:** `isJobTerminal(status)` – status from `job.status` or response
- **Risks:**
  - Backend might return status with spaces (e.g. `"Ready For Review"`) – we only match `ready_for_review` (underscore). Unmatched → polling never stops.
  - Status might be in a different field (e.g. top-level `response.status`) – we read `job.status`; if backend puts it only at top level when job is embedded, we could miss it.

### 3. Other 60s refetchInterval hooks

- **useDashboardOverview** – `refetchInterval: 60_000` – used only in **DashboardEnhanced**, not on store review. ✅
- **useServiceHealth(service)** – `refetchInterval: 60000` – used only inside **useSystemHealth.js** (export), no other call sites. ✅
- **useSystemHealth** – `refetchInterval: 15000` – not used in AppShell or store review tree. ✅
- **SystemWatcherModal** – `refetchInterval: 60000` for one query – only when modal is open. ✅
- **useDashboardTrend** – `refetchInterval: 60_000` – used in Dashboard/DashboardEnhanced only. ✅

None of these are mounted when the user is on the store review page.

### 4. Store review page – what actually runs

- **StoreReviewPage:** `useOrchestraJobUnified(urlJobId)`, `loadStoreData` effect (depends on `pollTrigger`; `pollTrigger` only increments when `showProgressScreen` or `stuckOnLoadingStore` – not when draft is loaded and “100% ready”).
- **StoreDraftReview:** `useCurrentUser()`, receives `orchestraState` from parent (no second orchestra hook).

So the only **periodic** work on store review is:
1. **useOrchestraJobUnified** – every 1.25s until terminal
2. **currentUser** – possible refetch on reconnect or when stale + remount

### 5. Root causes of “every 1 minute” and flash

1. **Reconnect refetch:** Once per minute (or whenever the browser fires `online`), React Query refetches stale queries → GET /api/auth/me → state update → re-render → flash.
2. **Orchestra polling never stopping:** If backend returns a status we don’t recognize as terminal (e.g. `"Ready For Review"` with spaces, or status only at top level), we keep polling every 1.25s → constant re-renders; user may describe this as “every minute” or “keeps flashing”.
3. **Stale + remount:** If anything causes a subtree that uses `useCurrentUser` to remount after 60s, refetchOnMount triggers GET /api/auth/me.

## Fixes Applied

1. **currentUser query (user.ts)**  
   - `refetchOnReconnect: false`  
   - `staleTime: 10 * 60 * 1000` (10 minutes)  
   → No refetch on reconnect; less likely to be stale on remount.

2. **jobStatus.ts**  
   - Normalize status: `status.trim().toLowerCase().replace(/\s+/g, '_')` before terminal/success checks  
   → Treats "Ready For Review", "ready for review", "READY_FOR_REVIEW" as terminal and stops polling.

3. **orchestraClient.ts**  
   - When building `job` from flat response, ensure `job.status` is set from `raw.status` if `raw.job` is missing or `raw.job.status` is missing  
   → Status is always available for terminal check.

4. **useOrchestraJobUnified**  
   - Use normalized status (spaces → underscores) before calling `isJobTerminal`  
   - Defensive: read status from both `job.status` and (if needed) top-level response in normalization  
   → Polling stops reliably when job is done.

5. **No refetchInterval on review route**  
   - Confirmed no hook with refetchInterval is mounted in the store review tree; no code change.

## Verification

- On store review with “100% ready to publish”: no GET /api/mi/orchestra/job after initial load (or after first terminal response).
- No GET /api/auth/me on a 1-minute timer; no refetch on reconnect for currentUser.
- No UI flash every 1 minute.
