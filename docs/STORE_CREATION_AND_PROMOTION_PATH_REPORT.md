# Store Creation and Promotion Path — Status Report & Execution Plan

**Purpose:** Single report on what is **done** vs **left** for the store creation and promotion path, with a concrete execution plan to finish it.  
**Reference:** `docs/PHASE_STORE_MENU_AUDIT_AND_PLAN.md`, `docs/MINIMUM_FIX_SET_EXECUTION_PLAN.md`, `docs/PHASE1_SHIP_CHECKLIST.md`, `docs/HOW_TO_RUN_PROOF_TEST.md`.

---

## 1. Spine (canonical flow)

The locked spine is:

```
Quick Create (FeaturesPage) → POST /api/mi/orchestra/start
    → auto-run (runBuildStoreJob) → generateDraft
    → Store Review (StoreReviewPage + StoreDraftReview)
    → GET /api/stores/temp/draft?generationRunId=...
    → [optional] PATCH /api/draft-store/:draftId (Save draft)
    → POST /api/store/publish (or POST /api/draft-store/:draftId/commit)
    → Live store
Promotion path: Draft Review → "Create Promo" / "Create QR Promo" / "Smart Object Promo"
    → Content Studio or Store Promotions page → QR / landing
```

---

## 2. What’s already done

### 2.1 Store creation (backend)

| Area | Status | Evidence |
|------|--------|----------|
| **Orchestra start + auto-run** | ✅ Done | `runBuildStoreJob` in `orchestraBuildStore.js`; called from `POST /api/mi/orchestra/start` and from `POST /api/mi/orchestra/job/:jobId/run`. No separate “Run” required. |
| **Idempotency / concurrency** | ✅ Done | Atomic `queued` → `running` in `runBuildStoreJob`; duplicate run is a no-op. |
| **Headless proof** | ✅ Done | `POST /api/automation/store-from-input` (auth); creates draft, generates, publishes in one request. See `docs/HOW_TO_RUN_PROOF_TEST.md`. |
| **Publish service** | ✅ Done | `publishDraftService.js`: `findTargetDraft(storeId, generationRunId)`, supports `storeId === 'temp'`; `publishDraft()` uses `preview.items` for products. |
| **Draft preview at publish** | ✅ Done | Publish path uses `preview.items` (and fallbacks) in `publishDraftService.js`, `stores.js`, `draftStore.js`. |
| **Draft preview schema** | ✅ Done | `parseDraftPreview` in `draftPreviewSchema.ts` used in publish path. |
| **PATCH draft-store** | ✅ Done | `PATCH /api/draft-store/:draftId` in `draftStore.js`; auth + ownership (orchestra runId or store); merges `preview` (items, categories, meta). |
| **Full menu (~30 items)** | ✅ Done | `draftStoreService.js`: template library with ~30 items per type (cafe, restaurant, bakery, etc.); OCR cap 30; menu-first generation when enabled. |

### 2.2 Store creation (frontend)

| Area | Status | Evidence |
|------|--------|----------|
| **Quick Create** | ✅ Done | `FeaturesPage`, `quickStart.ts` → `POST /api/mi/orchestra/start`; navigate to store review with `jobId`, `generationRunId`. |
| **Draft Review** | ✅ Done | `StoreReviewPage`, `StoreDraftReview`; load draft via `GET /api/stores/temp/draft?generationRunId=...`; effectiveDraft = base + localStorage patch. |
| **Save draft** | ✅ Done | “Save Menu” / “Save draft” calls `apiPATCH(API.draftStore(draftId), { preview })` with effectiveDraft; backend is source of truth after save. |
| **Item edit** | ✅ Done | `ProductReviewCard`, `ProductEditDrawer`, `useStoreDraftPatch`; edits go to patch then can be saved via PATCH. |
| **Auth gating** | ✅ Done | `RequireAuth` on review route; `ensureAuth` before publish; 401/403 from backend for draft/preview/publish when not owner. |
| **Job progress / polling** | ✅ Done | `useOrchestraJobUnified` / job poll; draft poll; terminal status handling. See `docs/DRAFT_JOB_INSTRUMENTATION.md`. |

### 2.3 Promotion path (backend)

