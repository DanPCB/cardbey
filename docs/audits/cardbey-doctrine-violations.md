# Cardbey Doctrine Violations Audit Report

**Generated:** 2026-02-20  
**Scope:** Full codebase static analysis (audit only; no production refactor)

---

## 1. Executive Summary

- **V1 – State fragmentation:** Business state and status changes (draft/ready/running/completed/failed) are spread across 15+ files with no central state machine. `draftStoreService.js`, `orchestraBuildStore.js`, and `miRoutes.js` each mutate status independently.
- **V2 – MI/orchestra bypasses infra:** `miRoutes.js` and `orchestraBuildStore.js` call `prisma.*` directly (40+ writes in miRoutes alone). MI behaves as a "doer" that mutates DB instead of a "conductor" that calls capabilities. No capability layer or bounded service boundary.
- **V3 – Duplicated readiness rules:** `canPublish`, `draftReadyForPublish`, `visualsStatusForPublish`, and product completeness live only in the frontend (`StoreDraftReview.tsx`, `profileVisuals.ts`). Backend has no `/readiness` endpoint.
- **V4 – Compound side-effect capabilities:** True multi-action functions (e.g. `runBuildStoreJob`, `generateDraft`) perform multiple state changes in one call; no single deterministic action boundary.
- **V5 – No risk-tier metadata:** No green/yellow/red tagging on actions. All mutations treated uniformly; no approval gates by risk level.
- **V6 – Auth gating fragmented:** `requireAuth`, `optionalAuth`, `guestSessionId`, `Gate1` (MI tools), and UI `gatekeeper` coexist without a single policy layer.
- **V7 – No transition audit trail:** No `audit`, `transition`, `history`, or `logEvent` for draft→publish or other business transitions. `qr.js` has narrow `scanEvent.create` only.
- **V8 – Job runner not idempotent:** Partial states possible on failure; no retry semantics; `OrchestratorTask` status updated directly by job runner without event log. Idempotency keys present in spec/schema but **not enforced** on create/publish endpoints.
- **V9 – Public feed brittle:** `/api/public/stores/feed` has returned 500 (PrismaClientInitializationError). Uses inline `FEED_CATEGORY_TYPES`, direct Prisma, no rate limiting or caching contract. **Severity: High** (reliability break on public surface).
- **V10 – UI owns business logic:** Publish eligibility, progress stepper, and readiness are determined in `StoreDraftReview.tsx` and `profileVisuals.ts`; backend does not enforce.
- **V11 – No outbox/webhook boundary:** Schema supports `IdempotencyKey` and `WEBHOOK` models, but **no runtime webhook delivery/signing implementation** exists. Idempotency exists in spec (OpenAPI) and is enforced in narrow AI layer (`ai/suggestions`, `ai/events`) but **not consistently** on orchestra/start, store publish, or draft commit.

---

## 2. Doctrine Checklist

| Doctrine Rule | Status | Notes |
|---------------|--------|-------|
| AI ↔ Infra first (clean capability core) | ❌ Fail | MI routes and job runner touch DB directly; no capability wrappers |
| State-machine centric | ❌ Fail | Status mutations scattered; no single state machine |
| MI/orchestrator must NEVER bypass kernel | ❌ Fail | miRoutes, orchestraBuildStore use prisma.* directly |
| One capability = one deterministic action | ⚠️ Partial | Some services focused; orchestration mixes concerns |
| Risk-tiered automation (green/yellow/red) | ❌ Fail | No risk metadata on actions |
| Dual-mode UX (Operator/Observer) supported by events | ❌ Fail | No event/audit trail for transitions |
| Flexible manual overrides allowed (but must be logged) | ❌ Fail | No logging of manual overrides |
| Integrations via event outbox/webhooks | ❌ Fail | Schema supports it; implementation missing |

---

## 3. Findings (Grouped by Violation Category)

