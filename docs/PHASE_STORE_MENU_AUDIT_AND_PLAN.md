# Phase: Store with Full Menu/Services — Audit, Gap Analysis & Plan

**Goal:** Create a store with full menu/services (~30 items) for any business type via 4 input options; auth only after preview; editable items; promo and Smart Object from Content Studio.

---

## 1) Current State Map

### Flow (text diagram)

```
[Build Store Start]
       │
       ├─ Quick Start (FeaturesPage) ─ form / voice / ocr / url / template
       │       │
       │       └─ quickStartCreateJob() → getOrCreateGuestSession() → POST /api/mi/orchestra/start
       │               │
       │               └─ Creates OrchestratorTask + DraftStore (status: generating)
       │               └─ POST /api/mi/orchestra/job/:jobId/run → generateDraft(draftId)
       │               └─ Navigate to /store/review?jobId=...&mode=draft&generationRunId=...
       │
       └─ Alternative: POST /api/draft-store/generate (mode: ai | ocr | template | personal)
               └─ createDraft() → generateDraft() inline → returns draftId, status
               (No orchestra; direct draft-store API; used by different entry points)
       │
[Preview]
       │
       └─ StoreReviewPage (jobId, generationRunId from URL)
               └─ useOrchestraJobUnified(jobId) + draft from GET /api/public/store/temp/draft?generationRunId=...
               └─ draftResolver: finds DraftStore by generationRunId → products = preview.items || preview.products
               └─ StoreDraftReview renders effectiveDraft (baseDraft + localStorage patch via applyStoreDraftPatch)
       │
[Products/Items]
       │
       └─ Stored: DraftStore.preview (JSON) — items array; no catalog.products in draftStoreService
       └─ Loaded: GET /api/public/store/:storeId/draft, GET /api/stores/:storeId/draft
       └─ Patch: LOCAL ONLY — useStoreDraftPatch(jobId) → localStorage key cardbey.storeDraftPatch:${jobId}
       └─ No PATCH /api/draft-store/:draftId or PATCH draft items on backend
       │
[Publish / Save]
       │
       └─ ensureAuth (gatekeeper) → publishStore({ storeId: effectiveStoreId, generationRunId })
       └─ POST /api/store/publish (requireAuth) — finds draft by committedStoreId === storeId + generationRunId
       └─ Uses preview.catalog.products (stores.js) — MISMATCH: draftStoreService writes preview.items
       └─ effectiveStoreId = dbStoreId || routeStoreId — for guest draft routeStoreId is "temp"; publish expects real storeId
       │
[Content Studio]
       │
       └─ Routes: /app/creative-shell (home), /app/creative-shell/edit/:instanceId, /app/creative-shell/promo
       └─ Create Promo: ProductReviewCard "Create Promo" → createPromoDraftAndNavigate / createPromoFromProduct
       └─ Smart Object: ProductReviewCard "Smart Object Promo" → SmartObjectPromoWizard → createSmartPromotionFromProduct → navigate to editor
       └─ Promo deploy: PromoDeployPage — createSmartObject, setSmartObjectActivePromo, QR download
       └─ Landing: /q/:publicCode (PrintBagLandingPage, MIObjectLandingPage)
```

### Bullet list: routes & components

**Build store start**
- `apps/dashboard/.../FeaturesPage.tsx` — Quick Start UI (form, voice, url, ocr, template)
- `apps/dashboard/.../lib/quickStart.ts` — quickStartCreateJob; guest session; orchestra/start; navigation to store/review
- `apps/core/.../routes/miRoutes.js` — POST /api/mi/orchestra/start, POST /api/mi/orchestra/job/:jobId/run
- `apps/core/.../routes/draftStore.js` — POST /api/draft-store/generate (ai/ocr/template/personal)

**Preview**
- `apps/dashboard/.../pages/store/StoreReviewPage.tsx` — Loads job + draft, passes to StoreDraftReview
- `apps/dashboard/.../features/storeDraft/StoreDraftReview.tsx` — Main review UI; effectiveDraft = base + patch
- `apps/core/.../routes/publicStoreRoutes.js` — GET /api/public/store/:storeId/draft (no auth)
- `apps/core/.../lib/draftResolver.js` — resolveDraftForStore; products from preview.items || preview.products