| Area | Status | Evidence |
|------|--------|----------|
| **Store Promo (Scan & Redeem)** | ✅ Done | `StorePromo` model; `GET/POST /api/stores/:storeId/promos`; `POST/GET/PATCH /api/promos`; public `GET /api/promos/:promoId` for landing. |
| **Public promo scan** | ✅ Done | `promosPublic.js`: `GET /api/public/promos/:slug`, `POST /api/public/promos/:slug/scan`. |
| **Smart Object** | ✅ Done | `smartObjects.js`: `POST /api/smart-objects`, `GET /api/smart-objects/:idOrPublicCode`, `GET .../landing`, `POST .../active-promo`. |

### 2.4 Promotion path (frontend)

| Area | Status | Evidence |
|------|--------|----------|
| **Create Promo from item** | ✅ Done | `ProductReviewCard` “Create Promo”; `createPromoDraftFromItem`; navigate to Content Studio with intent=promotion. |
| **Create QR Promo (Draft Review)** | ✅ Done | “More” → “Create QR Promo” → navigate to `/dashboard/stores/:storeId/promotions`. |
| **Store Promotions page** | ✅ Done | `StorePromotionsPage`; create promo, landing URL, QR download. |
| **Promo landing** | ✅ Done | `PromoScanRedeemLandingPage` at `/p/:promoId` (or `/p/promo/:publicId`). |
| **Smart Object + QR** | ✅ Done | `SmartObjectPromoWizard`, `PromoDeployPage`; create Smart Object, set active promo; landing uses `/q/:publicCode` and API `GET /api/smart-objects/:idOrPublicCode/landing`. |

### 2.5 Phase 1 ship polish (done)

- Auth-aware header on marketing page; image autofill (auto + repair); vertical guard for desserts; Create QR Promo from Draft Review; MI chips (Generate tags, Rewrite, Change hero). See `docs/PHASE1_SHIP_CHECKLIST.md`.

### 2.6 Business create alignment

- `POST /api/business/create` uses `createBuildStoreJob` + `runBuildStoreJob` (same as orchestra/start). See `business.js` and `MINIMUM_FIX_SET_EXECUTION_PLAN.md` Phase 4.

---

## 3. What’s left (gaps and polish)

### 3.1 Verification and hardening

| Item | Priority | Detail |
|------|----------|--------|
| **End-to-end manual run** | P0 | One full pass: Quick Create → Edit items → Save draft → Publish → open live store → Create QR Promo → open `/p/:slug` in incognito → Create Smart Object from item → Deploy → open `/q/:publicCode`. Confirm no 404s or broken links. |
| **Headless test** | P1 | Run `POST /api/automation/store-from-input` per `docs/HOW_TO_RUN_PROOF_TEST.md`; confirm 200 and store URL. |
| **Phase 1 checklist** | P1 | Execute manual verification script in `docs/PHASE1_SHIP_CHECKLIST.md` (auth, auto images, manual image, promo, desserts, repair). |

### 3.2 Optional / later

| Item | Priority | Detail |
|------|----------|--------|
| **AI-generated menu (~30 items)** | P2 | Today: template library gives ~30 items by type; “AI” path can use menu-first or same templates. Real AI menu generation (e.g. from URL/prompt) would be a separate feature. |
| **Manual “start from empty”** | P2 | User can add items via patch; no dedicated “Start with empty store” entry in Quick Start. Add only if product needs it. |
| **OCR from Quick Start** | P2 | `draft-store/generate` supports mode=ocr; Quick Start may map OCR to build_store and still run standard generateDraft. Confirm OCR path from UI if OCR is in scope. |
| **Docs and runbooks** | P2 | Keep `HOW_TO_RUN_PROOF_TEST.md`, `PHASE1_SHIP_CHECKLIST.md`, and this report up to date when changing spine or promo routes. |

### 3.3 Not required for “store creation and promotion path finished”

- Runway ML video integration (separate plan: `docs/RUNWAY_ML_VIDEO_INTEGRATION_PLAN.md`).
- Campaigns V2, new orchestrator flows, or other product features.

---

## 4. Solid execution plan to finish

### Phase A — Verification (no code change)

1. **Run headless proof**
   - Get auth token (login).
   - `POST /api/automation/store-from-input` with `{ businessName, businessType, location }`.
   - Expect 200, `storeId`, `storeUrl`, `slug`.
