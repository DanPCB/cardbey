# Polling Every 1 Minute – Root Cause and Fix

## What was happening

- **GET /api/mi/orchestra/job/:jobId** and **GET /api/auth/me** were firing in bursts.
- Bursts appeared to repeat about **every 1 minute**.

## Root causes

### 1. **currentUser (auth/me) refetch**

- `useCurrentUser()` uses React Query with `queryKey: ['currentUser']`, `staleTime: 60_000`.
- React Query can refetch when data is stale (e.g. after 60s) on mount or other triggers.
- Even without an explicit `refetchInterval`, refetch behavior can make it look like a ~1‑minute cycle.

### 2. **Orchestra job – multiple consumers, shared fetch race**

- Several components use `useOrchestraJobUnified(jobId)` with the **same** `jobId`:
  - StoreReviewPage
  - StoreDraftReview (now receives `orchestraState` from page when on review)
  - MICommandBar, ImproveDropdown, NextMIActions (same `jobId` when polling)
- The shared “in‑flight” fetch was cleared in `.finally()` as soon as the first request finished.
- If that finished before other effects ran (e.g. child components mounting a bit later), each of those saw “no in‑flight request” and started another **GET /api/mi/orchestra/job/:id** → burst of 2–3 requests.
- Polling interval (1.25s) was correct; the **initial** burst came from this race.

### 3. **Status handling**

- If the backend ever sent `status` in an unexpected shape (e.g. non‑string), `isJobTerminal()` might not have run correctly and polling could continue after the job was already terminal.

## Fixes applied

1. **`services/user.ts` – currentUser**
   - Set **`refetchInterval: false`** so the current user is never refetched on a timer.
   - Avoids periodic **GET /api/auth/me** every minute.

2. **`hooks/useOrchestraJobUnified.ts` – orchestra job**
   - **Dedupe window:** Keep the in‑flight entry for **2s** after the shared request settles (`IN_FLIGHT_CLEAR_DELAY_MS = 2000`), so late‑mounting effects reuse the same promise and do not fire extra GETs.
   - **Status:** Normalize status with `(jobData.status ?? '').toString().trim()` before calling `isJobTerminal()`, so terminal is detected reliably and polling stops.
   - (Existing behavior: StoreReviewPage passes `orchestraState` to StoreDraftReview so only the page runs the hook for that route; single source of job data and one poller.)

3. **Existing behavior (unchanged)**
   - `jobStatus.ts`: `READY_FOR_REVIEW` and `BLOCKED` are terminal; polling stops and no “job failed” when draft is ready.
   - One `setInterval` per `jobId` (module‑level singleton); multiple hook instances share it.

## What to expect after the fix

- No automatic **GET /api/auth/me** on a 1‑minute timer.
- One **GET /api/mi/orchestra/job/:jobId** on load (no burst from multiple consumers).
- Polling every 1.25s until the job is terminal, then it stops.
- No new behavior change to auth, store creation, or job streaming.

## If polling still appears every minute

- Check for other hooks with `refetchInterval: 60000` or `60_000` on the same route/layout (e.g. health, dashboard overview) and disable or scope them so they do not run on the review page.
- Confirm the backend returns a terminal status (`READY_FOR_REVIEW`, `COMPLETED`, `FAILED`, etc.) when the job is done; if it returns something else, add that value to `TERMINAL_ORCHESTRA` in `utils/jobStatus.ts`.
