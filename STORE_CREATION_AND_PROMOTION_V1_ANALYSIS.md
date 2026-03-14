# Store Creation & Promotion v1 - Comprehensive Status Report

**Date:** 2026-01-01  
**Sprint Goal:** A store can be created → published → run one promotion → produce real business outcome  
**Status:** ⚠️ **FRAGILE** - Core flows exist but need stabilization and completion

---

## Executive Summary

### Store Creation: 🟡 **FRAGILE** (70% Complete)
- ✅ Core creation flows implemented
- ✅ Publish endpoint functional
- ⚠️ Multiple entry points causing confusion
- ⚠️ Draft vs published state management issues
- ❌ Lifecycle stage transitions incomplete

### Promotion v1: 🔴 **MISSING** (40% Complete)
- ✅ Database models exist (PromoRule, PromoRedemption, PromoDeployment)
- ✅ Backend engine exists (configure, redeem)
- ✅ MI promo creation endpoint exists
- ❌ **Missing:** End-to-end flow from creation to redemption
- ❌ **Missing:** Public landing page
- ❌ **Missing:** QR code generation
- ❌ **Missing:** Complete tracking/analytics
- ❌ **Missing:** Integration with store publish flow

---

## 1. STORE CREATION - Detailed Analysis

### ✅ What's Already Done

#### 1.1 Multiple Creation Entry Points (Implemented)
**Status:** ✅ Working but fragmented

**Entry Points:**
1. **`POST /api/business/create`** - Quick Start (Form/URL/OCR/Voice)
   - Location: `apps/core/cardbey-core/src/routes/business.js:91`
   - Creates MI generation job
   - Supports: form, url, ocr, voice source types
   - Creates Business record with default visuals
   - ✅ **Status:** Working

2. **`POST /api/stores`** - Manual Dashboard Creation
   - Location: `apps/core/cardbey-core/src/routes/stores.js:38`
   - Creates store directly
   - Validates user doesn't already have store
   - ✅ **Status:** Working

3. **`POST /api/store-draft/create`** - Draft Store Creation
   - Location: `apps/core/cardbey-core/src/routes/storeDraftRoutes.js:58`
   - Creates store + products in one call
   - Supports optional auth (draft mode)
   - ✅ **Status:** Working

#### 1.2 Publish Flow (Implemented)
**Status:** ✅ Functional but needs validation improvements

**Endpoint:** `POST /api/store/publish`
- Location: `apps/core/cardbey-core/src/routes/stores.js:1038`
- **Validations:**
  - ✅ Store name required
  - ✅ At least one product with name + price
  - ✅ Profile visuals complete (avatar + background)
- **Actions:**
  - ✅ Sets `isActive = true`
  - ✅ Updates `lifecycleStage: 'live'` in stylePreferences
  - ✅ Emits SSE event `store.published`
  - ✅ Returns `publishedStoreId` and `storefrontUrl`
- **Idempotency:** ✅ Returns existing if already published

#### 1.3 Profile Visuals Gate (Implemented)
**Status:** ✅ Complete

- ✅ Frontend component: `ProfileVisualsGate.tsx`
- ✅ Backend validation: `isProfileVisualsComplete()`
- ✅ Upload + crop functionality
- ✅ Smart placeholders
- ✅ Publish blocking when incomplete

#### 1.4 MI Generation Pipeline (Implemented)
**Status:** ✅ Working but fragile

- ✅ Job creation: `createMiGenerationJob()`
- ✅ Job processing: `processFormJob()`, `processUrlJob()`, `processOcrJob()`
- ✅ Stale job detection (30s threshold)
- ✅ Progress tracking via SSE
- ✅ Store creation with default visuals
- ⚠️ **Fragility:** Job can get stuck in "queued" state

### ⚠️ What's Fragile / Needs Stabilization

#### 1.1 Multiple Creation Paths (Fragile)
**Issue:** Three different endpoints create stores differently

**Problems:**
- `/api/business/create` → Creates MI job → Async store creation
- `/api/stores` → Direct store creation (synchronous)
- `/api/store-draft/create` → Creates store + products together