**Products/items**
- DraftStore.preview (JSON): draftStoreService writes storeName, storeType, categories, **items**, images, brandColors
- `apps/dashboard/.../features/storeDraft/storeDraftPatch.ts` — StoreDraftPatchV1 (products.upsert, categories)
- `apps/dashboard/.../features/storeDraft/useStoreDraftPatch.ts` — localStorage persistence; updateProduct, setProductCategory
- `apps/dashboard/.../features/storeDraft/review/ProductReviewCard.tsx` — Card with Create Promo / Smart Object Promo
- `apps/dashboard/.../features/storeDraft/review/ProductEditDrawer.tsx` — Edit product fields

**Content Studio & promo / Smart Object**
- `apps/dashboard/.../features/content-studio/pages/CreativeShell.tsx`, CreativeShellWithTools.tsx — Content Studio home
- `apps/dashboard/.../features/content-studio/pages/ContentStudioEditor.tsx` — Editor
- `apps/dashboard/.../features/content-studio/pages/PromoDeployPage.tsx` — Deploy promo; createSmartObject, setSmartObjectActivePromo, QR
- `apps/dashboard/.../features/storeDraft/review/SmartObjectPromoWizard.tsx` — Wizard: create promo → navigate to editor (SmartObject created at Deploy→Print)
- `apps/dashboard/.../lib/smartObjectPromo.ts` — createSmartObjectPromo (createSmartObject + setSmartObjectActivePromo)
- `apps/dashboard/.../api/smartObject.ts` — GET/POST /api/smart-objects, POST .../active-promo (core has no smart-objects routes — 404 unless elsewhere)
- `apps/dashboard/.../pages/PrintBagLandingPage.tsx`, MIObjectLandingPage.tsx — QR landing pages

---

## 2) Inventory Table

| Layer | Backend | Frontend | Data models |
|-------|---------|----------|-------------|
| **Store creation** | POST /api/mi/orchestra/start; POST /api/mi/orchestra/job/:jobId/run; POST /api/draft-store/generate | quickStart.ts, FeaturesPage, StoreReviewPage | OrchestratorTask, DraftStore |
| **Preview** | GET /api/public/store/:storeId/draft; GET /api/stores/:storeId/draft | StoreDraftReview, draftNormalize.ts, useOrchestraJobUnified | DraftStore.preview (JSON) |
| **Draft items** | No PATCH draft; commit/publish read preview | storeDraftPatch.ts, useStoreDraftPatch, ProductReviewCard, ProductEditDrawer, ReviewStep | StoreDraftPatchV1 (local); DraftStore.preview.items |
| **Publish** | POST /api/store/publish (requireAuth); POST /api/draft-store/:draftId/commit | publishStore(), ensureAuth, SoftAuthPrompt | Business, Product, DraftStore.status=committed |
| **Promo from item** | createPromoFromProduct (miPromo); createPromoDraftFromItem | ProductReviewCard, createPromoAndGoToStudio, Content Studio editor | PromoInstance / Content (dashboard state) |
| **Smart Object + QR** | /api/smart-objects (not in core — 404) | smartObject.ts, PromoDeployPage, createSmartObjectPromo, PrintBagLandingPage | (SmartObject model missing in core schema) |

**Models (core Prisma):** User, Business, Product, DraftStore, OrchestratorTask. No SmartObject, ShortLink, or PromoRule in schema (PromoRule exists but not used by this flow).

---

## 3) Gap Report (by goal)

### Goal 1 — Store with full menu (~30 items) for any business, 4 inputs (AI, OCR, Template, Manual)

