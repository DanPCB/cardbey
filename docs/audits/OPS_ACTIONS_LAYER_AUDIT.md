# Ops Actions Layer Audit — Implementation Status

**Date:** 2026-02-27  
**Scope:** Internal “Ops Actions” bridge (Cursor-started). Audit only — no code changes unless explicitly requested.

---

## A) Executive summary

- **No dedicated “Ops Actions” API or module exists.** There are no routes or services named `opsActions`, `OpsAction`, `agentOps`, or `runbook`; no `/api/ops` or `/api/admin/ops`; no `getStatus`/`getAuditTrail`/`createIncident` or `images.detectMismatch`/`images.rebindByStableKey` as defined in the v1 spec.
- **Kernel transition service is the single status boundary for DraftStore and OrchestratorTask.** All DraftStore status changes go through `transitionDraftStoreStatus` in `draftStoreService.js`; all OrchestratorTask status changes go through `transitionOrchestratorTaskStatus` (miRoutes, orchestra, marketing test script). Each successful transition creates an `AuditEvent`. No direct `prisma.draftStore.update({ status })` or `prisma.orchestratorTask.update({ status })` bypasses the kernel in the codebase.
- **Existing “internal” / “admin” / “system” / “debug” surface is narrow and not spec-compliant.** `/api/internal` is Lambda/media callback + health (secret-gated). `/api/admin` is media scan/stats/S3 cleanup (auth + admin role). `/api/system` has metrics, diagnose, events/recent, and **stub** repair endpoints (no auth; repair does nothing). `/api/debug` and `/api/device/debug` are dev-only (NODE_ENV !== 'production').
- **Store generation and commit exist as normal product flows, not as ops actions.** `POST /api/draft-store/generate` and `POST /api/draft-store/:draftId/commit` (and MI orchestra start/run) drive draft creation, generation, and publish; they are not part of an allow-listed ops layer and do not expose `store.generateDraft`, `store.resumeGeneration`, `store.replayStep`, or `store.commit` under the intended ops contract.
- **Spec v1 actions are largely missing.** Of the nine intended actions, only the underlying **behaviours** for store generation and commit exist (via draft-store and kernel); there is no `ops.getStatus`, `ops.getAuditTrail`, `ops.createIncident`, no `images.detectMismatch`/`rebindByStableKey` API, and no `store.resumeGeneration`/`store.replayStep` API. `detectImageMismatch` exists only as a **dashboard-side stub** in `itemImageMapping.ts` (returns false).

---

## B) Discovered modules/routes

| Path | Type | What it does | Entities |
|------|------|----------------|----------|
| `apps/core/cardbey-core/src/routes/internal.js` | API | POST `/api/internal/media/optimized` (Lambda callback to mark asset optimized); GET `/api/internal/health`. Gated by `x-internal-secret` (INTERNAL_API_SECRET). | Media |
| `apps/core/cardbey-core/src/routes/admin.js` | API | requireAuth + requireAdmin. GET `/api/admin/health`; POST `/api/admin/scan-missing-media`; GET `/api/admin/media-stats`; GET `/api/admin/missing-media`; POST `/api/admin/s3-cleanup` (supports dryRun). | Media, Playlist (read), S3 |
| `apps/core/cardbey-core/src/routes/adminMedia.js` | API | Admin media management (mounted under `/api/admin/media`). | Media |
| `apps/core/cardbey-core/src/routes/systemRoutes.js` | API | GET `/api/system/metrics` (device/media counts, SSE); GET `/api/system/diagnose` (health stub); GET `/api/system/events/recent` (mock); POST `/api/system/repair/media-urls`, `.../refresh-playlists`, `.../clear-cache`, `.../restart-sse` — **stubs only** (return ok, no side effects). **No auth.** | None (read-only or no-op) |
| `apps/core/cardbey-core/src/routes/debug.js` | API | **Dev only** (mounted only when NODE_ENV !== 'production'). GET `/api/debug/pairing-stats`; GET `/api/debug/devices`. | Device, pairing stats |
| `apps/core/cardbey-core/src/routes/debugRoutesLite.js` | API | **Dev only.** GET `/api/debug/routes` (list mounted Express routes). | N/A |
| `apps/core/cardbey-core/src/routes/deviceDebug.js` | API | **Dev only.** GET `/api/device/debug/list-all` (all devices, orphan detection). | Device |
| `apps/core/cardbey-core/src/kernel/transitions/transitionService.js` | Service | `transitionDraftStoreStatus`, `transitionOrchestratorTaskStatus`. Validates rules, updates DB, creates AuditEvent. **No HTTP API**; used by services only. | DraftStore, OrchestratorTask |
| `apps/core/cardbey-core/src/kernel/transitions/transitionRules.js` | Config | Allowed transitions for DraftStore and OrchestratorTask. | N/A |
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | Service | createDraft, generateDraft, getDraft, commitDraft, patchDraftPreview, repairCatalog. Uses `transitionDraftStoreStatus` for all draft status changes. **Not an ops API**; called by draftStore routes and orchestra. | DraftStore |
| `apps/core/cardbey-core/src/routes/draftStore.js` | API | POST `/api/draft-store/generate`, GET/PATCH `/api/draft-store/:draftId`, POST `/api/draft-store/:draftId/commit`, etc. Normal product flow; optionalAuth/requireAuth and ownership checks. | DraftStore |
| `apps/core/cardbey-core/src/routes/miRoutes.js` | API | Orchestra: POST `/api/mi/orchestra/start`, GET `/api/mi/orchestra/job/:jobId`, POST `/api/mi/orchestra/job/:jobId/run`. Creates OrchestratorTask; uses `transitionOrchestratorTaskStatus`. | OrchestratorTask, DraftStore |
| `apps/dashboard/.../src/lib/itemImageMapping.ts` | Lib (FE) | getItemStableKey, buildImageByStableKey, getItemImage, getItemImageWithSource, **detectImageMismatch** (stub: returns false). Used by StoreDraftReview and StorePreviewPage. **No backend API**; no rebind. | N/A (UI resolution only) |