**Impact:**
- Frontend must know which endpoint to use
- Different response formats
- Inconsistent lifecycle stage handling

**Recommendation:**
- **Unify to single endpoint:** `/api/business/create` for all Quick Start flows
- **Standardize response:** Always return `{ ok: true, storeId, jobId? }`
- **Consistent lifecycle:** All paths set `lifecycleStage: 'generating'` → `'configuring'` → `'live'`

#### 1.2 Draft vs Published State (Fragile)
**Issue:** Store can exist in multiple states without clear transitions

**Problems:**
- `isActive: false` = draft, but `lifecycleStage` stored in JSON
- No clear state machine
- Frontend must check both `isActive` and `stylePreferences.lifecycleStage`

**Current State:**
```javascript
// Draft
isActive: false
stylePreferences: { lifecycleStage: 'configuring' }

// Published
isActive: true
stylePreferences: { lifecycleStage: 'live' }
```

**Recommendation:**
- **Add explicit state field:** `status: 'draft' | 'published' | 'archived'`
- **Or:** Use `isActive` as single source of truth, remove lifecycleStage from JSON
- **Add state transition validation:** Prevent invalid transitions

#### 1.3 Store Context Handling (Fragile)
**Issue:** `tenantId`/`storeId` context can be lost or mismatched

**Problems:**
- Frontend sometimes loses context after navigation
- Backend sometimes doesn't validate tenant/store ownership
- Draft mode allows creation without auth, but publish requires context

**Known Issues:**
- `StoreDraftReview.tsx` had 403 errors when fetching store data
- Fixed by using `baseDraft.meta` instead of separate API call
- But pattern is inconsistent across codebase

**Recommendation:**
- **Single source of truth:** Route param `storeId` is always authoritative
- **Validate ownership:** All store operations check `userId === store.userId`
- **Context helpers:** Create `useStoreContext()` hook that always returns valid context

#### 1.4 MI Job Stalling (Fragile)
**Issue:** Jobs can get stuck in "queued" state

**Current Safeguards:**
- ✅ Stale job detection (30s threshold)
- ✅ Automatic failure marking

**Remaining Issues:**
- Jobs may not start processing immediately
- No retry mechanism for failed jobs
- No manual "retry" UI

**Recommendation:**
- **Add job processor heartbeat:** Ensure jobs are picked up within 5s
- **Add retry button:** Allow user to retry failed jobs
- **Add job status page:** Show all jobs with status, allow retry

#### 1.5 Empty Store Prevention (Partially Fixed)
**Issue:** Form/URL sources can create empty stores

**Current Fixes:**
- ✅ Catalog synthesis for form jobs
- ✅ Fallback to catalog synthesis if URL parsing fails

**Remaining Issues:**
- Synthesis may not always generate products
- No validation that store has products before publish (wait, this IS validated)

**Status:** ✅ **FIXED** - Publish endpoint validates products exist

### ❌ What's Missing / Needs Implementation

#### 1.1 Store Preview Endpoint
**Issue:** Frontend calls `/api/store/:id/preview` but endpoint may not exist

**Current Workaround:**
- Falls back to `/api/store/:id/context`

**Recommendation:**
- **Add endpoint:** `GET /api/stores/:id/preview`
- **Returns:** Store name, description, slug, products, theme, preview image
- **Purpose:** Public preview before publish

#### 1.2 Storefront URL Generation
**Issue:** Storefront URL format inconsistent

**Current:**
- Returns `/s/{slug}` but may not be correct
- No validation that slug is valid

**Recommendation:**
- **Standardize:** Always return absolute URL: `https://{domain}/s/{slug}`
- **Validate slug:** Ensure slug is URL-safe and unique

#### 1.3 Store Analytics/Stats
**Issue:** No way to track store performance

**Missing:**
- View counts
- Product views
- Promotion clicks
- Customer registrations

**Recommendation:**
- **Add stats endpoint:** `GET /api/stores/:id/stats`
- **Track events:** Store view, product view, promo click
- **Store in:** New `StoreAnalytics` table or existing tracking