### V1: No centralized state machine / status mutation scattered

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | 369, 387–400, 1049, 1184, 1232, 1272, 1310 | `status: 'ready'`, `status: 'generating'`, `status: 'failed'` | Direct status writes in commit/generate flows |
| `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | 27–37, 53–56, 72–79, 84–93, 171–177, 192–198 | `status: 'running'`, `status: 'completed'`, `status: 'failed'` | OrchestratorTask status updates |
| `apps/core/cardbey-core/src/routes/miRoutes.js` | 776, 792, 995, 1131, 1157, 1241–1588, 1672–1841 | `prisma.orchestratorTask.update` with status | Many direct task status updates |
| `apps/core/cardbey-core/src/routes/draftStore.js` | 210–246, 308, 348, 455, 565, 637 | `status` | Draft status in route handlers |
| `apps/dashboard/.../StorePreviewPage.tsx` | 79–81, 517, 678, 743, 1061 | `status`, `setStatus` | UI status state and display |
| `apps/core/cardbey-core/prisma/schema.prisma` | — | `Business.isActive`, `DraftStore.status`, `OrchestratorTask.status` | Schema-level status fields |

**Impact:** Violates "state-machine centric"; transitions implicit and scattered.  
**Severity:** Critical  
**Suggested Fix:** Introduce `stateTransitionService.js` with allowed transitions; route all status changes through it.

---

### V2: MI/orchestra bypasses infra (direct DB writes)

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| `apps/core/cardbey-core/src/routes/miRoutes.js` | 436, 456, 486, 529, 776, 792, 963, 995, 1124–1841 | `prisma.orchestratorTask`, `prisma.draftStore`, `prisma.content`, `prisma.user` | Route handlers use Prisma directly |
| `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | 27–179, 191–254 | `prisma.orchestratorTask.update`, `prisma.draftStore.findUnique/create` | Job runner touches DB |
| `apps/core/cardbey-core/src/services/menuVisualAgent/imageGenerationJob.ts` | 39–106, 104–150 | `prisma.business`, `prisma.orchestratorTask` | Worker polls and updates tasks |
| `apps/core/cardbey-core/src/services/menuVisualAgent/menuVisualAgent.ts` | 76, 125, 144 | `prisma.product.findMany`, `prisma.product.update` | Menu visual agent updates products |
| `apps/core/cardbey-core/src/worker.js` | 49–54 | `processImageGenerationJobs(5)` | Worker triggers DB-touching jobs |

**Impact:** Violates "MI/orchestrator must NEVER bypass kernel." MI = "doer" instead of "conductor."  
**Severity:** Critical  
**Suggested Fix:** Add capability wrappers; route all `prisma.*` orchestration through them.

---

### V3: Duplicated readiness rules (UI vs backend)

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| `apps/dashboard/.../StoreDraftReview.tsx` | 2031–2281, 4191 | `computeProductReadiness`, `visualsStatusForPublish`, `draftReadyForPublish`, `canPublish` | UI-only readiness logic |
| `apps/dashboard/.../profileVisuals.ts` | 51–80 | `getVisualsStatus`, `isCompleteForPublish` | Visuals completion |
| `apps/dashboard/.../draftMedia.ts` | 98–111 | `getDraftVisualsStatus` | Draft visuals completion |
| `apps/dashboard/.../ProductReviewCard.tsx` | 73–93 | `missing` checks (tags, category, image) | Per-product completeness |
| `apps/core/.../buildCatalog.js` | 16–17, 458–467 | `validateAndCorrect`, `validateAndCorrectCatalog` | Backend catalog validation |
| `apps/core/.../draftStoreService.js` | 1310 | `status === 'ready'` | Backend readiness check |

**Impact:** No single source of truth; frontend and backend rules can diverge.  
**Severity:** High  
**Suggested Fix:** Add `GET /api/draft-store/:draftId/readiness` with server-side rules; align with frontend.

---

### V4: Compound side-effect capabilities

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| `apps/core/.../orchestraBuildStore.js` | 19–204 | `runBuildStoreJob` | Atomic queued→running, generateDraft, completed/failed; multiple state changes in one call |
| `apps/core/.../draftStoreService.js` | 360–450+ | `generateDraft` | Status updates, catalog generation, hero/images, finalize; many side effects |
| `apps/core/.../publishDraftService.js` | 85+ | `publishDraft` | findTargetDraft, ownership, Business create/update, Products create; multi-action |

