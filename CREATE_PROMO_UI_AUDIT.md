# Create Smart Promotion UI Audit Report

## Summary

The "Create Smart Promotion" UI is **currently active** in the dashboard. It was **NOT removed** - it exists in multiple locations with a unified handler.

---

## 1. Component & Button Locations

### Primary Component
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

### Button Locations:

#### A) Header "Create Promo" Button (After Publish)
- **Line:** 4569-4601
- **Location:** Header section, shown only when `isPublished && publishedStoreId`
- **Code:**
  ```tsx
  {isPublished && publishedStoreId && (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const productId = effectiveDraft.catalog.products[0]?.id;
        if (productId) {
          handleCreatePromotion(productId);
        }
      }}
      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 h-10 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 active:bg-violet-700 relative disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={!effectiveDraft.catalog.products || effectiveDraft.catalog.products.length === 0 || isCreatingPromo}
    >
      {isCreatingPromo ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Creating...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4" />
          Create Promo
        </>
      )}
      <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 bg-yellow-300 rounded-full border border-violet-200">
        Premium
      </span>
    </button>
  )}
  ```

#### B) Product Card Hover "Promote" Button
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductReviewCard.tsx`
- **Line:** 372
- **Location:** Product card hover actions
- **Code:**
  ```tsx
  <button
    onClick={() => {
      onCreatePromotion?.();
    }}
    className="..."
  >
    Promote
  </button>
  ```
- **Prop:** `onCreatePromotion` passed from `StoreDraftReview.tsx:4379`

#### C) Ambient MI Assistant
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/AmbientMIAssistant.tsx`
- **Line:** 109
- **Location:** Floating assistant suggestions
- **Action:** "Create Smart Promotion" chip

#### D) Assistant Dock
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/AssistantDock.tsx`
- **Line:** 137
- **Location:** Assistant dock panel
- **Prop:** `onCreatePromotion` passed from `StoreDraftReview.tsx:4799`

---

## 2. Handler Function

### Primary Handler
**Function:** `handleCreatePromotion`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
**Line:** 2269-2435

**Flow:**
1. Validates `productId`
2. Uses `runWithAuth` to gate action (requires auth + premium)
3. Validates product readiness (score >= 80)
4. Opens `SmartContentUpgradeModal` (line 2381)
5. On confirmation, calls `handleSmartUpgradeConfirm` (line 2438)

### Secondary Handler (Modal Confirmation)
**Function:** `handleSmartUpgradeConfirm`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
**Line:** 2438-2851

**Flow:**
1. Calls `createSmartPromotionFromProduct` (line 2530)
2. Navigates to Content Studio editor on success
3. Shows error toast on failure

---

## 3. API Endpoints Called

### Service Layer
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createSmartPromotion.ts`
**Function:** `createSmartPromotionFromProduct` (line 60)

**Two API Paths:**

#### Path 1: Draft-Based Creation (if `jobId` exists but context missing)
- **Endpoint:** `POST /api/mi/promo/from-draft`
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/api/miPromo.ts:682`
- **Request Body:**
  ```typescript
  {
    jobId: string,
    productId: string,
    environment: 'print' | 'screen' | 'social' | 'hybrid',
    format: string,
    goal?: 'visit' | 'order' | 'call' | 'book'
  }
  ```

#### Path 2: Product-Based Creation (if `tenantId` and `storeId` exist)
- **Endpoint:** `POST /api/mi/promo/from-product`
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/api/miPromo.ts:794`
- **Request Body:**
  ```typescript
  {
    tenantId: string,
    storeId: string,
    productId: string,
    environment: 'print' | 'screen' | 'social' | 'hybrid',
    format: string,
    goal?: 'visit' | 'order' | 'call' | 'book'
  }
  ```

**Response (both endpoints):**
```typescript
{
  ok: boolean,
  instanceId?: string,
  promoId?: string,
  storeId?: string,
  tenantId?: string,
  error?: { code: string, message: string }
}
```

---

## 4. Database Entities Affected

### Backend Models (from Prisma schema)

#### A) PromoInstance
- **Model:** `PromoInstance` (in `apps/core/cardbey-core/prisma/schema.prisma`)
- **Created by:** Backend `/api/mi/promo/from-draft` or `/api/mi/promo/from-product`
- **Fields:** `id`, `draftId`, `storeId`, `tenantId`, `productId`, `status`, `publicId`, etc.

#### B) Content (Draft)
- **Model:** `Content` (promotion draft)
- **Created by:** Backend promo creation endpoints
- **Fields:** `id`, `templateId: 'promotion'`, `data` (JSON with promo structure)

#### C) SmartObject (Created Later, Not During Promo Creation)
- **Model:** `SmartObject` (in `apps/core/cardbey-core/prisma/schema.prisma`)
- **Created by:** `PromoDeployPage` when deploying promo to print environment
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/PromoDeployPage.tsx:239`
- **Endpoint:** `POST /api/smart-objects`
- **Note:** SmartObject is **NOT created during promo creation** - it's created later when the user deploys the promo to print environment

#### D) SmartObjectActivePromo
- **Model:** `SmartObjectActivePromo`
- **Created by:** `PromoDeployPage` when user publishes promo
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/PromoDeployPage.tsx:340`
- **Endpoint:** `POST /api/smart-objects/:id/active-promo`
- **Note:** This links a SmartObject to a PromoInstance, but only happens during deploy, not during creation

---

## 5. SmartObject Creation Flow (Separate from Promo Creation)