---

## 2. PROMOTION v1 - Detailed Analysis

### ✅ What's Already Done

#### 2.1 Database Models (Complete)
**Status:** ✅ All models exist in Prisma schema

**Models:**
1. **`PromoRule`** - Promotion rules/configuration
   - Fields: type, targetType, value, startAt, endAt, usageLimit, usageCount
   - ✅ **Status:** Complete

2. **`PromoRedemption`** - Redemption records
   - Fields: promoId, customerId, deviceId, orderId, redeemedAt
   - ✅ **Status:** Complete

3. **`PromoDeployment`** - Public promo mapping
   - Fields: publicId, instanceId, tenantId, storeId, tracking stats
   - ✅ **Status:** Complete

4. **`PromoInstance`** - Links promo drafts to store
   - Fields: draftId, status, targetType, targetId, config
   - ✅ **Status:** Complete

5. **`PromoTracking`** - Event tracking
   - Fields: instanceId, event, timestamp, meta
   - ✅ **Status:** Complete

#### 2.2 Backend Engine (Partially Complete)
**Status:** ✅ Core functions exist

**Functions:**
1. **`configurePromo()`** - Create/update promo rule
   - Location: `apps/core/cardbey-core/src/engines/promo/configurePromo.ts`
   - ✅ **Status:** Working

2. **`redeemPromo()`** - Validate and record redemption
   - Location: `apps/core/cardbey-core/src/engines/promo/redeemPromo.ts`
   - ✅ **Status:** Working
   - Validates: active, date range, usage limit
   - Creates redemption record
   - Increments usage count
   - Emits events

3. **`queryActivePromos()`** - Query active promos
   - ✅ **Status:** Working

4. **`generatePromoAssets()`** - Generate QR + banner
   - ⚠️ **Status:** May be incomplete

#### 2.3 API Endpoints (Partially Complete)
**Status:** ✅ Routes exist but may be incomplete

**Endpoints:**
1. **`POST /api/mi/promo/from-product`** - Create promo from product
   - Location: `apps/core/cardbey-core/src/routes/miRoutes.js:367`
   - ✅ **Status:** Working
   - Creates Content record with `mode: 'promo'`
   - Returns `instanceId`

2. **`POST /api/promo/configure`** - Configure promo deployment
   - Location: `apps/core/cardbey-core/src/routes/promoRoutes.js:129`
   - ✅ **Status:** Working
   - Creates/updates PromoDeployment
   - Returns `publicId`, `landingUrlPath`, `registrationUrlPath`

3. **`POST /api/promo/engine/apply`** - Apply promo rule
   - Location: `apps/core/cardbey-core/src/routes/promoEngine.js:90`
   - ✅ **Status:** Working

4. **`POST /api/promo/engine/redeem`** - Redeem promo
   - Location: `apps/core/cardbey-core/src/routes/promoEngine.js:158`
   - ✅ **Status:** Working

#### 2.4 Frontend Integration (Partially Complete)
**Status:** ⚠️ UI exists but flow incomplete

**Components:**
1. **`PromoDeployPage.tsx`** - Promo deployment UI
   - ✅ **Status:** Exists

2. **`PromoLandingPage.tsx`** - Public landing page
   - ⚠️ **Status:** May be incomplete

3. **`createSmartPromotionFromProduct()`** - Frontend service
   - Location: `apps/dashboard/cardbey-marketing-dashboard/src/services/createSmartPromotion.ts`
   - ✅ **Status:** Working

### ❌ What's Missing / Needs Implementation

#### 2.1 End-to-End Flow (CRITICAL - Missing)
**Issue:** No complete flow from store publish → promo creation → redemption

**Current State:**
1. ✅ Store can be published
2. ✅ Promo can be created from product
3. ❌ **Missing:** Promo creation UI after publish
4. ❌ **Missing:** Promo deployment flow
5. ❌ **Missing:** Public landing page
6. ❌ **Missing:** QR code generation
7. ❌ **Missing:** Redemption flow

