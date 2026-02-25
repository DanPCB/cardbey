# Impact report: Draft not found — grace period and recovery

## Problem

On `/app/store/temp/review?mode=draft&jobId=<jobId>`, the UI sometimes shows **"Draft not found — The job finished but no draft was created yet"** even when the draft appears shortly after or exists under the same `generationRunId`. This breaks the "60 second setup" experience.

## Audit: end-to-end flow

### Frontend

- **Page:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- **Route:** `/app/store/:storeId/review` with `storeId=temp`, `mode=draft`, `jobId` in query.
- **"Job finished" is decided by:** `useOrchestraJobUnified(urlJobId)` → GET `/api/mi/orchestra/job/:jobId`. When `(orchestraJob?.status ?? '').toLowerCase()` is `completed`, `failed`, or `cancelled`, `jobTerminal === true`.
- **"Draft exists" is decided by:** A separate flow that calls GET `/stores/temp/draft?generationRunId=...` (with `effectiveGenerationRunId` from job or URL). Draft is stored in `draft` state; `backendDone = !!draft`.
- **Progress screen:** Shown when `isDraftTempFlow && !(backendDone && minTimeDone && transitionDone)`. So we show the progress card until we have draft and min time and transition are done.
- **"Draft not found" block:** Rendered when `showProgressScreen && orchestraJob && jobTerminal`. So as soon as the job is terminal (e.g. `completed`) and we are still on the progress screen (no draft yet), we show "Draft not found" **immediately** with no extra wait or poll.

### Backend

- **Job status:** `apps/core/cardbey-core/src/routes/miRoutes.js` — GET `/orchestra/job/:jobId` returns task from DB; for build_store, status is set in POST `/orchestra/job/:jobId/run` after `generateDraft(draft.id)` completes (inside `setImmediate`). So the backend marks the job `completed` **after** `generateDraft` finishes.
- **Draft read:** GET `/api/stores/:storeId/draft?generationRunId=...` in `stores.js` uses `getDraftByGenerationRunId(runId)`. When no draft row exists, it returns `status: 'failed', error: 'draft_not_found'`.

### Root causes (2–3 most likely)

1. **Race / no grace period (primary)**  
   The UI treats "job completed" and "draft not found" as final in the same render. It does not wait or poll again after seeing `completed`. So if the draft appears on the next poll (or a few hundred ms later), the user never gets that chance — we show "Draft not found" before the next draft request runs.

2. **Eventual consistency / ordering**  
   Even though the backend marks the job `completed` only after `generateDraft` finishes, the draft row might become visible to GET `/stores/temp/draft` a moment after the job status update (e.g. transaction commit order, replica lag). The frontend does not give that moment; it bails out as soon as `jobTerminal` is true.

3. **Single source of truth**  
   "Finished" is from the job endpoint; "draft exists" is from the draft endpoint. There is no canonical "job result" that guarantees `status=completed` ⇒ `draftStoreId` non-null. The UI assumes job completion implies draft is readable immediately, which is not guaranteed.

## Minimal safe fix (implemented)

### A) UI: grace period + "Finalizing draft…"

- When job status becomes `completed` (and we are still on the progress screen with no draft), **do not** show "Draft not found" immediately.
- Enter a **"Finalizing draft…"** state and poll the existing draft endpoint for up to **15 seconds** (configurable), e.g. every 1s via existing `pollTrigger`.
- If the draft appears during that window, the normal flow continues to the editable review page.
- Only after the grace window expires do we show "Draft not found" and recovery actions.

### B) Backend (no change in this patch)

- The backend already marks the job `completed` only after `generateDraft(draft.id)` completes. No change to job lifecycle in this fix.
- A future improvement is a canonical GET `/api/jobs/:jobId/result` returning `{ status, draftStoreId }` with the guarantee `status=completed` ⇒ `draftStoreId != null`.

### C) Recovery and debug

- On real failure (after grace or `status=failed`/`cancelled`): keep **Restart generation** and **Start over**, and add a **Copy debug info** link (jobId, status, generationRunId, timestamps) for support.

### D) Scope and risk

- **Touched:** `StoreReviewPage.tsx` only (grace state, finalizing UI, polling during grace, recovery copy-debug).
- **Not changed:** Publish/review routes, job API, draft API, or other pages. No Node-only imports in client bundles.
- **Risk:** Low; we only delay showing "Draft not found" and add one more poll loop when job is `completed` and draft is still null.

## Acceptance

- With normal generation, the user should almost never see "Draft not found" if the system is still finalizing.
- If draft creation is delayed by a few seconds after job completion, the UI stays in "Finalizing draft…" and succeeds when the draft appears.
- If the draft truly never appears, the UI shows the error only after the grace window and provides recovery + debug copy.
