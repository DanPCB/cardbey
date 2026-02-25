# Minimum Fix Set – Execution Plan (Merged & Tightened)

**Goal:** One end-to-end automation: minimal input → published store URL. No new product features.  
**Reference:** `docs/CARDBEY_MI_AUTOMATION_AUDIT.md` §5.

**LOCKED RULE:** Before any refactor/integration, assess whether the change could break the current working workflow (Quick Start: orchestra/start + run + publish). If there is any risk, list break risks first and implement safeguards (feature flag, idempotency guard, backward-compatible behavior) before changing logic.

---

## Phase 0 – Safety net (before changing behavior)

- Add **traceId** logging around: `orchestra/start`, `runBuildStoreJob`, `generateDraft`, `publishDraft` (so auto-run and /run can be correlated).
- Add **idempotency/concurrency guard**: `/run` and auto-run must not double-execute a build_store task.
  - If task is already `running` or `completed`, do nothing.
  - Use an atomic transition `queued` → `running` (e.g. `update` with `where: { id, status: 'queued' }`; if no row updated, another runner won, return without running).
  - When calling `generateDraft`, ensure draft status is `generating` (already implied by current logic).

**Acceptance:** Same job cannot be run twice; logs show traceId across start → run → generateDraft.

---

## Phase 1 – Auto-run (pace snap)

Do first. This removes the UI requirement to call `/run`.

1. **Implement `runBuildStoreJob(prisma, jobId, draftId, generationRunId)`**
   - Idempotent: if task already `running` or `completed`, return without running.
   - Atomic: transition task from `queued` to `running` only if current status is `queued`; otherwise return (prevents double-run with auto-run + UI /run).
   - Load draft; if not found or status not `generating`/`ready`, update task to failed or completed as appropriate.
   - If draft already `ready`, mark task `completed` and return.
   - Else `setImmediate` → `generateDraft(draftId)` → mark task completed or failed.
   - Log with traceId.

2. **Call from `POST /api/mi/orchestra/start`** when `goal === 'build_store'` and a draft was created (`needDraft` && `createdDraftId`). Before `return res.json(...)`, call `runBuildStoreJob(prisma, job.id, createdDraftId, resolvedRunId)`.

3. **Replace** the inline build_store body in `POST /api/mi/orchestra/job/:jobId/run` with a single call to `runBuildStoreJob(...)`. Keep same guards (draft not found, draft already ready, invalid status).

**Acceptance:** Start-only causes draft to become ready without calling `/run`. UI still calling `/run` is safe (idempotent / no double execution).

---

## Phase 2 – Headless proof endpoint

- **Extract publish logic** into `services/draftStore/publishDraftService.js`.
  - `publishDraft(prisma, { storeId, generationRunId, userId })` → same behavior as current publish handler (find draft, resolve effectiveStoreId, transaction: Business + Products + DraftStore committed + ActivityEvent).
  - HTTP handler in `stores.js` stays thin: validate request, call `publishDraft`, map result/errors to HTTP status and body.
- **Add `POST /api/automation/store-from-input`** (requireAuth).
  - Input: `{ businessName: string, businessType?: string, location?: string }`.
  - Flow: validate → createDraft with runId (e.g. cuid/uuid) → generateDraft(draft.id) → publishDraft({ storeId: 'temp', generationRunId: runId, userId: req.userId }) → return `{ ok: true, storeId, storeUrl }`.
  - Call the **publish service directly**, not the HTTP route.

**Acceptance:** One authenticated request returns a published store URL. Existing `POST /api/stores/publish` behavior unchanged.

---

## Phase 3 – Shared draft preview schema (Zod)

- Add **`draftPreviewSchema.ts`** and **`parseDraftPreview(value)`** (safe parser; returns null on invalid).
- **Soft** validation on write in `draftStoreService.js`: after building preview, call parser; if invalid, log only (do not change behavior).
- **Hard** validation in publish path: when reading draft preview, call parser; if null, reject with 400 and clear message.

**Acceptance:** Existing drafts that publish today still publish; invalid previews are rejected at publish time.

---

## Phase 4 – Unify `/api/business/create`

- **Option A (recommended):** Align backend with dashboard payload.
  - Parse body as `{ sourceType, payload, options?, idempotencyKey? }`.
  - Map to orchestra-style payload; require auth; delegate to same “create job + autorun” logic (orchestra/start flow or shared helper); return `{ jobId, storeId, tenantId, generationRunId }`.
- **Option B:** Retire endpoint; document orchestra/start as the only path; fix misleading comments/imports.

**Acceptance:** No contract mismatch; one supported path for “create job”.

---

## Phase 5 – Docs and cleanup

- Update docs: headless flow (`POST /api/automation/store-from-input`), orchestra/start auto-run (no `/run` required), and (if Option B) deprecation of `/api/business/create`.
- Remove misleading comments (e.g. “uses startCreateBusiness” when code uses quickStartCreateJob).
- Add short “How to run the proof test” (curl for store-from-input, expected output).

---

## Execution checklist

| Phase | Step | Description |
|-------|------|-------------|
| 0 | | traceId logging + idempotency/concurrency guard for build_store |
| 1 | 1.1 | Extract `runBuildStoreJob`, atomic queued→running |
| 1 | 1.2 | Call from `POST /orchestra/start` when needDraft |
| 1 | 1.3 | Replace `/run` build_store body with `runBuildStoreJob` |
| 2 | 2.1 | Extract `publishDraftService.js`; stores.js publish delegates to it |
| 2 | 2.2 | Add `POST /api/automation/store-from-input` (use service, not route) |
| 3 | 3.1 | Add `draftPreviewSchema.ts` + `parseDraftPreview` |
| 3 | 3.2 | Soft validate on write (log only); hard validate on publish |
| 4 | | Fix or retire `/api/business/create` (Option A or B) |
| 5 | | Docs + proof test note + remove confusion |

---

## Risk and scope

- **Backward compatibility:** Quick Start (orchestra/start + optional /run + publish) must keep working. Auto-run is additive; /run remains idempotent.
- **No new features:** Only wiring and one new endpoint reusing existing services.
- **Testing:** After each phase, run existing tests; add integration or manual proof test for store-from-input.

---

## Proof test

See **`docs/HOW_TO_RUN_PROOF_TEST.md`** for curl and expected output for `POST /api/automation/store-from-input`.
