# Orchestra Job Polling Bug – Findings and Fix

## Summary

**Symptom:** Frontend polls `GET /api/mi/orchestra/job/:jobId` after starting a build_store job; UI shows "Job not found. Code: ORCHESTRA_JOB_NOT_FOUND" even though the worker completes and the draft is ready.

**Root cause:** **API/dashboard contract mismatch.** The backend returns a **flat** job contract `{ ok, jobId, status, storeId, generationRunId, result, error, ... }` with **no nested `job` property**. The dashboard’s `getOrchestraJob()` returns this as-is, and `runExecuteTasksStore` checks `if (!jobResp.job)`. Because the API never sends `job`, `jobResp.job` is always `undefined`, so the UI always gets `ORCHESTRA_JOB_NOT_FOUND` on the first poll.

## Backend (for reference)

- **GET handler:** `apps/core/cardbey-core/src/routes/miRoutes.js` (GET `/api/mi/orchestra/job/:jobId`).
- **Prisma:** `prisma.orchestratorTask.findUnique({ where: { id: jobId } })`.
- **When task found:** 200 with flat body: `{ ok: true, jobId, status, generationRunId, storeId, result, error, updatedAt, meta }`.
- **When task not found:** 200 with `{ ok: true, jobId, status: 'failed', error: 'job_not_found', errorCode: 'STORE_NOT_FOUND', ... }` (so UI can stop polling without 404).
- **Job creation:** Same file, `handleOrchestraStart` → `prisma.orchestratorTask.create(...)`; response includes `jobId: job.id`.
- **Status updates:** `runBuildStoreJob` in `orchestraBuildStore.js` calls `transitionOrchestratorTaskStatus` in `transitionService.js` (queued → running → completed). No code deletes or archives `OrchestratorTask`.

If the DB row were missing, the cause would be a different process/DB (multi-instance). The logging added earlier will confirm that. The **immediate** fix is the dashboard contract normalization below.

## Fix Implemented

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/orchestraJobApi.ts`

- **Change:** In `getOrchestraJob()`, when the API returns the flat contract (no `response.job`) and it is **not** a job_not_found response (`error !== 'job_not_found'` / `errorCode !== 'STORE_NOT_FOUND'`), **normalize** the response so that `jobResp.job` is set.
- **Behavior:**
  - If the API already returns `response.job`, return as-is.
  - If the API returns job_not_found, return as-is so `jobResp.job` stays undefined and the step handler correctly returns `ORCHESTRA_JOB_NOT_FOUND`.
  - Otherwise, build a `job` object from the flat fields (`status`, `jobId`, `storeId`, `generationRunId`, `result`, `error`, and `inputsJson`/`resultJson` for `extractJobStoreId`/`extractJobDraftId`) and return `{ ...response, job }`.
- **Result:** When the backend returns a real job (running or completed), the dashboard now has `jobResp.job` set, so polling sees status and result and can complete successfully instead of showing job not found.

## Optional Follow-ups

1. **Backend:** Consider returning a nested `job` in the GET response (e.g. `{ ok: true, job: { status, jobId, storeId, ... } }`) so the dashboard does not need to normalize. Then the dashboard can rely on `response.job` only.
2. **Logging:** After running one build_store flow, check logs for `[Orchestra:JOB:GET]` and `[OrchestratorTask:update]` to confirm the same process/DB is used and the task is found and updated to completed.
3. **Retention:** Add a separate job to clean up old completed `OrchestratorTask` rows if desired; no code currently deletes them.