**Required Flow:**
```
Store Published
  ↓
"Create Promo" button appears
  ↓
User clicks → Promo creation modal
  ↓
Select product → Configure promo (discount, duration)
  ↓
Generate promo assets (QR + banner)
  ↓
Deploy promo → Get public URL
  ↓
User shares promo (QR code or link)
  ↓
Customer scans/clicks → Lands on public page
  ↓
Customer registers → Redemption recorded
  ↓
Store sees redemption in analytics
```

**Missing Pieces:**
1. **Promo creation UI after publish**
   - Location: `StoreDraftReview.tsx` shows "Create Promo" button
   - But flow may be incomplete

2. **Promo configuration modal**
   - Need: Discount type, value, duration, target product
   - Current: May redirect to Content Studio instead

3. **QR code generation**
   - Need: Generate QR code with public URL
   - Current: `generatePromoAssets()` may not be fully implemented

4. **Public landing page**
   - Need: `/p/promo/:publicId` route
   - Current: `PromoLandingPage.tsx` exists but may not be wired

5. **Registration flow**
   - Need: `/r/:publicId` route for registration
   - Current: May not be implemented

6. **Redemption tracking**
   - Need: Track scans, views, clicks, registrations
   - Current: `PromoTracking` model exists but may not be used

#### 2.2 QR Code Generation (Missing)
**Issue:** No QR code generation for promos

**Required:**
- Generate QR code image
- Embed in promo banner
- Link to public landing page

**Recommendation:**
- **Use library:** `qrcode` npm package
- **Generate on:** Promo deployment
- **Store:** QR code image URL in PromoDeployment
- **Return:** QR code image URL in `/api/promo/configure` response

#### 2.3 Public Landing Page (Missing/Incomplete)
**Issue:** Public promo landing page may not be fully functional

**Required:**
- Route: `/p/promo/:publicId`
- Display: Promo details, product info, CTA button
- Track: Landing page views
- Redirect: To registration or store

**Current:**
- `PromoLandingPage.tsx` exists
- But route may not be registered
- Tracking may not be implemented

**Recommendation:**
- **Add route:** Register `/p/promo/:publicId` in router
- **Load promo:** Fetch PromoDeployment by publicId
- **Track view:** Increment `landingViews` in PromoDeployment
- **Display:** Promo details from Content instance

#### 2.4 Registration Flow (Missing/Incomplete)
**Issue:** Customer registration flow may not be complete

**Required:**
- Route: `/r/:publicId`
- Form: Customer name, email, phone (optional)
- Submit: Create customer record, link to promo
- Track: Registration clicks and submissions

**Current:**
- `PromoDeployment` has `registrations` counter
- But registration endpoint may not exist

**Recommendation:**
- **Add route:** `POST /api/promo/register/:publicId`
- **Create customer:** Store in Customer table (if exists) or PromoRegistration table
- **Link to promo:** Associate customer with promo
- **Track:** Increment `registrations` in PromoDeployment
- **Redirect:** To store or confirmation page

#### 2.5 Promo Analytics Dashboard (Missing)
**Issue:** No way to view promo performance

**Required:**
- View: QR scans, landing views, registration clicks, registrations
- Filter: By promo, date range
- Export: CSV of redemptions

**Current:**
- `PromoDeployment` has counters
- But no UI to view them

**Recommendation:**
- **Add endpoint:** `GET /api/promo/stats/:instanceId`
- **Add UI:** Promo analytics page in dashboard
- **Show:** Real-time stats, redemption list
- **Export:** CSV download

#### 2.6 Integration with Store Publish (Missing)
**Issue:** "Create Promo" button after publish may not work

**Current:**
- `StoreDraftReview.tsx` shows button after publish
- But flow may redirect to Content Studio instead of promo creation

**Required:**
- After publish, show "Create Promo" button
- Click → Open promo creation modal
- Select product → Configure → Deploy
- Return to store with promo link

**Recommendation:**
- **Fix flow:** Ensure "Create Promo" opens promo modal, not Content Studio
- **Add modal:** `PromoCreationModal.tsx` component
- **Integrate:** Call `/api/mi/promo/from-product` then `/api/promo/configure`