**Impact:** One function = many actions; violates "one capability = one deterministic action."  
**Severity:** High  
**Suggested Fix:** Decompose into single-action capability wrappers; orchestration calls capabilities, not Prisma.

---

### V5: No risk-tier metadata per action

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| (Codebase-wide) | — | risk, green, yellow, red, approval | No matches for risk-tier metadata |

**Impact:** Violates "risk-tiered automation."  
**Severity:** Medium  
**Suggested Fix:** Add risk metadata to capability registry; enforce approval gates for yellow/red actions.

---

### V6: Auth gating fragmented / UI-driven

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| `apps/core/cardbey-core/src/middleware/auth.js` | 42–176, 187–209 | `requireAuth`, `optionalAuth` | Backend middleware |
| `apps/core/cardbey-core/src/server.js` | 240, 286 | `x-user-key`, `X-User-Key`, `Authorization` | CORS headers |
| `apps/core/cardbey-core/src/routes/miToolsRoutes.js` | 103 | `authGate: 'Gate1'` | MI tools auth gate |
| `apps/dashboard/.../useGatekeeper.ts` | 43–171 | `isGuestSession`, `isRealAuthed`, `requireAuth`, `requireAccount` | Frontend auth gating |
| `apps/dashboard/.../StorePreviewPage.tsx` | 1991, 2580, 2869 | `requireAuth` | UI auth requirements |
| `apps/core/cardbey-core/src/routes/draftStore.js` | 469–476 | `guestSessionId`, `X-Guest-Session` | Guest session flow |
| `docs/openapi/mi-tools.v1.yaml` | 9, 355, 359 | `authGate: "Gate1"`, `requiresAuth` | OpenAPI spec |

**Impact:** Multiple auth mechanisms; no single policy layer.  
**Severity:** High  
**Suggested Fix:** Add `authPolicy.js` mapping actions to auth requirements; use from middleware and gatekeeper.

---

### V7: No transition event log / audit trail

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| (Codebase-wide) | — | `audit`, `event`, `transition`, `history`, `timeline`, `logEvent` | No general-purpose audit in production |
| `apps/core/cardbey-core/src/routes/qr.js` | 157 | `prisma.scanEvent.create` | QR scan event (narrow use) |
| `apps/core/cardbey-core/src/routes/deviceEngine.js` | 3194 | "log as device log for audit trail" | Device-specific only |

**Impact:** Violates "dual-mode UX supported by event/audit trail."  
**Severity:** High  
**Suggested Fix:** Add `AuditEvent` table and `transitionEventService.js`; log draft→publish, status changes.

---

### V8: Job runner not idempotent / partial states / no retries / idempotency not enforced

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| `apps/core/.../orchestraBuildStore.js` | 53–93, 171–198 | `runBuildStoreJob`, status updates | No retry; partial state on failure |
| `apps/core/.../draftStoreService.js` | 1276 | "Idempotent: if already committed" | Commit idempotent; job runner is not |
| `apps/core/.../miRoutes.js` | 1017 | "idempotent with /run" | Comment only; no key enforcement |
| `apps/core/.../prisma/schema.prisma` | 359–368 | `IdempotencyKey` model | Schema exists |
| `apps/core/.../ai/suggestions/router.js` | 81–147, 175–194 | `prisma.idempotencyKey.findUnique/create` | **Enforced** in AI suggestions only |
| `apps/core/.../stores.js` | 1239–1256 | POST /api/store/publish | **No** IdempotencyKey check |
| `apps/core/.../miRoutes.js` | 776–784 | POST /api/mi/orchestra/start | **No** IdempotencyKey check |

**Impact:** Partial states possible; no retry. Idempotency present in spec/schema but **not enforced** on create/publish endpoints.  
**Severity:** High  
**Suggested Fix:** Add idempotency keys to job execution; enforce on orchestra/start and store/publish.

---

