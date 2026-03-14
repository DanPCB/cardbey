# DraftStore Full Lifecycle Audit

**Date:** 2026-02-27  
**Scope:** DraftStore creation → agent tasks → content generation → image assignment → status to ready → commit/publish → public store.  
**Rule:** No major structural changes; assess risk to DraftStore lifecycle; minimal patches only.

---

## 1. Lifecycle Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. DRAFT STORE CREATED                                                        │
│    POST /api/mi/orchestra/start (build_store)                                 │
│    → prisma.orchestratorTask.create({ status: 'queued' })                     │
│    → prisma.draftStore.create({ status: 'generating', generationRunId })       │
│    → On draft create failure: transitionOrchestratorTaskStatus(queued→failed) │
│    → runBuildStoreJob(prisma, jobId, draftId, generationRunId) [setImmediate]  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. AGENT TASKS TRIGGERED (atomic)                                             │
│    runBuildStoreJob (orchestraBuildStore.js)                                  │
│    → transitionOrchestratorTaskStatus(queued→running) [updateMany, atomic]   │
│    → AuditEvent created (OrchestratorTask, status_transition)                 │
│    → If task already running/completed: idempotent skip                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. CONTENT GENERATION + IMAGE ASSIGNMENT                                      │
│    generateDraft(draftId) (draftStoreService.js)                              │
│    → transitionDraftStoreStatus(→generating) if not already generating        │
│    → Catalog build / OCR / template → preview.items, preview.categories        │
│    → prisma.draftStore.update (preview only, no status) [persist catalog]     │
│    → finalizeDraft: image assignment, hero, avatar                             │
│    → transitionDraftStoreStatus(generating→ready, extraData: { preview })      │
│    → AuditEvent created (DraftStore, status_transition)                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                          ┌─────────────┴─────────────┐
                          ▼                           ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────────────┐
│ 4a. SUCCESS                       │  │ 4b. FAILURE                              │
│ transitionOrchestratorTaskStatus  │  │ transitionDraftStoreStatus              │
│   (running→completed)            │  │   (generating→failed, extraData: error)   │
│ AuditEvent                        │  │ transitionOrchestratorTaskStatus        │
│                                   │  │   (running→failed)                       │
│                                   │  │ AuditEvents for both                     │
└──────────────────────────────────┘  └──────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. STATUS TRANSITION TO READY                                                 │
│    All via transitionDraftStoreStatus (kernel):                              │
│    - generating→ready (GENERATE_DRAFT_SUCCESS) in generateDraft              │
│    - draft→ready (PATCH_PREVIEW) in patchDraftPreview when status was draft   │
│    - Expiry: draft/generating→failed (EXPIRE) in getDraft                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. COMMIT / PUBLISH                                                          │
│    commitDraftStore (draftStoreService.js)                                    │
│    → transitionDraftStoreStatus(ready→committed, reason: PUBLISH,            │
│       extraData: committedAt, committedStoreId, committedUserId)             │
│    → AuditEvent created                                                       │
│    → Business + Products created in same tx                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. STORE VISIBLE ON PUBLIC                                                    │
│    Business + Product rows exist; public routes read from them.               │
│    No further DraftStore status transitions.                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Additional paths:**
- **GET /orchestra/job/:jobId:** Stale job → `transitionOrchestratorTaskStatus(running→failed, STALE_JOB_TIMEOUT)`. Draft already ready → `transitionOrchestratorTaskStatus(running→completed, DRAFT_READY_SHORTCUT)`.
- **POST /orchestra/job/:jobId/run:** Uses same `runBuildStoreJob`; no direct status writes.

---

## 2. Violations Found

### 2.1 No violations: status transitions through kernel

- **OrchestratorTask:** All status changes go through `transitionOrchestratorTaskStatus` in:
  - `orchestraBuildStore.js` (queued→running, running→completed, running→failed)
  - `miRoutes.js` (draft create failure: queued→failed; stale job: running→failed; draft ready shortcut: running→completed)
- **DraftStore:** All status changes go through `transitionDraftStoreStatus` in:
  - `draftStoreService.js` (generating→ready, generating→failed, draft→generating, draft→ready, ready→committed, expiry→failed)

### 2.2 Allowed non-status updates (not violations)

- **prisma.draftStore.update (preview only):**
  - `draftStoreService.js` ~184: updates `preview`, `updatedAt` only (no status).
  - `draftStoreService.js` ~1256: when `draft.status === 'generating'`, updates `preview`, `updatedAt` only (status unchanged).
- **prisma.orchestratorTask.update (request payload only):**
  - `miRoutes.js` ~818: sets `request.generationRunId`, `updatedAt` (no status).
  - `orchestraBuildStore.js` ~169: wipes `request.websiteUrl` for privacy (no status).

