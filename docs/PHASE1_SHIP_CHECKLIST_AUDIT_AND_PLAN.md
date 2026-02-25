# Phase 1 “Ship Checklist” Audit + Plan
## Store Creation + Real Auth + 1 Promo + Dynamic QR

**Locked rule:** No code changes in this doc. Before any change, assess risk to **Quick Create → Draft Review → Publish → Live store**. Do not change automation spine endpoints/contracts unless explicitly required. Do not add new polling loops.

---

## 1) Phase 1 Status Summary (A/B/C/D)

### A) Store creation workflow (one path)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| 1) User can create a store via Quick Create (text input) | ✅ | CreatePage.tsx, FeaturesPage.tsx use `quickStartCreateJob`; payload has businessName, businessType, sourceType; POST `/api/mi/orchestra/start` with goal `build_store` (quickStart.ts ~394–943, orchestraPayload). |
| 2) Draft Review loads reliably (no crashes, missing context, disabled core actions) | ⚠️ | Route `/app/store/:storeId/review` wrapped in RequireAuth (App.jsx 374–382). StoreReviewPage → StoreDraftReview. Draft from GET `/api/stores/temp/draft?generationRunId=` (requireAuth). Job from GET `/api/mi/orchestra/job/:jobId`. **Verify:** Guest flow uses temp + generationRunId; 401 on draft fetch could show blank or redirect. |
| 3) Publish produces a live store URL that works | ✅ | POST `/api/store/publish` (stores.js 1231); returns `publishedStoreId`, `storefrontUrl`. publishStore() in storeDraft.ts sends storeId + generationRunId; 401 → needsLogin. |
| 4) Images not nonsense OR “Repair images” works and UI doesn’t lie | ⚠️ | draftGuards (isBlockedCandidateForFood) block some food items; finalizeDraft uses generateImageUrlForDraftItem (Pexels → DALL·E). Repair/autofill: fix_catalog entryPoint exists (MI audit); StoreDraftReview has repair/regenerate paths. **Verify:** Wrong-vertical images still possible if guards miss; repair UI visible and not gated by setup modal. |

### B) Real signup/signin + Auth requests

| Requirement | Status | Evidence |
|-------------|--------|----------|
| 1) Logged-out user hitting Draft Review or Promotions → redirect to login, return to same URL with params preserved | ✅ | RequireAuth.tsx: `!isAuthenticated` → `<Navigate to={\`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}\`} replace />`. LoginPage.tsx: after login, `if (returnTo) navigate(decodeURIComponent(returnTo), { replace: true })`. |
| 2) Logged-in: homepage header shows account icon (not login/signup) | ✅ | PublicHeader.tsx: `useCurrentUser()`; when `user` → account dropdown (User icon, Dashboard, Account, Credits, Sign out); when `!user` → Login/Sign up links. Sign-out clears tokens and `queryClient.removeQueries({ queryKey: ['currentUser'] })`. |
| 3) Dashboard requests send valid auth (cookie or bearer) and succeed | ✅ | api.ts: buildAuthHeader() from getTokens() (bearer/storeToken/agentToken); fetch uses credentials: 'include', mergedHeaders include Authorization. storeDraft.ts publishStore sends Bearer from getTokens(). |
| 4) Publish requires auth and works consistently | ✅ | POST `/api/store/publish` uses requireAuth (stores.js); 401 → frontend returns needsLogin; handlePublish uses runWithAuth / runWithOwnershipGate; AuthRequiredModal opens on 401, retry after login. |