| Area | Status | Detail |
|------|--------|--------|
| A. AI Generate | 🟡 Partially done | orchestra/start + generateDraft use businessProfileService + **mock** products by type (~4–8 items). No real AI menu generation; no website scrape. |
| B. OCR Upload | 🟡 Partially done | draftStore.js accepts mode=ocr + photo; draftStoreService performMenuOcr → lines → ~15 items. Not used from Quick Start (quickStart maps ocr→build_store_from_menu but job run only runs build_store generateDraft). |
| C. Template Library | 🟡 Partially done | quickStart has template mode; draft-store generate accepts templateId; generateDraft uses templateKey in profile only — **no template item library**; products still mock by type. |
| D. Manual | 🟡 Partially done | useStoreDraftPatch allows add/upsert products locally; no "start from empty + add items" entry; no backend persist of manual-only draft. |
| ~30 items | ❌ Not met | Mock lists are 4–8 items; OCR caps at ~15. No expansion to ~30. |

**Files:** draftStoreService.js (mock lists, OCR line parsing), quickStart.ts (goal map), miRoutes.js (run → generateDraft), draftStore.js (generate).

---

### Goal 2 — Auth only after preview; require login to publish/save/continue

| Area | Status | Detail |
|------|--------|--------|
| Anonymous preview | ✅ Done | GET /api/public/store/temp/draft no auth; StoreReviewPage loads draft by generationRunId. |
| Auth for publish | ✅ Done | ensureAuth / gatekeeper before publishStore; SoftAuthPrompt; POST /api/store/publish requireAuth. |
| Save/continue | 🟡 Gap | Patched draft lives in localStorage only. If user "saves" before publish, patch is not sent to backend; publish uses DB draft.preview (no patch merge). |

**Files:** publicStoreRoutes.js, StoreDraftReview.tsx (ensureAuth, setFinishSetupOpen), stores.js (requireAuth on /publish).

---

### Goal 3 — Menu/services editable (name, category, description, price, tags, image)

| Area | Status | Detail |
|------|--------|--------|
| UI edit | ✅ Done | ProductReviewCard, ProductEditDrawer, useStoreDraftPatch.updateProduct, setProductCategory; QuickActionsPanel. |
| Local patch | ✅ Done | storeDraftPatch.ts products.upsert; applyStoreDraftPatch in StoreDraftReview. |
| Backend persist | ❌ Missing | No PATCH /api/draft-store/:draftId or PATCH /api/stores/:id/draft to save preview/items. Patches lost on new device/incognito. |
| Publish uses patch | ❌ Missing | POST /api/store/publish reads preview.catalog.products; draftStoreService writes preview.**items** — publish creates 0 products from orchestra-generated draft. |

**Files:** useStoreDraftPatch.ts, storeDraftPatch.ts, ProductEditDrawer.tsx, ReviewStep.tsx; draftStore.js (no PATCH); stores.js (catalog.products vs items).

---

### Goal 4 — Any item → “Create Promo” in Content Studio

| Area | Status | Detail |
|------|--------|--------|
| UI | ✅ Done | ProductReviewCard "Create Promo"; StoreDraftReview createPromo flow; navigate to /app/creative-shell/edit/:id?intent=promotion. |
| Prefill from item | ✅ Done | createPromoDraftFromItem (product image, name); createPromoAndGoToStudio; createPromoFromProduct (api/miPromo). |
| Auth gating | ✅ Done | Pending promo stored in localStorage; LoginPage resumes after login. |

**Files:** ProductReviewCard.tsx, StoreDraftReview.tsx, createPromoDraftFromItem.ts, createPromoAndGoToStudio.ts, LoginPage.tsx.

---

### Goal 5 — Any item → Smart Object with dynamic QR + landing page

| Area | Status | Detail |
|------|--------|--------|
| UI | ✅ Done | ProductReviewCard "Smart Object Promo"; SmartObjectPromoWizard; PromoDeployPage (create SmartObject, bind promo, QR). |
| Create promo + open editor | ✅ Done | createSmartPromotionFromProduct → navigate to Content Studio. |
| SmartObject backend | ❌ Missing in core | Dashboard calls /api/smart-objects and /api/smart-objects/:id/active-promo; **no such routes in cardbey-core**. QR/landing work only if another service provides them. |
| Landing page | 🟡 Done in dashboard | PrintBagLandingPage, MIObjectLandingPage; route /q/:publicCode must be served by app that has SmartObject backend. |