**Allow-listing / gating:**

- **internal:** Secret header only (INTERNAL_API_SECRET). Not SUPER_ADMIN or DEV_ONLY.
- **admin:** requireAuth + requireAdmin (role === 'admin'). No SUPER_ADMIN requirement; no DEV_ONLY.
- **system:** No auth; repair endpoints are stubs. **Risk:** If later implemented without gating, could be abused.
- **debug / device/debug:** Mounted only when `NODE_ENV !== 'production'`. No AuditEvent.

**Status writes:**

- DraftStore: All status changes go through `transitionDraftStoreStatus` (draftStoreService and any caller that changes draft status).
- OrchestratorTask: All status changes go through `transitionOrchestratorTaskStatus` (miRoutes, marketing-agent-test-flow script).
- Admin routes: Update Media (e.g. missingFile, optimizedKey); no DraftStore/OrchestratorTask status writes.
- System repair routes: No DB writes (stubs).

**AuditEvent:**

- Emitted **only** by kernel transition service (for DraftStore and OrchestratorTask status_transition). Actor/reason passed by caller.
- Admin scan-missing-media, s3-cleanup, internal media/optimized: **do not** create AuditEvent.
- No API to **read** AuditEvent (no getAuditTrail).

---

## C) Spec compliance checklist (intended v1 actions)

| Intended action | Status | Location / notes |
|-----------------|--------|-------------------|
| **images.detectMismatch(entityType, id)** | **Missing** (API). Partial (logic only) | Dashboard: `apps/dashboard/cardbey-marketing-dashboard/src/lib/itemImageMapping.ts` — `detectImageMismatch(_itemName, _imageMeta)` exists but is a **stub** (returns false). No backend API; no entityType/id. |
| **images.rebindByStableKey(entityType, id, dryRun: boolean)** | **Missing** | No code. Stable key logic exists in same `itemImageMapping.ts` (getItemStableKey, buildImageByStableKey) for **resolution only**; no rebind or write path. |
| **store.generateDraft({ businessName, category, seedData? })** | **Partial** | Behaviour exists via POST `/api/draft-store/generate` and MI orchestra (create draft + run job). Not exposed as a named ops action; no dedicated allow-listed contract. |
| **store.resumeGeneration(draftStoreId)** | **Missing** | No route or service method. Orchestra job run is by jobId (OrchestratorTask.id), not by draftStoreId. |
| **store.replayStep(draftStoreId, stepName, dryRun: boolean)** | **Missing** | No route or service; no step replay in draftStoreService. |
| **store.commit(draftStoreId)** | **Partial** | Behaviour exists: POST `/api/draft-store/:draftId/commit` (optionalAuth, rate-limited). Uses `commitDraft` → `transitionDraftStoreStatus(ready→committed)`. Not an ops-only, allow-listed action. |
| **ops.getStatus(entityType, id)** | **Missing** | No API. Generic status for DraftStore/OrchestratorTask/Device/User would require a small handler and entity routing. |
| **ops.getAuditTrail(entityType, id)** | **Missing** | No API. AuditEvent is written by kernel but never read by any route. |
| **ops.createIncident(entityType, id, reason, evidence)** | **Missing** | No API; no Incident model or table referenced in code. |

