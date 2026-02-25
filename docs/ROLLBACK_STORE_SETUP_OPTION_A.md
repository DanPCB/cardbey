# Rollback: Store Setup Option A (Reversible)

This document describes how to roll back the Option A stabilization changes if needed.

## What Option A Changed

1. **Progress screen** – Shown only in the creation path (Feature → Preview). Never when:
   - `edit=1` (Edit Draft from publish-review)
   - Browser Back from publish-review (`jobDone` already true)
   - Publish-review route (`readonly`)

2. **Edit Draft** – Never starts the job. When `edit=1`:
   - `/run` effect returns early (`isEditDraftFlow`)
   - Progress screen hidden (`isReturningToEdit`)

3. **Polling** – Stops on terminal job status:
   - Job poll (`useOrchestraJobUnified`) stops when `isJobTerminal`
   - Progress draft poll stops when `jobTerminal`
   - **Stuck-on-loading cap** – Poll for draft when job done but draft not loaded caps at 60s

## Files Touched (Option A)

| File | Change |
|------|--------|
| `StoreReviewPage.tsx` | `showProgressScreen` logic, `isEditDraftFlow` guard, `/run` early return, `stuckPollStartRef` + 60s cap |
| `storeReviewPageBranch.ts` | `shouldSkipStartJobForEditDraft('1')` |
| `StoreDraftReview.tsx` | Edit Draft button adds `edit=1` to URL |
| `useOrchestraJobUnified.ts` | Stops job poll on terminal status (already present) |
| `resolveBrandImages.ts` | Hero/avatar resolver (see HERO_AVATAR_ROOT_CAUSE_AND_FIX.md) |

## How to Roll Back

### 1. Remove stuck-on-loading cap (StoreReviewPage.tsx)

Remove the 60s cap so the "Loading store..." poll runs indefinitely again:

```diff
-  /** Cap stuck-on-loading poll to 60s to avoid infinite poll when draft never loads. Reversible via ROLLBACK_STORE_SETUP_OPTION_A.md */
-  const stuckPollStartRef = useRef<number | null>(null);
-  const STUCK_POLL_MAX_MS = 60_000;
```

```diff
  // Keep polling for draft when job is done but draft not loaded yet ("Loading store..." state). Prevents getting stuck.
-  // Cap at STUCK_POLL_MAX_MS to avoid infinite poll (reversible: see docs/ROLLBACK_STORE_SETUP_OPTION_A.md)
  const stuckOnLoadingStore = isDraftTempFlow && isGenerationRoute && jobDone && !draft;
  React.useEffect(() => {
-    if (!stuckOnLoadingStore) {
-      stuckPollStartRef.current = null;
-      return;
-    }
    if (!stuckOnLoadingStore || !urlJobId) return;
-    if (stuckPollStartRef.current === null) stuckPollStartRef.current = Date.now();
-    const elapsed = Date.now() - (stuckPollStartRef.current ?? 0);
-    if (elapsed >= STUCK_POLL_MAX_MS) return;
    const id = setInterval(() => setPollTrigger((p) => p + 1), DRAFT_POLL_WHILE_PROGRESS_MS);
    return () => clearInterval(id);
-  }, [stuckOnLoadingStore, urlJobId, pollTrigger]);
+  }, [stuckOnLoadingStore, urlJobId]);
```

### 2. Re-enable job start for Edit Draft (NOT recommended)

To revert Edit Draft behavior (would re-start the job when clicking Edit Draft):

In `StoreReviewPage.tsx`, remove the guard from the `/run` effect:

```diff
  const isEditDraftFlow = shouldSkipStartJobForEditDraft(searchParams.get('edit'));
  useEffect(() => {
    if (!urlJobId) return;
-   if (isEditDraftFlow) return; // Edit Draft: load existing draft only, do not run generation
```

And remove the progress screen guard:

```diff
-  const isReturningToEdit = shouldSkipStartJobForEditDraft(searchParams.get('edit')); // from publish-review "Edit Draft" — do not show progress again
  const showProgressScreen =
-    isDraftTempFlow && !canTransition && isGenerationRoute && !isReturningToEdit && !jobDone;
+    isDraftTempFlow && !canTransition && isGenerationRoute && !jobDone;
```

**Warning:** This would cause the job to run again when Edit Draft is clicked and show the progress screen again.

### 3. Remove Edit Draft from publish-review header

To revert Edit Draft button entirely (remove the button):

In `StoreDraftReview.tsx`, remove the Edit Draft button from the publish-review header. The button would need to be replaced with a different navigation (e.g. back to draft without `edit=1`).

## Minimal Safe Rollback (stuck-on-loading only)

If the only issue is the 60s cap causing "Loading store..." to stop too early:

1. Apply the changes in section 1 above.
2. Leave all other Option A logic unchanged.

## Feature Flag (Future Option B)

`VITE_ENABLE_STORE_SETUP_FLOW=1` or `VITE_ENABLE_STORE_SETUP_FLOW=true` enables the single-screen flow (`/app/store/setup`). The flag is defined in `src/config/env.ts` as `ENABLE_STORE_SETUP_FLOW`. When Option B is implemented, setting this will redirect review/publish-review to the new flow. Currently the flag is unused; Option B is not yet implemented.