**Files:** SmartObjectPromoWizard.tsx, smartObjectPromo.ts, api/smartObject.ts, PromoDeployPage.tsx; core: no smart-objects routes, no SmartObject in schema.

---

## 4) Proposed Milestones

### M1 — Full menu (~30 items) and 4 input modes (AI, OCR, Template, Manual)

**User outcome:** User can start from form, voice, URL, OCR, or template and get a draft with ~30 items; template picker shows business-type templates.

**Backend**
- **draftStoreService.js:** Expand mockProducts to ~30 items per type; add fallback “generic” list of 30. For OCR, keep or improve line parsing and cap at 30.
- **draftStoreService.js (AI):** If prompt/website provided, call existing or new AI menu generation (or stub returning 30 items) instead of mock only.
- **Template:** Add template library (e.g. JSON or DB table): templateId → list of category + item names; generateDraft(template) loads template items and merges with profile.
- **draftStore.js:** For mode=manual, createDraft with empty or seed preview; allow POST body to send initial items (optional).

**Frontend**
- **FeaturesPage / quickStart:** Ensure ocr and template modes pass through to orchestra/start or draft-store/generate with correct params (ocr image, templateId).
- **Template library UI:** Page or modal to pick business-type template (list from API or static list).

**Data**
- Optional: Template model or JSON file (id, name, businessType, categories[], items[]) — only if not static.

**Acceptance**
- [ ] Form + business type produces draft with ~30 items.
- [ ] OCR upload produces draft with parsed items (up to 30).
- [ ] Template selection produces draft with template items (~30).
- [ ] Manual mode allows starting with empty or few items and adding more in UI.

---

### M2 — Auth after preview; persist patched draft

**User outcome:** Preview remains anonymous; on “Save” or “Publish” user is prompted to log in; patched catalog is persisted so publish uses it.

**Backend**
- **PATCH /api/draft-store/:draftId** (or PATCH /api/stores/:storeId/draft with generationRunId): Accept body { preview?: { items?, categories?, ... } }. Update DraftStore.preview (merge or replace). Optional: requireAuth for PATCH or allow anonymous and key by draftId.
- **POST /api/store/publish:** When finding draft by generationRunId, also find DraftStore by input.generationRunId (not only committedStoreId === storeId). For “first publish” (user has no store), support create-store-from-draft: create Business + Products from draft, then return storeId (or document that user must use POST /api/draft-store/:draftId/commit first to create account+store).
- **draftStoreService commit:** Ensure commitDraft uses preview.items when creating Product records (already does). No change if only draft-store flow is used.

**Frontend**
- **StoreDraftReview:** On “Save draft” or before publish, call PATCH draft with effectiveDraft (base + patch). Merge effectiveDraft.catalog into payload (products, categories).
- **useStoreDraftPatch:** After successful PATCH, clear or keep localStorage; backend becomes source of truth for draft items.

**Acceptance**
- [ ] Anonymous user can view preview; “Publish” opens auth.
- [ ] After editing items, “Save” or “Publish” sends patched catalog to backend.
- [ ] After login/signup, publish creates store + products from patched draft.

---

### M3 — Editable items + backend PATCH + publish shape fix

**User outcome:** User can edit name, category, description, price, tags, image per item; changes persist; publish creates all products including edited ones.

**Backend**
- **stores.js publish:** Use `const products = preview?.catalog?.products ?? preview?.items ?? [];` so both draftStoreService (items) and normalized draft (catalog.products) work.
- **draftResolver / publicStoreRoutes:** Return products and categories in shape that dashboard already expects (products array); optional: ensure draft.preview has catalog.products when writing from draftStoreService for consistency.
- **PATCH draft (from M2):** Accept products array (or catalog.products); validate and write to DraftStore.preview.

**Frontend**
- **ProductEditDrawer / ReviewStep:** Already support name, category, description, price, tags, image; ensure they call useStoreDraftPatch.updateProduct and optional save() → PATCH.
- **applyStoreDraftPatch:** Ensure product id stability so backend can match items (e.g. keep client-generated ids in patch).

