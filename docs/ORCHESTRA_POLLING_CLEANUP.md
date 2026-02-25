# Orchestra Job Polling Cleanup – Single Owner + Terminal Stop

## Risk assessment (LOCKED RULE)

Before implementing, the following was assessed:

- **What could break:** Quick Start → /start → draft review → publish → public preview flow; duplicate GET job after terminal; polling restart on step=publish or public preview.
- **How we avoid it:** (1) Only add `stopPolling: true` when we already intend to stop (publish succeeded or readonly/step=publish). (2) Mark jobId terminal when `stopPolling` is true so no other subscriber restarts. (3) Add `enabled` option without changing any caller to `enabled: false` in the creation flow (QuickStartProgress and StoreReviewPage keep current behavior). (4) Use existing `isJobTerminal` from `@/utils/jobStatus`; no backend or URL changes.

## Polling owners (audit)

| File | Component/Hook | When it mounts | Starts polling? | Stops on terminal? | In creation flow? |
|------|----------------|----------------|------------------|--------------------|-------------------|
| `useOrchestraJobUnified.ts` | hook | When `jobId` set and `enabled` true, `stopPolling` false | Yes (singleton per jobId) | Yes | Used by progress + review |
| `StoreReviewPage.tsx` | page | Draft review route | Yes (calls hook with urlJobId) | Yes + stopPolling when publish/readonly | Yes – **single owner on review** |
| `QuickStartProgress.tsx` | component | Progress overlay after /start | Yes (calls hook) | Yes (unmount on navigate) | Yes – unmounts before review |
| `StoreDraftReview.tsx` | component | Child of StoreReviewPage | No (uses orchestraStateFromParent) | N/A | Yes – no duplicate poll |
| `MICommandBar.tsx` | component | Inside draft review | Only when pollingJobId set (user action) | Yes (via hook) | No (post-creation MI) |
| `ImproveDropdown.tsx` | component | Same | Same | Same | No |
| `NextMIActions.tsx` | component | Same | Same | Same | No |

**Single-owner rule (creation flow):** Only **StoreReviewPage** polls on the review route. QuickStartProgress polls only while the progress overlay is visible; it unmounts on navigate, so no overlap. StoreDraftReview receives job state from StoreReviewPage and does not call the hook with a jobId.

## Diff summary

1. **`src/hooks/useOrchestraJobUnified.ts`**
   - When `stopPolling` is true, call `stopPollingForJobId(jobId, true)` so the jobId is marked terminal and no other subscriber restarts polling.
   - Added `enabled?: boolean` (default true). When `enabled` is false, the hook does not register a subscriber or start polling (for tests and future single-owner enforcement).
   - Effect dependencies updated to include `enabled`.

2. **`src/pages/store/StoreReviewPage.tsx`**
   - Pass `stopPolling: publishSucceeded || readonly` so job polling stops when the user goes to the publish step (readonly) or after publish, not only after publish.

3. **`tests/jobStatus.test.ts`**
   - Added test that `isJobTerminal('Ready For Review')` and `isJobTerminal('ready for review')` return true (normalize spaces to underscore).

4. **`tests/useOrchestraJobUnified.test.ts`** (new)
   - Does not start polling when `enabled=false`.
   - Does not start polling when `stopPolling=true`.
   - Does not start the interval when the initial GET response is terminal (`completed`, `ready_for_review`); only one GET for that jobId.

5. **No changes**
   - Backend endpoints, automation flow order, POST /run behavior, QuickStartProgress (still unmounts on navigate; no new polling in multiple places).

## Terminal status source of truth

- **`src/utils/jobStatus.ts`** – `isJobTerminal(status)` is the single helper used by `useOrchestraJobUnified` and elsewhere. It includes: completed, complete, done, success, finished, ready, ready_for_review, failed, error, blocked, cancelled, canceled, timeout, timed_out, stale, and normalizes spaces to underscores (e.g. "Ready For Review" → true). No scattered string checks were added.

## Manual verification (Network tab)

1. **During generation:** Filter by `orchestra/job`. You should see GET `/api/mi/orchestra/job/:jobId` roughly every 1–2 s (e.g. 1.5 s).
2. **As soon as status is terminal (completed / failed / ready_for_review):** After the next poll that returns terminal, no further GET for that jobId. No GET after navigating to publish step or public preview.
3. **Publish step:** Navigate to draft review → click through to step=publish. No new or continued GET job requests for the creation jobId.
4. **Public preview:** After publish, go to public preview. No GET job for the creation jobId.
5. **No POST /run:** No automatic POST `/api/mi/orchestra/job/:id/run` in the normal creation flow.
6. **Quick Start E2E:** Quick Start → create store → progress → review → publish → preview still works; polling stops once the job is terminal and when moving to publish/preview.

## Tests added/updated

- **`tests/jobStatus.test.ts`** – New case: `isJobTerminal` normalizes "Ready For Review" / "ready for review" to terminal.
- **`tests/useOrchestraJobUnified.test.ts`** – New file:
  - Polling is not started when `enabled=false`.
  - Polling is not started when `stopPolling=true`.
  - When the initial GET response is terminal (`completed` or `ready_for_review`), no interval is started (only one GET; advancing time does not trigger more GETs).

**Run:**

```bash
cd apps/dashboard/cardbey-marketing-dashboard
pnpm test -- tests/useOrchestraJobUnified.test.ts tests/jobStatus.test.ts --run
```

Or run the full suite:

```bash
pnpm test --run
```

## Acceptance criteria

- During generation: GET `/api/mi/orchestra/job/:jobId` about every 1–2 s.
- As soon as status is terminal: interval cleared; no further GET for that jobId.
- Navigating to step=publish does not restart polling; polling stops when entering publish step (readonly).
- Navigating to public preview does not restart polling.
- No new endpoints; no automatic POST `/api/mi/orchestra/job/:id/run` in creation flow.
- Quick Start still works end-to-end.