### 2.3 Deterministic failure handling

- **generateDraft** on error: `transitionDraftStoreStatus(generating→failed, ...)` with `extraData: { error, errorCode, recommendedAction }`. No silent skip.
- **runBuildStoreJob** on error: `transitionOrchestratorTaskStatus(running→failed, ...)` when `didTransitionToRunning` is true.
- **Expiry:** `getDraft` calls `transitionDraftStoreStatus(→failed, reason: EXPIRE)` then returns draft with `status: 'failed'` in memory.

### 2.4 AuditEvent coverage

- Every successful call to `transitionDraftStoreStatus` and `transitionOrchestratorTaskStatus` creates an `AuditEvent` (entityType, entityId, action: 'status_transition', fromStatus, toStatus, actorType, reason, correlationId).

---

## 3. Minimal Patch Suggestions

- **None required** for doctrine compliance: status transitions already go through the kernel; AuditEvents are written.
- **Optional hardening:**
  1. **transitionRules.js:** Ensure `DraftStore` allows `draft->generating` when the draft is created with status `generating` (no transition from “null” on create). Current rules already have `draft->generating` and `generating->ready`, etc. No change needed.
  2. **Normalize status string:** Some legacy docs refer to `status='error'`; code uses `'failed'`. transitionRules use `'failed'`. Keep as-is to avoid breaking existing data.
  3. **Sync-store / MI worker paths:** If any route or worker updates `DraftStore.status` or `OrchestratorTask.status` without going through the transition service (e.g. a sync-store handler that writes status directly), that would be a violation. Current audit did not find such a path in the traced lifecycle; any other entrypoints should be checked with:  
     `grep -rn "status.*ready\|status.*failed\|status.*error" --include="*.js" apps/core/cardbey-core/src`  
     and ensuring only `transitionService` performs status writes.

---

## 4. Manual Verification Checklist

- [ ] **Orchestra start (build_store)**  
  - Trigger `POST /api/mi/orchestra/start` with goal `build_store`.  
  - In DB: one `OrchestratorTask` (status `queued` then `running`), one `DraftStore` (status `generating`).  
  - After job completes: task status `completed`, draft status `ready`.  
  - Query `AuditEvent` for `entityType = 'OrchestratorTask'` and `entityType = 'DraftStore'`; expect transitions queued→running, running→completed, generating→ready.

- [ ] **Failure path**  
  - Force a draft generation failure (e.g. invalid input or mock throw in generateDraft).  
  - DraftStore status becomes `failed`; OrchestratorTask status becomes `failed`.  
  - AuditEvent rows for generating→failed and running→failed.

- [ ] **Stale job**  
  - Create a job, then wait longer than STALE_MS (or temporarily reduce it) and call `GET /orchestra/job/:jobId`.  
  - Task transitions to `failed` with reason `STALE_JOB_TIMEOUT`; AuditEvent present.

- [ ] **Commit/publish**  
  - From a ready draft, call commit (e.g. `POST /api/draft-store/:draftId/commit` or equivalent).  
  - DraftStore status becomes `committed`; AuditEvent with reason `PUBLISH` and toStatus `committed`.

- [ ] **No direct status writes**  
  - Search codebase for `prisma.draftStore.update` and `prisma.orchestratorTask.update`; confirm they do not set `status` except inside transition service (or are preview/request-only updates as above).

---

## 5. Files Touched (Audit Only)

No code was changed. The following were read to produce this audit:

- `apps/core/cardbey-core/src/kernel/transitions/transitionService.js`
- `apps/core/cardbey-core/src/kernel/transitions/transitionRules.js`
- `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js`
- `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`
- `apps/core/cardbey-core/src/routes/miRoutes.js`
- `docs/audits/transition-boundary-verification.md`
- `docs/audits/cardbey-doctrine-violations.md`
- `DRAFT_GENERATION_DEEP_SCAN_REPORT.md`

---

## 6. Risk Assessment

- **DraftStore lifecycle:** No structural change recommended. Current design uses a single transition service and AuditEvent; direct status updates were not found in the traced pipeline.
- **Risk if refactoring:** Introducing new status write paths (e.g. in sync-store or future workers) that bypass `transitionDraftStoreStatus` / `transitionOrchestratorTaskStatus` would break the doctrine and audit trail. Any new feature that changes draft or task status must call the kernel transition helpers.
- **Mitigation:** Keep this audit as reference; for any new endpoint or job that updates `DraftStore.status` or `OrchestratorTask.status`, require a code review that confirms use of the transition service only.