**Acceptance**
- [ ] Edit item → save → PATCH sent; reload draft shows edits.
- [ ] Publish creates Product rows for all items (including from preview.items).
- [ ] Price/tags/image round-trip correctly.

---

### M4 — Promo from item + Smart Object + QR + landing (backend)

**User outcome:** “Create Promo” and “Smart Object Promo” from an item open Content Studio with prefilled data; after deploy, QR and landing page work.

**Backend (core)**
- **SmartObject model (if not external):** Add to Prisma: id, publicCode, storeId, productId?, type, status, createdAt; optional activePromoId. ShortLink or similar if QR points to /q/:publicCode.
- **Routes:** POST /api/smart-objects (create), GET /api/smart-objects/:idOrPublicCode, POST /api/smart-objects/:id/active-promo. Implement create (generate publicCode), get, setActivePromo. QR URL = app base + /q/:publicCode.
- **Landing:** Ensure /q/:publicCode is served (dashboard or core) and resolves to PrintBagLandingPage or MIObjectLandingPage that loads promo by publicCode (via GET /api/smart-objects/:publicCode or equivalent).

**Frontend**
- **PromoDeployPage:** Already calls createSmartObject, setSmartObjectActivePromo; ensure error handling when backend is present.
- **PrintBagLandingPage / MIObjectLandingPage:** Fetch content by publicCode; show promo and CTA.

**Acceptance**
- [ ] Create Smart Object from item → promo created and editor opens.
- [ ] Deploy → SmartObject created; QR URL returned and downloadable.
- [ ] Visiting /q/:publicCode shows landing with promo/CTA.

---

## 5) Acceptance Checklist (phase-level)

- [ ] **Goal 1:** All 4 inputs (AI, OCR, Template, Manual) produce a store draft with ~30 items (or user-defined for manual).
- [ ] **Goal 2:** Preview is viewable without login; Publish/Save/Continue requires login; patched draft is persisted before or at publish.
- [ ] **Goal 3:** Each item is editable (name, category, description, price, tags, image); changes are saved to backend and used on publish.
- [ ] **Goal 4:** “Create Promo” from any item opens Content Studio with that item prefilled; promo can be designed and deployed.
- [ ] **Goal 5:** “Smart Object Promo” from any item creates promo and opens editor; after deploy, dynamic QR and landing page (/q/:code) work.
- [ ] **Robustness:** Flow works locally and in deployed environment (env for API base, auth, and QR base URL).

---

## 6) Key Risks & De-risking

| Risk | Mitigation |
|------|------------|
| Publish finds no draft (temp + generationRunId) | In publish, find DraftStore by input.generationRunId when storeId is user’s store; or create store from draft first via commit endpoint and pass new storeId. |
| preview.items vs catalog.products | One-line fix in stores.js publish: use preview.items when catalog.products missing. Optionally normalize draftStoreService to write catalog.products. |
| SmartObject in different service | If /api/smart-objects is external, document base URL and contract; dashboard already uses buildApiUrl. If in core, add model + routes in M4. |
| ~30 items from AI | Start with expanded mocks + template library; add real AI menu generation in a follow-up if needed. |

---

## 7) Implementation Notes (summary)

- **Minimal DB:** Prefer DraftStore.preview JSON for items; add SmartObject (and optional ShortLink) only if QR/landing live in core.
- **Draft vs Published:** DraftStore (draft/generating/ready) → publish → Business + Product (published). Keep existing DraftStore.commit and POST /api/store/publish; align publish with draft.preview shape.
- **Auth:** Keep preview public; require auth for PATCH draft (or for commit/publish only) and for POST /api/store/publish.
- **Item edit:** Keep existing UI; add PATCH draft endpoint and call it on save; publish reads from DB draft (with patch applied server-side or via PATCH).
- **Promo:** Keep current flow (createPromoDraftFromItem → editor); ensure backend createPromoFromProduct exists and returns instanceId.
- **Smart Object:** Implement SmartObject + routes in core (M4) or confirm external API and base URL; landing page must resolve /q/:publicCode to active promo.

---

*Document generated from codebase audit. File: `docs/PHASE_STORE_MENU_AUDIT_AND_PLAN.md`.*