### C) One promo function with dynamic QR code (packaging-ready)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| 1) User can create a promo for a store (optionally product) | ✅ | POST `/api/promos` (promosAuth.js): storeId, title, subtitle, heroImageUrl, ctaLabel, targetUrl, couponCode. createPromo() in storePromos.ts. StorePromotionsPage.tsx create form; CreateQRPromoModal. **Note:** StorePromo model used by prisma in routes; not listed in schema.prisma model list — may be from migration. Verify: `npx prisma generate` / migrate status. |
| 2) Stable public promo URL + QR code (PNG + SVG) | ✅ | Public URL: GET `/api/public/promos/:slug` (promosPublic.js). Short slug: generateUniqueShortSlug (shortSlug.js). QR: PackagingQRModal uses qrcode.react (QRCodeSVG); getPromoLandingUrl(), downloadPromoQRAsSVG(); StorePromotionsPage has Download SVG + PNG (downloadPromoQR, downloadPromoQRAsSVG). |
| 3) Scanning QR shows promo landing and CTA → store/product | ✅ | PromoScanRedeemLandingPage: route `/p/:slug` (param promoId); getPublicPromoBySlug(slug); then navigate to `/preview/store/${storeId}?promo=&coupon=`. CTA targetUrl from API (e.g. `/feed/${slug}` or product). |
| 4) Scan tracking increments (minimal OK) | ✅ | POST `/api/public/promos/:slug/scan` (promosPublic.js): prisma.storePromo.update({ scanCount: { increment: 1 } }). trackPromoScan() in storePromos.ts; PromoScanRedeemLandingPage calls it with throttle (once per slug per day in localStorage). |
| 5) Fully usable for packaging: exportable QR file + short link | ✅ | PackagingQRModal: SVG download via getSvgStringFromRef + downloadPromoQRAsSVG; PNG via canvas. StorePromotionsPage: Copy Link, QR preview, Download SVG/PNG. Link from Draft Review: StoreReviewHero onNavigateToPromotions / onOpenCreateQRPromo → promotions page or Create QR Promo modal. |

### D) Image sanity

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Wrong-vertical images still possible? | ⚠️ | draftGuards (draftGuards.js) block *names* for food (isBlockedCandidateForFood); image generation (menuVisualAgent) is by item name/description. Possible mismatch if name is safe but description or style yields wrong image. **Verify:** Manual test café store with “Croissant” vs “Shoes”. |
| Autofill/repair available and correctly enabled? | ✅ | fix_catalog / repair paths exist (orchestra/start with entryPoint fix_catalog; StoreDraftReview repair flows). applyItemGuards in finalizeDraft. **Verify:** No setup modal or gate that hides “Repair images” for quick-create users. |
| Any gating wrongly blocks autofill? | ⚠️ | **Verify:** Ensure repair/autofill is not behind “complete onboarding” or “premium” when user is on draft review from Quick Create. |

---

## 2) Repo-wide inventory (entrypoints)