---

## 3. CRITICAL PATH TO SPRINT GOAL

### Required Flow (Step-by-Step)

#### Step 1: Store Creation ✅ (70% Complete)
**Current:** ✅ Working
**Needs:**
- [ ] Stabilize multiple creation paths
- [ ] Fix draft vs published state management
- [ ] Add store preview endpoint

#### Step 2: Store Publish ✅ (80% Complete)
**Current:** ✅ Working
**Needs:**
- [ ] Ensure "Create Promo" button appears after publish
- [ ] Fix button to open promo modal (not Content Studio)

#### Step 3: Promo Creation ❌ (40% Complete)
**Current:** ⚠️ Partially working
**Needs:**
- [ ] Create promo creation modal
- [ ] Wire to `/api/mi/promo/from-product`
- [ ] Generate QR code
- [ ] Deploy promo via `/api/promo/configure`
- [ ] Return public URL to user

#### Step 4: Promo Sharing ❌ (20% Complete)
**Current:** ⚠️ Missing
**Needs:**
- [ ] Public landing page (`/p/promo/:publicId`)
- [ ] QR code image generation
- [ ] Download/share functionality

#### Step 5: Customer Redemption ❌ (30% Complete)
**Current:** ⚠️ Backend exists, frontend missing
**Needs:**
- [ ] Registration page (`/r/:publicId`)
- [ ] Registration endpoint
- [ ] Redemption tracking
- [ ] Confirmation page

#### Step 6: Business Outcome ❌ (0% Complete)
**Current:** ❌ Missing
**Needs:**
- [ ] Analytics dashboard
- [ ] Redemption reports
- [ ] Customer list
- [ ] Export functionality

---

## 4. PRIORITY ACTION ITEMS

### 🔴 CRITICAL (Blocks Sprint Goal)

1. **Complete Promo Creation Flow**
   - **Estimate:** 2-3 days
   - **Tasks:**
     - Create `PromoCreationModal.tsx`
     - Wire to `/api/mi/promo/from-product`
     - Generate QR code on deployment
     - Return public URL

2. **Implement Public Landing Page**
   - **Estimate:** 1-2 days
   - **Tasks:**
     - Register `/p/promo/:publicId` route
     - Load PromoDeployment by publicId
     - Display promo details
     - Track landing views

3. **Implement Registration Flow**
   - **Estimate:** 1-2 days
   - **Tasks:**
     - Create registration form
     - Add `POST /api/promo/register/:publicId` endpoint
     - Track registrations
     - Show confirmation

4. **Fix "Create Promo" Button Flow**
   - **Estimate:** 0.5 days
   - **Tasks:**
     - Ensure button appears after publish
     - Open promo modal (not Content Studio)
     - Pass storeId/productId context

### 🟡 HIGH (Improves Stability)

5. **Stabilize Store Creation**
   - **Estimate:** 1 day
   - **Tasks:**
     - Unify creation endpoints
     - Standardize response format
     - Fix lifecycle stage transitions

6. **Add QR Code Generation**
   - **Estimate:** 0.5 days
   - **Tasks:**
     - Install `qrcode` package
     - Generate QR on promo deployment
     - Store QR image URL

7. **Add Promo Analytics**
   - **Estimate:** 1 day
   - **Tasks:**
     - Create analytics endpoint
     - Build analytics UI
     - Show real-time stats

### 🟢 MEDIUM (Nice to Have)

8. **Store Preview Endpoint**
   - **Estimate:** 0.5 days

9. **Store Analytics**
   - **Estimate:** 1 day

10. **Export Functionality**
    - **Estimate:** 0.5 days

---

## 5. ESTIMATED EFFORT

### Total to Complete Sprint Goal

**Critical Path:** 5-7 days
- Promo creation flow: 2-3 days
- Public landing page: 1-2 days
- Registration flow: 1-2 days
- Fix "Create Promo" button: 0.5 days

