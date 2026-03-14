# Impact Report: Store Mission Phase 0

## Summary
Add Store Mission Phase 0 (Create Draft + Generate only) to the Mission executor. No commit/publish, no agent intervention, no UI redesign beyond PhaseOutputs. Existing store creation (orchestra/jobId) and campaign missions are unchanged.

---

## 1. What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| **Existing store mission (jobId flow)** | Step handlers today branch on `plan.type === 'store'`; adding Phase 0 logic could change behavior when `jobId` is present. | Branch explicitly: when `artifacts.jobId` exists, keep current validate/execute/report behavior. When no `jobId` and plan is store, use Phase 0 path (create draft → generate by draftId). |
| **DraftStore create/generate/commit** | New POST create and POST :draftId/generate could conflict with existing POST /generate or orchestra-created drafts. | New routes are additive. POST /api/draft-store (create-only) is new; POST /api/draft-store/:draftId/generate is new. Existing POST /generate (create+generate in one) unchanged. Commit not touched. |
| **Preview rendering / image mapping** | PhaseOutputs will fetch GET draft-store/:id/summary; no change to preview or image APIs. | Summary endpoint is read-only, no change to preview payload or image mapping. |
| **Auth/session** | New endpoints must be requireAuth and tenant/owner scoped. | All new routes use requireAuth; summary and generate check draft.ownerUserId === req.user.id (or tenant). |
| **Campaign missions** | Step handlers and PhaseOutputs have campaign-specific branches. | Store Phase 0 code only runs when plan.type === 'store' and (for Phase 0) when no jobId; campaign branches unchanged. |

---

## 2. Impact scope

- **Backend (core):** draftStore.js – new POST create, POST :draftId/generate, GET :draftId/summary. No change to existing POST /generate, commit, or other routes.
- **Dashboard:** missionStore.ts (artifacts type), stepHandlers.ts (store Phase 0 branches), PhaseOutputs.tsx (store phaseIds + fetch summary), ExecutionDrawer.tsx (show PhaseOutputs for store + pass draftStoreId). Optional feature flag `VITE_MISSION_STORE_PHASE0=false` to hide store mission type.
- **Not in scope:** commit/publish, agent intervention, new UI pages, changes to orchestra/jobId store flow.

---

## 3. Smallest safe patch

- **Backend:** Add three routes only; use existing createDraft/generateDraft from draftStoreService; use kernel transition for status (no direct status write).
- **Artifacts:** Add `draftStoreId` and `storeGenerationRunId`; keep `draftId` for backward compatibility (same value as draftStoreId when set from Phase 0).
- **Step handlers:** In validate-context (store), if `!artifacts.jobId` run Phase 0 create-draft and save draftStoreId. In execute-tasks (store), if `artifacts.draftStoreId && !artifacts.jobId` run Phase 0 generate (bounded poll 60s). Report (store) remains placeholder.
- **PhaseOutputs:** Extend phaseId to include store_validate, store_generate, store_report; gate fetch on draftStoreId; render summary + placeholder report. ExecutionDrawer: when plan.type === 'store', render PhaseOutputs with draftStoreId (and optionally gate on VITE_MISSION_STORE_PHASE0).

---

## 4. Store pipeline integration points (Part 1 deliverable)

| Step | API / service | Notes |
|------|----------------|------|
| **validate-context (Phase 0)** | POST /api/draft-store (new) | Body: `{ name?, category?, missionId? }`. Creates DraftStore with status `draft`, input: { businessName, category, missionId }. Returns `{ draftStoreId }`. requireAuth; set ownerUserId. |
| **execute-tasks (Phase 0)** | POST /api/draft-store/:draftStoreId/generate (new) | Triggers generateDraft(draftId). Sync with 60s cap or return 202 + poll. Returns runId/taskId if available. requireAuth; ownership via draft.ownerUserId. |
| **Report (Phase 0)** | No API | Placeholder "Next: publish (Phase 1)" in PhaseOutputs only. |
| **PhaseOutputs (store_validate)** | GET /api/draft-store/:draftStoreId/summary (new) | requireAuth; tenant/owner scoped. Returns status, businessName, category, productCount, categoryCount, imageCount, heroImageUrl?, missingImagesCount?, updatedAt. |
| **PhaseOutputs (store_generate)** | Same GET summary | Poll when status is generating until ready/failed or timeout. |
| **Existing flow (unchanged)** | orchestra/start → jobId; validate resolves draft from job; execute polls job; report uses draftId/storeId for links. | No change. |

**Existing IDs:** draftStoreId = DraftStore.id. generationRunId optional (from generate pipeline if we expose it). GET /api/draft-store/:draftId already returns draft; new GET .../summary returns a small summary shape for PhaseOutputs.

**DraftStore status:** Use kernel `transitionDraftStoreStatus`; do not write status directly. Valid terminal states for "ready": `ready`; for "failed": `failed`.