### SmartObject Creation is NOT Part of Promo Creation

**Important:** SmartObject entities are **NOT created** during the "Create Smart Promotion" flow. They are created later when:

1. **User deploys promo to print environment:**
   - **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/PromoDeployPage.tsx`
   - **Function:** `loadOrCreateSmartObject` (line 177)
   - **Trigger:** When `isPrint && hasRequiredContext && context.storeId` (line 163)
   - **Endpoint:** `POST /api/smart-objects` (line 239)
   - **Request:**
     ```typescript
     {
       storeId: string,
       productId?: string,
       type?: 'print_bag' | 'promo_card' | 'sticker' | 'other',
       status?: 'active' | 'inactive' | 'archived'
     }
     ```

2. **User publishes promo (binds promo to SmartObject):**
   - **Function:** `handlePublish` (line 311)
   - **Endpoint:** `POST /api/smart-objects/:id/active-promo` (line 340)
   - **Request:**
     ```typescript
     {
       promoId: string, // PromoInstance.id
       promoType: 'instance' | 'rule'
     }
     ```

### SmartObject API Client
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/api/smartObject.ts`

**Functions:**
- `createSmartObject` (line 99) → `POST /api/smart-objects`
- `getSmartObject` (line 56) → `GET /api/smart-objects/:idOrPublicCode`
- `setSmartObjectActivePromo` (line 143) → `POST /api/smart-objects/:id/active-promo`

---

## 6. Removal Status

### ❌ NOT REMOVED

The "Create Smart Promotion" UI is **currently active** and has **NOT been removed**. Evidence:

1. **Active code exists:**
   - `handleCreatePromotion` handler (line 2269)
   - Multiple button locations (header, product cards, assistant)
   - Service layer (`createSmartPromotion.ts`)
   - API clients (`miPromo.ts`, `smartObject.ts`)

2. **Action mapping table confirms it:**
   - **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx:290`
   - **Line:** `- Create Smart Promotion: Card hover → "Promote" button`

3. **No removal commits found:**
   - No evidence of removal in current codebase
   - All components are present and wired

### Historical Note
The UI may have been **refactored** (not removed):
- Previously: Multiple duplicate buttons
- Now: Unified handler `handleCreatePromotion` with single source of truth `createSmartPromotionFromProduct`
- Buttons consolidated to canonical locations per action mapping table

---

## 7. Complete Flow Diagram

```
User clicks "Create Promo" / "Promote" button
  ↓
handleCreatePromotion(productId)
  ↓
runWithAuth (gates: auth + premium)
  ↓
Validate product readiness (score >= 80)
  ↓
Open SmartContentUpgradeModal
  ↓
User selects environment/format/goal
  ↓
handleSmartUpgradeConfirm
  ↓
createSmartPromotionFromProduct(params)
  ↓
[Path 1: If jobId exists] → POST /api/mi/promo/from-draft
[Path 2: If tenantId+storeId exist] → POST /api/mi/promo/from-product
  ↓
Backend creates:
  - PromoInstance (database)
  - Content (promotion draft)
  ↓
Returns: { ok: true, instanceId, promoId }
  ↓
Navigate to Content Studio: /app/creative-shell?instanceId=...
  ↓
[LATER: When user deploys to print]
  ↓
PromoDeployPage.loadOrCreateSmartObject()
  ↓
POST /api/smart-objects → Creates SmartObject
  ↓
User publishes promo
  ↓
POST /api/smart-objects/:id/active-promo → Links SmartObject to PromoInstance
```

---

## 8. Key Files Reference

| Purpose | File | Key Function/Component |
|---------|------|------------------------|
| **UI Handler** | `StoreDraftReview.tsx` | `handleCreatePromotion` (line 2269) |
| **Service Layer** | `services/createSmartPromotion.ts` | `createSmartPromotionFromProduct` (line 60) |
| **API Client (Draft)** | `api/miPromo.ts` | `createPromoFromDraft` (line 682) |
| **API Client (Product)** | `api/miPromo.ts` | `createPromoFromProduct` (line 794) |
| **Product Card Button** | `review/ProductReviewCard.tsx` | `onCreatePromotion` prop (line 372) |
| **SmartObject Creation** | `features/content-studio/pages/PromoDeployPage.tsx` | `loadOrCreateSmartObject` (line 177) |
| **SmartObject API** | `api/smartObject.ts` | `createSmartObject` (line 99) |
| **SmartObject Binding** | `api/smartObject.ts` | `setSmartObjectActivePromo` (line 143) |

---

## 9. Summary

✅ **Status:** Active and functional  
✅ **Buttons:** Multiple locations (header, product cards, assistant)  
✅ **Handler:** `handleCreatePromotion` → `createSmartPromotionFromProduct`  
✅ **APIs:** `POST /api/mi/promo/from-draft` OR `POST /api/mi/promo/from-product`  
✅ **DB Entities:** Creates `PromoInstance` and `Content` (promotion draft)  
⚠️ **SmartObject:** Created **later** during deploy, not during promo creation  
❌ **Removed:** No - UI is active and working

---

## 10. Missing UI: Direct SmartObject Creation

**Note:** There is **NO UI** to create SmartObjects directly from the store draft review page. SmartObjects are only created:
- Automatically when deploying a promo to print environment
- Via `PromoDeployPage` (Content Studio)

**This is the gap identified in the audit:** No dashboard UI exists to create SmartObjects independently of promo deployment.