### V9: Read surfaces brittle (public feed 500 risk)

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| `apps/core/cardbey-core/src/routes/publicUsers.js` | 94–189 | `FEED_CATEGORY_TYPES`, `GET /stores/feed` | Inline category map; direct Prisma |
| `apps/dashboard/.../usePublicStoreFeed.ts` | 24–50 | `getPublicStoresFeed`, `category`, `limit` | Client feed usage |
| `apps/dashboard/.../api.ts` | 969, 983 | `GET /api/public/stores/feed` | API client |
| `apps/dashboard/.../StoreReelsFeed.jsx` | 202–282 | `category`, `pageSize`, `usePublicStoreFeed` | Feed UI |

**Impact:** Feed has returned 500 (PrismaClientInitializationError). Tightly coupled to DB; no rate limiting or caching contract. Reliability break on public surface.  
**Severity:** High  
**Suggested Fix:** Extract `FEED_CATEGORY_TYPES` to shared config; add rate limiting and documented contract.

---

### V10: UI owns business logic (progress stepper, publish eligibility)

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| `apps/dashboard/.../StoreDraftReview.tsx` | 2031–2281, 4191, 5916–5935 | `visualsStatusForPublish`, `draftReadyForPublish`, `canPublish`, `isCompleteForPublish` | Publish eligibility in UI |
| `apps/dashboard/.../profileVisuals.ts` | 51–80 | `getVisualsStatus`, `isCompleteForPublish` | Visual completeness |
| `apps/dashboard/.../ContentStudioEditor.tsx` | 1262 | stepper labels | Stepper UI |
| `apps/dashboard/.../PromoWizardBanner.tsx` | 3 | stepper | Promo wizard stepper |

**Impact:** Backend does not enforce publish-readiness; UI is authoritative.  
**Severity:** Critical  
**Suggested Fix:** Add backend readiness endpoint; use for both API validation and UI display.

---

### V11: No outbox/webhook boundary

| File | Lines | Symbol | Evidence |
|------|-------|--------|----------|
| (Codebase-wide) | — | webhook delivery, HMAC, signature | **No runtime webhook delivery/signing implementation** |
| `apps/core/.../prisma/schema.prisma` | 213, 358–368 | `WEBHOOK`, `IdempotencyKey` | **Schema supports it; implementation missing/unused** |
| `docs/openapi/mi-tools.v1.yaml` | 8, 330 | `idempotencyKey` | OpenAPI; **not enforced** on orchestra/start, publish, commit |
| `apps/core/.../draftStore.js` | 787, 801, 826 | idempotent commit | Partial idempotency in commit only |

**Impact:** Drift toward workflow builder; no integration boundary. Idempotency exists in spec/schema but **not enforced consistently** on create/publish endpoints.  
**Severity:** Medium  
**Suggested Fix:** Implement outbox for external events; add webhook delivery with HMAC; enforce idempotency on risky creates.

---

## 4. Hotspots Table (Top 20)