### Store creation path
- **Quick Create UI:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/CreatePage.tsx`, `FeaturesPage.tsx` (#create section); `quickStartCreateJob()` from `src/lib/quickStart.ts`.
- **Orchestra start:** POST `/api/mi/orchestra/start` — `apps/core/cardbey-core/src/routes/miRoutes.js` (handleOrchestraStart); creates OrchestratorTask, ensures draft, calls `runBuildStoreJob` (auto-run, no /run from UI).
- **Draft fetch:** GET `/api/stores/:storeId/draft?generationRunId=` — `stores.js` (storeId `temp` + generationRunId required); requireAuth; uses getDraftByGenerationRunId.
- **Draft PATCH:** PATCH `/api/draft-store/:draftId` — `draftStore.js` (requireAuth); `patchDraftPreview(draftId, preview)`; merge logic preserves hero/avatar and supports partial item updates by id.
- **Publish:** POST `/api/store/publish` — `stores.js` (requireAuth); body storeId, generationRunId; returns ok, publishedStoreId, publishedAt, storefrontUrl.
- **Public store preview:** GET `/api/store/:id/preview` — `stores.js`; no auth; 404 if not found or !isActive.

### Auth
- **Login/signup:** POST `/api/auth/login`, POST `/api/auth/register` — `auth.js`; login returns { ok, token, accessToken, user }.
- **“Am I logged in”:** GET `/api/auth/me` — `auth.js` (requireAuth); used by useCurrentUser (dashboard services/user.ts) with queryKey `['currentUser']`.
- **Token storage/send:** Storage: `getTokens()` / `clearTokens()` from `storage` (api.ts re-exports); Bearer in buildAuthHeader(); fetch uses credentials: 'include' and mergedHeaders.Authorization.
- **Header login vs account:** PublicHeader: `useCurrentUser()`; if `user` → account icon + dropdown; else Login/Sign up links.

### Promo
- **DB:** StorePromo used in promosAuth, promosPublic, shortSlug (slug, scanCount, heroImageUrl, ctaLabel, targetUrl, etc.). Not in current schema.prisma model list — confirm with `prisma migrate status` / generate.
- **Auth promo routes:** POST `/api/promos`, GET `/api/promos?storeId=`, PATCH `/api/promos/:id` — `promosAuth.js`; mounted at `/api/promos`.
- **Public promo:** GET `/api/public/promos/:slug`, POST `/api/public/promos/:slug/scan` — `promosPublic.js`; mounted at `/api/public/promos`.
- **QR:** Dashboard: `PackagingQRModal.tsx` (QRCodeSVG, SVG/PNG export); `getPromoLandingUrl`, `downloadPromoQRAsSVG` in storePromos.ts. Promo landing route: `/p/:slug` → PromoScanRedeemLandingPage.
- **Promotions UI from Draft Review:** StoreReviewHero: onNavigateToPromotions, onOpenCreateQRPromo; StorePromotionsPage at `/dashboard/stores/:storeId/promotions`; link from review overflow “Generate Promotions” / “Promotions”.

---

## 3) What’s left (P0 / P1 / P2)

| Priority | Item | Status | Owner files | Smallest fix | Test/verify |
|----------|------|--------|-------------|--------------|-------------|
| P0 | StorePromo model missing from schema.prisma | Unknown | prisma/schema.prisma | Add StorePromo model if migration added it but schema was not committed, or confirm model name (e.g. alias). Run prisma generate and promos.routes.test.js. | `cd apps/core/cardbey-core && npx prisma generate && npm run test -- promos.routes` |
| P0 | Draft Review for guest: 401 on GET draft → redirect then return to review with params | Verify | StoreDraftReview, RequireAuth, quickStart (navigation with generationRunId) | Ensure after login, returnTo includes query (e.g. storeId=temp&generationRunId=); or that review page reads generationRunId from localStorage and refetches. | Manual: logout → Quick Create → when redirected to login, sign in → confirm back on review with same draft. |
| P1 | Wrong-vertical images (e.g. shoes for sweets) | Possible | draftGuards.js, menuVisualAgent, finalizeDraft | Tighten guards or add “style” lock to vertical; or document as known limitation + “Repair images” as mitigation. | Manual: create café store, check product images. |
| P1 | Repair/autofill gated by setup or premium | Verify | StoreDraftReview, any useGatekeeper / modal that hides repair | If gate exists, add exception for quick-create path or document. | Manual: from Quick Create draft review, confirm “Repair images” / fix_catalog is available. |
| P2 | Public promo landing route consistency | Verify | App.jsx routes for /p/:slug | Confirm route is `/p/:promoId` and PromoScanRedeemLandingPage param matches (promoId used as slug). | Open /p/{slug} in incognito, confirm landing and redirect. |
| P2 | 401/403 loops (e.g. repeated redirects) | Verify | RequireAuth, auth middleware, handlePublish | None found in code; ensure no double redirect (e.g. login → review → 401 → login). | Manual: edge cases (expired token, multi-tab). |

---

## 4) Execution plan (ordered steps, no implementation)

1. **Auth consistency (login, header, credentials)**  
   - **Files:** PublicHeader, api.ts (buildAuthHeader, fetch credentials), LoginPage (returnTo), RequireAuth.  
   - **Actions:** Confirm GET /api/auth/me used on app load; confirm all API calls use same buildAuthHeader + credentials: 'include'; confirm returnTo is pathname+search and login redirects back.  
   - **Verification:** Logged-out → open /app/store/temp/review?generationRunId=xxx → redirect to login with returnTo → login → back on review; header shows account icon when logged in.

2. **Draft Review stability (no crashes, no mis-gates)**  
   - **Files:** StoreDraftReview, StoreReviewPage, useOrchestraJobUnified, draft fetch (GET /api/stores/temp/draft).  
   - **Actions:** Ensure jobId and generationRunId are in sync (localStorage/sessionStorage or URL); ensure 401 on draft fetch opens auth modal and retry after login (no blank crash); ensure PATCH is only with owned draft (already enforced by backend).  
   - **Verification:** Full flow Quick Create (text) → review loads → edit name → PATCH → no console errors; guest → auth modal on Publish → login → claim + resume.

3. **Publish verification + link flow**  
   - **Files:** stores.js (POST /api/store/publish), storeDraft.ts publishStore(), StoreDraftReview handlePublish, runWithAuth/runWithOwnershipGate.  
   - **Actions:** Confirm publish returns storefrontUrl; frontend redirects to public store or “View storefront” with returnTo; confirm 401 → auth modal and retry.  
   - **Verification:** Publish → get storefrontUrl → open in new tab → store loads (GET /api/store/:id/preview).

4. **Promo + QR UI entry + public landing + QR export**  
   - **Files:** StoreReviewHero (onNavigateToPromotions, onOpenCreateQRPromo), StorePromotionsPage, PackagingQRModal, storePromos.ts, PromoScanRedeemLandingPage, promosPublic.js.  
   - **Actions:** Confirm “Promotions” / “Create QR Promo” from Draft Review or post-publish leads to create/list promo; create promo → get slug → open /p/:slug in incognito → landing loads, scan increments, redirect to store; QR download SVG/PNG works.  
   - **Verification:** Create promo from dashboard → copy link → incognito /p/:slug → scan → redirect; download QR SVG and PNG.

5. **Smoke test script (manual)**  
   - Steps: (1) Logout, go to Create, submit Quick Create text → redirect to login or review. (2) Login → confirm on review with draft. (3) Edit store name, save (PATCH). (4) Publish → get storefrontUrl, open → store preview works. (5) Go to Promotions for that store, create promo, open /p/:slug in incognito, scan, download QR. (6) Sign out → header shows Login/Sign up; login again → header shows account.

---

## 5) Risks & rollback (per step)

| Step | Risk | Mitigation / rollback |
|------|------|------------------------|
| Auth consistency | Changing header or api.ts could break token send or CORS | No code change in plan; verification only. If fixes needed, do minimal: e.g. only ensure returnTo includes query params. |
| Draft Review stability | New guards or redirect logic could block valid users | Add guards behind feature flag; rollback by reverting guard or flag. |
| Publish verification | Changing publish response or frontend redirect could break post-publish flow | No contract change; only verify. If adding readiness blocks (from MI plan), keep 200 shape unchanged when ready. |
| Promo + QR | StorePromo schema drift could break create/list/scan | Confirm schema and migrations; if model missing, add migration only; run existing promos.routes.test.js. |
| Smoke test | N/A | Manual only. |

---

## 6) Tests to lock Phase 1 (plan only)

- **e2e-lite manual checklist:** One-pager (doc) with: Quick Create → Review → Publish → Open store; Logout → Login → returnTo; Create promo → /p/:slug → scan → QR download.  
- **Vitest (or existing test runner):**  
  - Auth: ensure buildAuthHeader returns Bearer when token present; optional: mock GET /api/auth/me and assert header shows account vs login.  
  - Promo: public landing GET /api/public/promos/:slug returns 200 and safe fields when promo exists; POST scan increments scanCount (promos.routes.test.js already covers this).  
  - Publish: POST /api/store/publish with valid auth and draft returns 200 and storefrontUrl (store-publish.test.js exists).  
- **Optional Playwright:** One smoke test: navigate to Create → submit → wait for review or login → after login, review loads; publish → follow storefrontUrl.

---

## 7) Command list (tests + manual checklist)

```bash
# Core tests
cd apps/core/cardbey-core
npx prisma generate
npm run test -- store-publish.test.js
npm run test -- promos.routes.test.js
npm run test -- draft-store-by-store.test.js
npm run test -- orchestra-job-auto-run.test.js

# Dashboard tests (if Vitest)
cd apps/dashboard/cardbey-marketing-dashboard
pnpm test -- --run

# Manual checklist
# 1. Quick Create (text) → Draft Review → Publish → open storefrontUrl
# 2. Logout → hit /app/store/temp/review?generationRunId=... → login → confirm return
# 3. Create promo → /p/:slug incognito → scan → download QR (SVG + PNG)
# 4. Header: logged out = Login/Sign up; logged in = Account icon + Sign out
```

---

## 8) Summary

- **A) Store creation:** Implemented; verify Draft Review for guest (returnTo + generationRunId) and image repair not wrongly gated.  
- **B) Auth:** Implemented: RequireAuth + returnTo, header account vs login, Bearer + credentials.  
- **C) Promo + QR:** Implemented: create/list/update, public landing, scan increment, QR SVG/PNG export; verify StorePromo in schema.  
- **D) Image sanity:** Partially verified; confirm repair available and no wrong-vertical in key verticals.

**P0:** Confirm StorePromo model and guest draft-review returnTo (with generationRunId). **P1:** Image vertical consistency and repair gating. **P2:** Promo route param name and 401/403 loops. Execution plan is verification-first with minimal code change; risks and rollback are per step.