**Stabilization:** 2-3 days
- Store creation unification: 1 day
- QR code generation: 0.5 days
- Promo analytics: 1 day

**Total:** 7-10 days of focused development

---

## 6. RECOMMENDATIONS

### Immediate Actions (This Week)

1. **Focus on Critical Path Only**
   - Skip store creation stabilization (works well enough)
   - Skip analytics (can add later)
   - Focus on: Promo creation → Landing page → Registration

2. **Minimal Viable Promo**
   - Simple discount (percentage or fixed)
   - Single product target
   - 7-day default duration
   - Basic QR code (text link, not image initially)

3. **Test End-to-End Daily**
   - Create store → Publish → Create promo → Share → Register
   - Fix blockers immediately
   - Don't add features until flow works

### Architecture Decisions

1. **Promo Creation:**
   - Use existing `/api/mi/promo/from-product` endpoint
   - Create Content record with `mode: 'promo'`
   - Deploy via `/api/promo/configure`
   - Return public URL immediately

2. **Public Pages:**
   - Use existing `PromoDeployment` model
   - `publicId` is short token (10 chars)
   - Routes: `/p/promo/:publicId` and `/r/:publicId`

3. **Tracking:**
   - Use `PromoDeployment` counters (simple)
   - Add `PromoTracking` records for detailed events (later)

---

## 7. TESTING CHECKLIST

### Store Creation → Publish
- [ ] Create store via Quick Start (Form)
- [ ] Verify store appears in review page
- [ ] Add profile visuals (avatar + background)
- [ ] Publish store
- [ ] Verify "Create Promo" button appears

### Promo Creation
- [ ] Click "Create Promo" after publish
- [ ] Select product from list
- [ ] Configure discount (10% off)
- [ ] Set duration (7 days)
- [ ] Deploy promo
- [ ] Verify public URL returned
- [ ] Verify QR code generated

### Promo Sharing
- [ ] Open public URL (`/p/promo/:publicId`)
- [ ] Verify promo details displayed
- [ ] Verify QR code visible
- [ ] Click "Register" button
- [ ] Verify redirect to registration page

### Registration
- [ ] Fill registration form
- [ ] Submit form
- [ ] Verify registration recorded
- [ ] Verify redirect to confirmation
- [ ] Verify `registrations` counter incremented

### Analytics
- [ ] View promo in dashboard
- [ ] Verify stats displayed (scans, views, registrations)
- [ ] Verify redemption list visible

---

## 8. KNOWN ISSUES / BLOCKERS

### Current Blockers

1. **"Create Promo" Button Flow**
   - May redirect to Content Studio instead of promo modal
   - **Fix:** Update `StoreDraftReview.tsx` to open promo modal

2. **QR Code Generation**
   - Not implemented
   - **Fix:** Add `qrcode` package, generate on deployment

3. **Public Landing Page Route**
   - May not be registered
   - **Fix:** Add route in router config

4. **Registration Endpoint**
   - May not exist
   - **Fix:** Add `POST /api/promo/register/:publicId`

### Non-Blockers (Can Fix Later)

1. Store creation path unification
2. Lifecycle stage management
3. Store analytics
4. Promo analytics dashboard
5. Export functionality

---

## 9. CONCLUSION

### Current State
- **Store Creation:** ✅ 70% complete, works but fragile
- **Store Publish:** ✅ 80% complete, functional
- **Promotion v1:** ❌ 40% complete, missing critical pieces

### Path to Sprint Goal
- **Critical Path:** 5-7 days of focused development
- **Focus Areas:** Promo creation, landing page, registration
- **Can Defer:** Store stabilization, analytics, exports

### Recommendation
**Focus exclusively on Promotion v1 completion this week:**
1. Day 1-2: Promo creation flow + QR generation
2. Day 3-4: Public landing page + registration
3. Day 5: End-to-end testing + bug fixes
4. Day 6-7: Buffer for unexpected issues

**Store creation is "good enough" for now** - stabilize after promotion v1 is complete.

---

**Report Generated:** 2026-01-01  
**Next Review:** After promo creation flow is implemented