| Rank | Severity | File | Function/Symbol | Violations | Notes |
|------|----------|------|-----------------|------------|-------|
| 1 | Critical | `apps/core/cardbey-core/src/routes/miRoutes.js` | handleOrchestraStart, job handlers | V1, V2 | 40+ prisma writes |
| 2 | Critical | `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | runBuildStoreJob | V1, V2, V4, V8 | Job runner touches DB; compound |
| 3 | Critical | `apps/dashboard/.../StoreDraftReview.tsx` | canPublish, handlePublish, visualsStatusForPublish | V1, V3, V8, V10 | UI owns publish logic |
| 4 | Critical | `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | commitDraft, generateDraft | V1, V2, V4 | Direct status/DB writes |
| 5 | High | `apps/core/cardbey-core/src/routes/draftStore.js` | commit, patch, generate | V1, V6 | Route-level DB writes |
| 6 | High | `apps/dashboard/.../StorePreviewPage.tsx` | status, draft/preview, commit | V1, V6 | UI status + auth |
| 7 | High | `apps/core/.../menuVisualAgent/imageGenerationJob.ts` | processImageGenerationJobs | V2 | Worker DB access |
| 8 | High | `apps/core/.../menuVisualAgent/menuVisualAgent.ts` | generateImagesForMenu | V2 | Product updates |
| 9 | High | `apps/dashboard/.../profileVisuals.ts` | getVisualsStatus | V3, V10 | Readiness logic |
| 10 | High | `apps/core/cardbey-core/src/middleware/auth.js` | requireAuth, optionalAuth | V6 | Auth fragmentation |
| 11 | High | `apps/dashboard/.../useGatekeeper.ts` | requireAuth, requireAccount | V6 | Frontend auth |
| 12 | High | `apps/core/cardbey-core/src/routes/publicUsers.js` | GET /stores/feed | V9 | Brittle feed; has returned 500 |
| 13 | Medium | `apps/dashboard/.../usePublicStoreFeed.ts` | usePublicStoreFeed | V9 | Feed client |
| 14 | Medium | `apps/core/cardbey-core/src/routes/qr.js` | create, resolve | V6, V7 | QR + scanEvent |
| 15 | Medium | `apps/dashboard/.../quickStart.ts` | quickStartCreateJob | V2, V11 | Orchestra entry |
| 16 | Medium | `apps/core/cardbey-core/src/worker.js` | startWorker | V2 | Worker entry |
| 17 | Medium | `apps/core/cardbey-core/src/routes/menuRoutes.js` | sync, images/suggest | V6 | Menu DB writes |
| 18 | Medium | `apps/core/.../billing/creditsService.js` | deduct, grant | V2 | Credits DB |
| 19 | Low | `apps/dashboard/.../ProductReviewCard.tsx` | missing checks | V3 | Product completeness |
| 20 | Low | `apps/core/cardbey-core/src/routes/miToolsRoutes.js` | authGate Gate1 | V6 | MI tools auth |

---

## 5. Minimal Migration Plan (NO CODE CHANGES)

| Step | Action | Description |
|------|--------|-------------|
| **Step 0** | Add capability wrapper layer | Introduce thin wrappers (`orchestratorTask.setStatus`, `draftStore.setStatus`, `draftStore.publish`). Route MI/orchestra writes through wrappers. Boundary insertion, not rewrite. |
| **Step 1** | Introduce transition event schema + logger | Add `AuditEvent` table; log DraftStore status, OrchestratorTask status, publish transitions. Fields: before/after, actor, correlationId, timestamp, reason. |
| **Step 2** | Route all mutations through capabilities | Gradually move `prisma.*` calls from miRoutes, orchestraBuildStore into capability functions. Single write path. |
| **Step 3** | Add risk tagging per capability + approval gates | Tag each capability (green/yellow/red). Yellow/red require approval or audit. |
| **Step 4** | Consolidate auth gating into policy map | Create Action → AuthRequirement table (JS object). Backend middleware and frontend gatekeeper consult same policy. |
| **Step 5** | Add outbox/webhook boundary + idempotency | Implement outbox for external events. Add webhook delivery with HMAC. Enforce `idempotencyKey` on create/confirm endpoints. |
| **Step 6** | Enable dual-mode UX (Operator/Observer) | Expose transition events via API; build Observer view from event log. |

---

## 6. French Baguette Flow Risk Assessment

**Flow:** French Baguette café store → coffee product → Smart Object promo via QR on cup → loyalty program.

| Component | Location | Risk from Audit |
|-----------|----------|-----------------|
| Store | `draftStoreService.js`, `publishDraftService.js` | V1, V2, V10: status/DB scattered |
| Product | `draftStoreService.js`, `menuRoutes.js`, `menuVisualAgent.ts` | V2: agent touches products directly |
| Smart Object promo | `miRoutes.js` (handlePromoFromDraft ~L389), Content/StorePromo | V2: MI creates content directly |
| QR on cup | `qr.js`, `CreateQRPromoModal.tsx`, `StorePreviewPage` (`?promo=`) | V6, V7: auth + narrow scanEvent |
| Loyalty | `loyaltyRoutes.js`, `loyaltyEngineRoutes.js` | V6: auth fragmentation |

**Mitigation:** Any refactor of status (V1), orchestration (V2), publish readiness (V3/V10), or auth (V6) must explicitly validate: store publish → product visibility; promo creation → Smart Object and Dynamic QR linkage; `?promo=` resolution; loyalty endpoints and auth.

**Audit impact:** Read-only; no production code modified. Flow remains functional.