2. **Run Phase 1 manual checklist**
   - Follow “Manual verification script” in `docs/PHASE1_SHIP_CHECKLIST.md` (auth, auto images, manual image, promo, desserts, repair).
3. **Run full E2E path (store + promotion)**
   - Quick Create (form) → wait for draft → Edit 1–2 items → Save draft → Publish → open live store.
   - From Draft Review or live store: Create QR Promo → create promo → copy link → incognito `/p/:slug` → confirm landing.
   - From product: Smart Object Promo → wizard → Content Studio → Deploy → copy QR URL → incognito `/q/:publicCode` → confirm landing.
4. **Log results**
   - Note any step that fails (route, response, console/network). Fix in Phase B.

### Phase B — Fix any issues found in Phase A

1. **404 or wrong route**
   - Confirm dashboard routes for `/p/:promoId`, `/q/:publicCode`, `/dashboard/stores/:storeId/promotions` and that they call the correct API paths.
2. **Publish or draft not found**
   - Confirm `generationRunId` is sent and stored (orchestra task, draft input); confirm `findTargetDraft` and ownership in `publishDraftService.js`.
3. **Save draft then publish**
   - Confirm “Save draft” sends PATCH with full `preview` (items/categories); confirm publish reads from DB draft after PATCH (no stale data).
4. **Smart Object landing**
   - Confirm dashboard `/q/:publicCode` fetches `GET /api/smart-objects/:publicCode/landing` and renders store/product/promo; confirm `Content` and `activePromoId` are set correctly on deploy.

### Phase C — Declare “store creation and promotion path” done

1. **Checklist sign-off**
   - [ ] Headless proof passes.
   - [ ] Phase 1 manual verification passes.
   - [ ] Full E2E (Create → Edit → Save → Publish → Live store) passes.
   - [ ] Create QR Promo → landing at `/p/:slug` works.
   - [ ] Smart Object from item → Deploy → landing at `/q/:publicCode` works.
2. **Docs**
   - Add a short “Store creation and promotion path – done” note to this file (date, environment tested).
   - Optionally add a one-page runbook: “How to test store creation and promotion” (steps + curl/URLs).

### Phase D — Optional follow-ups (after path is done)

- Real AI menu generation (beyond template/menu-first).
- Explicit “Start from empty” in Quick Start.
- OCR flow from Quick Start (if in scope).
- Runway ML video integration per its own plan.

---

## 5. Summary table

| Goal | Status | Notes |
|------|--------|------|
| Store creation spine (start → draft → review → publish) | ✅ Done | Auto-run, PATCH draft, publish service, preview.items. |
| ~30 items per draft | ✅ Done | Template library + OCR cap + menu-first. |
| Auth after preview; persist draft | ✅ Done | RequireAuth, PATCH draft-store, ownership checks. |
| Editable items; publish uses saved draft | ✅ Done | ProductEditDrawer, Save draft → PATCH, publish from DB. |
| Create Promo from item → Content Studio | ✅ Done | ProductReviewCard, createPromoDraftFromItem. |
| Store Promo + QR + landing `/p/:slug` | ✅ Done | StorePromo, StorePromotionsPage, PromoScanRedeemLandingPage. |
| Smart Object + QR + landing `/q/:code` | ✅ Done | smartObjects routes, PromoDeployPage, landing API. |
| Headless proof | ✅ Done | POST /api/automation/store-from-input. |
| **Remaining** | **Verification** | Run Phase A–C; fix any bugs; sign off checklist. |

---

## 6. References

- `docs/PHASE_STORE_MENU_AUDIT_AND_PLAN.md` — Goals M1–M4, gaps at time of audit (most addressed).
- `docs/MINIMUM_FIX_SET_EXECUTION_PLAN.md` — Phases 0–5 (auto-run, headless, schema, business/create, docs).
- `docs/HOW_TO_RUN_PROOF_TEST.md` — store-from-input curl and prerequisites.
- `docs/PHASE1_SHIP_CHECKLIST.md` — Phase 1 manual verification and rollback list.
- `docs/PHASE1_PROMO_QR_DONE.md` — Store Promo + QR implementation summary.
- `docs/STEP1_REAL_AUTH_GATING.md` — Auth and draft ownership.

---

*Report generated for “store creation and promotion path” status. Complete Phase A–C to consider the path finished; then proceed to Runway or other work.*
