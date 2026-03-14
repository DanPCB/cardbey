# Impact Report: Store Creation Mission DRAFT_NOT_READY Fix

## 1) What could break

- **Mission "Validate store context" semantics:** Today we require draft status `ready` or `succeeded` for validate-context to pass. After the fix, when the mission has a `jobId` (orchestra job in progress) and the draft status is `generating`, we treat validate-context as **passed** ("context ready; draft generating"). So validate-context no longer fails with "Draft not ready (status: generating)" in the create-store flow.
- **No other behavior change:** Execute-tasks (step 2) already polls the job until terminal and then checks draft; it already handles "Job completed; draft finalizing" when status is still generating after job completion. Backend draft-store summary and orchestra job APIs are unchanged.

## 2) Why

- **Root cause:** Store creation mission runs step 1 (Validate store context) immediately. The draft is created with status `generating` and the orchestra job runs async. So when validate-context runs, it fetches the draft and sees `status: 'generating'`, which is not in `DRAFT_STATUS_VALID` → we return `DRAFT_NOT_READY` and the whole mission fails.
- **Secondary:** When OpenAI image billing/quota limit is hit, the backend stops image generation early, finalizes the draft as `ready` (with partial images), and marks the job `completed`. The UI was already failing at step 1 (validate) before step 2 could complete, so the billing case surfaced the same ordering issue.

## 3) Impact scope

- **Affected:** Mission Console store missions only. Step handler `runValidateStoreContext` in `stepHandlers.ts`.
- **Not affected:** Quick Start flow, draft-store API, orchestra job API, campaign missions, or any route/auth.

## 4) Smallest safe patch

- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/stepHandlers.ts`
- **Change:** In `runValidateStoreContext`, in both branches where we check `!DRAFT_STATUS_VALID.includes(data.status)`:
  - If `data.status === 'generating'` and the mission has `mission.artifacts?.jobId` or `mission.artifacts?.generationRunId`, return `{ ok: true, details: 'Context ready; draft generating. Step 2 will complete when ready.' }` instead of failing with `DRAFT_NOT_READY`.
- **Rationale:** For create-store missions we have a job in progress; "context" means we have draftId/jobId/generationRunId. Requiring draft to be `ready` in step 1 is wrong when step 2 is responsible for waiting for the job to complete. Step 2 already polls the job and then re-checks the draft.

## 5) Billing / partial images

- Backend already finalizes the draft as `ready` when billing limit is hit (partial images); the job is marked `completed`. No backend change needed.
- After this fix, the mission will pass validate-context when draft is generating; execute-tasks will poll until job is completed and then pass (draft will be `ready` by then). If the UI still shows "0 images · 30 missing", that is a display/PhaseOutputs concern; the mission will no longer fail with `DRAFT_NOT_READY`.