---

## D) Risk notes

- **Current workflows (store creation, draft preview, publishing, public page, image resolution):** Unaffected by this audit. No refactors or new routes were added. The only status writes for DraftStore/OrchestratorTask remain via the kernel transition service; image resolution remains in dashboard via getItemImage/getItemImageWithSource and itemImageMapping (no backend rebind).
- **Security:** `/api/system` has **no auth**. Repair endpoints are stubs today; if they are later implemented with real DB/writes, they must be gated (e.g. SUPER_ADMIN or INTERNAL_API_SECRET). Admin routes use role `admin` (not `super_admin`); if the spec requires SUPER_ADMIN for ops, admin.js does not satisfy that.
- **Idempotency:** Draft-store generate/commit and orchestra start/run are not designed as idempotent ops actions (e.g. duplicate commit could be rejected by transition rules; duplicate start creates new job). Any new ops layer should define idempotency keys or guards where needed.
- **Auditability:** Only kernel transition calls create AuditEvent. Admin actions (scan-missing-media, s3-cleanup) and internal media/optimized do not create AuditEvent; adding an ops layer should consider logging ops actions similarly (actor, reason, entityType, entityId).

---

## E) Recommended next 3 commits (minimal diffs)

### Commit 1: Ops read-only surface (getStatus + getAuditTrail)

- **Goal:** Implement read-only ops endpoints so agents/tooling can query status and audit trail without changing any existing workflow.
- **Files to touch:**  
  - New: `apps/core/cardbey-core/src/routes/opsRoutes.js` (or add to existing admin or a new `/api/ops` router).  
  - Mount in `server.js`: e.g. `app.use('/api/ops', opsRoutes)` with requireAuth + requireSuperAdmin (or requireAdmin if product decision is to use admin).  
  - Implement:  
    - `GET /api/ops/status?entityType=DraftStore|OrchestratorTask|...&id=...` → return current status (and minimal safe fields) for that entity.  
    - `GET /api/ops/audit-trail?entityType=...&id=...` → query AuditEvent by entityType + entityId, return ordered list (e.g. by createdAt).  
  - No changes to kernel, draftStore, or miRoutes.
- **Acceptance tests:**  
  - With valid admin/super_admin token: GET status for a known DraftStore id returns status; GET audit-trail for same returns AuditEvent rows.  
  - Without token or with non-admin: 401/403.  
  - entityType not in allow-list: 400.

### Commit 2: Gate system repair and document ops surface

- **Goal:** Ensure repair endpoints (when implemented) and any future ops write actions cannot be called without proper gating; document the intended ops surface.
- **Files to touch:**  
  - `apps/core/cardbey-core/src/routes/systemRoutes.js`: Add middleware to POST `/repair/*` (e.g. require INTERNAL_API_SECRET or requireAuth + requireSuperAdmin). If keeping stubs, at least add a comment that real implementation must use same gating.  
  - `docs/audits/OPS_ACTIONS_LAYER_AUDIT.md`: Add a “Recommended gating” line for system repair and for any new ops write actions (SUPER_ADMIN and/or DEV_ONLY or INTERNAL_API_SECRET).
- **Acceptance tests:**  
  - POST `/api/system/repair/media-urls` without secret/admin returns 401/403 (once middleware is added).  
  - Doc review: audit doc clearly states repair must be gated.

### Commit 3: images.detectMismatch and rebindByStableKey (API stub or minimal backend)

- **Goal:** Expose images ops in line with spec without changing store preview or public page behaviour.
- **Files to touch:**  
  - New or extend ops routes: `POST /api/ops/images/detect-mismatch` (body: entityType, id) and `POST /api/ops/images/rebind-by-stable-key` (body: entityType, id, dryRun).  
  - Backend: For DraftStore, resolve draft preview items and use stable-key logic (e.g. delegate to a shared getItemStableKey/buildImageByStableKey if moved to core, or call existing logic). detectMismatch: return { mismatch: boolean, detail? }. rebindByStableKey: if dryRun, return planned changes; if !dryRun, persist only item/draft image mappings (no direct status write; no change to kernel transitions).  
  - Keep dashboard `detectImageMismatch` as-is or have it call the new API if desired later.
- **Acceptance tests:**  
  - detect-mismatch for a valid DraftStore id returns 200 and { mismatch: boolean }.  
  - rebind with dryRun=true returns 200 and a list of planned changes; rebind with dryRun=false (if implemented) updates only image data and does not change draft status.  
  - All ops routes remain gated (e.g. requireSuperAdmin).

---

**End of audit.** No code was changed; only this report was added. Any code changes above are proposals for a follow-up request.
