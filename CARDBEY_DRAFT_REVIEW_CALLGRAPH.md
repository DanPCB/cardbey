# Cardbey Draft Review Call Graph & Timeline

**Date:** 2026-01-08  
**Audit Mode:** READ-ONLY (No Code Changes)  
**Route:** `/app/store/:storeId/review?mode=draft&jobId=...`

---

## 1. Mermaid Call Graph Diagram

```mermaid
flowchart TD
    Start([User navigates to /app/store/:storeId/review]) --> Route[React Router: App.jsx:349]
    Route --> Component[StoreReviewPage Component<br/>StoreReviewPage.tsx:19]
    
    Component --> UseEffect[useEffect Hook<br/>StoreReviewPage.tsx:189]
    UseEffect --> CheckStoreId{storeId exists?}
    CheckStoreId -->|No| SetError[setError 'Store ID required'<br/>StoreReviewPage.tsx:191]
    CheckStoreId -->|Yes| SetRouteRef[routeStoreIdRef.current = storeId<br/>StoreReviewPage.tsx:198]
    
    SetRouteRef --> ResolveJobId[resolveJobId async<br/>StoreReviewPage.tsx:201]
    ResolveJobId --> CheckURLJobId{jobId in URL?}
    CheckURLJobId -->|Yes| ReturnJobId[Return jobId from URL]
    CheckURLJobId -->|No| FetchByStore[GET /api/mi/orchestra/job/by-store/:storeId<br/>StoreReviewPage.tsx:214]
    FetchByStore --> ParseJobId[Extract jobId from response]
    ParseJobId --> UpdateURL[Update URL with jobId<br/>StoreReviewPage.tsx:245]
    
    ReturnJobId --> CheckLoaded{hasLoadedRef.current<br/>&& routeStoreIdRef === storeId?}
    UpdateURL --> CheckLoaded
    CheckLoaded -->|Yes| EarlyReturn[Early return - already loaded<br/>StoreReviewPage.tsx:287]
    CheckLoaded -->|No| CreateAbortController[Create AbortController<br/>StoreReviewPage.tsx:297]
    
    CreateAbortController --> LoadStoreData[loadStoreData async<br/>StoreReviewPage.tsx:424]
    LoadStoreData --> CheckInFlight{draftFetchInFlightRef.current?}
    CheckInFlight -->|Yes| ReturnInFlight[Return - fetch in flight<br/>StoreReviewPage.tsx:434]
    CheckInFlight -->|No| SetInFlight[draftFetchInFlightRef.current = true<br/>StoreReviewPage.tsx:448]
    
    SetInFlight --> IncrementReqId[reqId = ++lastRequestIdRef.current<br/>StoreReviewPage.tsx:443]
    IncrementReqId --> SetLoading[setLoading true, setError null<br/>StoreReviewPage.tsx:446-447]
    
    SetLoading --> CheckMode{mode === 'draft'?}
    CheckMode -->|No| NonDraftPath[Non-draft mode path<br/>StoreReviewPage.tsx:770]
    CheckMode -->|Yes| CheckAuth{isLoggedIn?<br/>StoreReviewPage.tsx:469}
    
    CheckAuth -->|No| PublicEndpoint[loadDraftWithFallback<br/>OR direct public call<br/>StoreReviewPage.tsx:515]
    CheckAuth -->|Yes| AuthEndpoint[loadDraftWithFallback<br/>StoreReviewPage.tsx:363]
    
    AuthEndpoint --> TryAuth[Try: apiGET /stores/:id/draft<br/>StoreReviewPage.tsx:368]
    TryAuth --> ApiGET[apiGET function<br/>api.ts:638]
    ApiGET --> Request[request function<br/>api.ts:358]
    Request --> CheckProtected{isProtectedEndpoint<br/>&& !hasAuthTokens?}
    CheckProtected -->|Yes| Throw401[Throw 401 error<br/>api.ts:373]
    CheckProtected -->|No| ResolveURL[resolveUrl path<br/>api.ts:387]
    ResolveURL --> BuildHeaders[Build headers with Authorization<br/>api.ts:464]
    BuildHeaders --> Fetch[fetch request<br/>api.ts:501]
    
    Fetch --> BackendAuth[Backend: GET /api/stores/:id/draft<br/>stores.js:411]
    BackendAuth --> RequireAuth[requireAuth middleware]
    RequireAuth --> CheckPermission{store.userId === req.userId<br/>OR dev-admin-token?<br/>stores.js:465}
    CheckPermission -->|No| Return403[Return 403 Forbidden<br/>stores.js:466]
    CheckPermission -->|Yes| PrismaQuery[Prisma: business.findUnique<br/>stores.js:415]
    
    PrismaQuery --> DBQuery[(SQLite Database)]
    DBQuery --> ReturnProducts[Return products array]
    ReturnProducts --> BuildResponse[Build response object<br/>stores.js:497]
    BuildResponse --> Return200[Return 200 OK<br/>{ ok: true, draft: {...}, store: {...} }]
    
    Return403 --> CatchAuth[Catch 401/403 error<br/>StoreReviewPage.tsx:384]
    CatchAuth --> CheckStatus{status === 401<br/>OR 403?<br/>StoreReviewPage.tsx:387}
    CheckStatus -->|Yes| TryPublic[Try: apiGET /public/store/:id/draft<br/>StoreReviewPage.tsx:396]
    CheckStatus -->|No| ThrowError[Throw error as-is]
    
    TryPublic --> BackendPublic[Backend: GET /api/public/store/:id/draft<br/>publicUsers.js:31]
    BackendPublic --> PrismaQueryPublic[Prisma: business.findUnique<br/>publicUsers.js:35]
    PrismaQueryPublic --> DBQuery
    DBQuery --> ReturnProductsPublic[Return products array]
    ReturnProductsPublic --> BuildResponsePublic[Build response object<br/>publicUsers.js:104]
    BuildResponsePublic --> Return200Public[Return 200 OK<br/>{ ok: true, draft: {...}, store: {...} }]
    
    Return200 --> Normalize[Normalize response<br/>normalizeDraftResponse<br/>StoreReviewPage.tsx:300]
    Return200Public --> Normalize
    
    Normalize --> CheckFormat{response.draft.catalog.products?}
    CheckFormat -->|Yes| ExtractNew[Extract from draft.catalog<br/>StoreReviewPage.tsx:314]
    CheckFormat -->|No| ExtractLegacy[Extract from legacy format<br/>StoreReviewPage.tsx:332]
    
    ExtractNew --> ConvertStoreDraft[Convert to StoreDraft format<br/>StoreReviewPage.tsx:864]
    ExtractLegacy --> ConvertStoreDraft
    
    ConvertStoreDraft --> CheckObsoleted{reqId !== lastRequestIdRef?<br/>StoreReviewPage.tsx:902}
    CheckObsoleted -->|Yes| DiscardResult[Discard result - request obsoleted]
    CheckObsoleted -->|No| CheckGuard{Guard: draft has products<br/>&& new payload empty?<br/>StoreReviewPage.tsx:920}
    
    CheckGuard -->|Yes| DiscardResult
    CheckGuard -->|No| CheckFirstLoad{!hasLoadedRef.current?<br/>StoreReviewPage.tsx:929}
    CheckFirstLoad -->|Yes| SetDraftFirst[setDraft storeDraft<br/>StoreReviewPage.tsx:940]
    CheckFirstLoad -->|No| CheckShouldUpdate{shouldUpdate?<br/>StoreReviewPage.tsx:948}
    
    CheckShouldUpdate -->|No| DiscardResult
    CheckShouldUpdate -->|Yes| CheckObsoleted2{reqId !== lastRequestIdRef?<br/>StoreReviewPage.tsx:969}
    CheckObsoleted2 -->|Yes| DiscardResult
    CheckObsoleted2 -->|No| SetDraft[setDraft storeDraft<br/>StoreReviewPage.tsx:988]
    
    SetDraftFirst --> SetHasLoaded[hasLoadedRef.current = true<br/>StoreReviewPage.tsx:941]
    SetDraft --> SetHasLoaded2[hasLoadedRef.current = true<br/>StoreReviewPage.tsx:989]
    
    SetHasLoaded --> Finally[finally block<br/>StoreReviewPage.tsx:1096]
    SetHasLoaded2 --> Finally
    DiscardResult --> Finally
    ThrowError --> CatchError[Catch error<br/>StoreReviewPage.tsx:1066]
    CatchError --> CheckAborted{signal.aborted OR<br/>routeStoreId changed OR<br/>reqId obsoleted?<br/>StoreReviewPage.tsx:1072}
    CheckAborted -->|Yes| ReturnEarly[Return early - ignore error]
    CheckAborted -->|No| CheckExistingDraft{draft &&<br/>draft.catalog.products.length > 0?<br/>StoreReviewPage.tsx:1086}
    CheckExistingDraft -->|Yes| PreserveDraft[Preserve existing draft<br/>Don't set error]
    CheckExistingDraft -->|No| SetError[setError err.message<br/>StoreReviewPage.tsx:1093]
    
    PreserveDraft --> Finally
    SetError --> Finally
    Finally --> ClearLoading[setLoading false<br/>draftFetchInFlightRef.current = false<br/>StoreReviewPage.tsx:1098-1099]
    
    ClearLoading --> Render{Render component}
    Render --> CheckLoading{loading?}
    CheckLoading -->|Yes| ShowSpinner[Show loading spinner<br/>StoreReviewPage.tsx:1090]
    CheckLoading -->|No| CheckError{error && !draft?}
    CheckError -->|Yes| ShowError[Show error UI<br/>StoreReviewPage.tsx:1104]
    CheckError -->|No| CheckDraft{!draft ||<br/>!hasMinimumRequiredFields?<br/>StoreReviewPage.tsx:1135}
    CheckDraft -->|Yes| ShowError2[Show error UI with retry<br/>StoreReviewPage.tsx:1170]
    CheckDraft -->|No| RenderDraft[Render StoreDraftReview<br/>StoreReviewPage.tsx:1231]
    
    subgraph MI_Orchestra[MI Orchestra Sync-Store Flow]
        SyncStore[POST /api/mi/orchestra/job/:jobId/sync-store<br/>miRoutes.js:776]
        SyncStore --> CheckAccess[Check job access<br/>miRoutes.js:804]
        CheckAccess --> ExtractStoreId[Extract storeId from job<br/>miRoutes.js:813]
        ExtractStoreId --> FindArtifacts[Find MiArtifact records<br/>miRoutes.js:855]
        FindArtifacts --> ParseArtifacts[Parse artifact.data<br/>miRoutes.js:869]
        ParseArtifacts --> CheckStage{stage === 'generate_catalog'<br/>OR 'sync_store'?}
        CheckStage -->|No| TryTaskOutputs[Try task.outputs<br/>miRoutes.js:880]
        CheckStage -->|Yes| ExtractProducts[Extract products array<br/>miRoutes.js:924]
        TryTaskOutputs --> CheckOutputs{outputs.generate_catalog?}
        CheckOutputs -->|Yes| ExtractProducts
        CheckOutputs -->|No| TryActivityEvent[Try ActivityEvent<br/>miRoutes.js:892]
        TryActivityEvent --> ExtractProducts
        ExtractProducts --> CheckProducts{products.length > 0?}
        CheckProducts -->|No| LogZero[Log: productsWritten = 0<br/>miRoutes.js:1022]
        CheckProducts -->|Yes| LoopProducts[For each product<br/>miRoutes.js:942]
        LoopProducts --> GenerateNormalizedName[Generate normalizedName<br/>miRoutes.js:951]
        GenerateNormalizedName --> UpsertProduct[Upsert product<br/>miRoutes.js:971]
        UpsertProduct --> IncrementCount[productsWritten++<br/>miRoutes.js:1014]
        IncrementCount --> LogSuccess[Log: productsWritten, imagesWritten<br/>miRoutes.js:1038]
    end
    
    style Return403 fill:#ffcccc
    style DiscardResult fill:#ffffcc
    style SetError fill:#ffcccc
    style ShowError fill:#ffcccc
    style ShowError2 fill:#ffcccc
    style LogZero fill:#ffcccc
```

---

## 2. Request Timeline Table

| Order | Trigger | Frontend Function | Endpoint | Backend Handler | Notes |
|------:|---------|-------------------|----------|-----------------|-------|
| 1 | Route mount | `useEffect` (StoreReviewPage.tsx:189) | N/A | N/A | Component mounts, checks `storeId` |
| 2 | `useEffect` deps change | `resolveJobId` (StoreReviewPage.tsx:201) | `GET /api/mi/orchestra/job/by-store/:storeId` | `miRoutes.js` (if exists) | Recover `jobId` if missing from URL |
| 3 | `loadStoreData()` called | `loadStoreData` (StoreReviewPage.tsx:424) | N/A | N/A | Main data loading function |
| 4 | Auth check | `getTokens()` (StoreReviewPage.tsx:469) | N/A | N/A | Check if user is logged in |
| 5a | Authenticated path | `loadDraftWithFallback` (StoreReviewPage.tsx:363) | `GET /api/stores/:id/draft` | `stores.js:411` | Try authenticated endpoint first |
| 5b | Unauthenticated path | Direct call (StoreReviewPage.tsx:515) | `GET /api/public/store/:id/draft` | `publicUsers.js:31` | Use public endpoint directly |
| 6 | API request | `apiGET` (api.ts:638) | Same as 5a/5b | Same as 5a/5b | Wrapper for `request()` |
| 7 | URL resolution | `resolveUrl` (api.ts:387) | N/A | N/A | Convert path to full URL |
| 8 | Auth header | `buildAuthHeader` (api.ts:90) | N/A | N/A | Add `Authorization: Bearer dev-admin-token` |
| 9 | Fetch request | `fetch` (api.ts:501) | Same as 5a/5b | Same as 5a/5b | Browser fetch API |
| 10 | Backend auth check | `requireAuth` middleware | Same as 5a | `stores.js:411` | Verify JWT token |
| 11 | Permission check | Ownership check (stores.js:465) | Same as 5a | `stores.js:465` | `store.userId === req.userId` OR `dev-admin-token` |
| 12 | Prisma query | `prisma.business.findUnique` | Same as 5a/5b | `stores.js:415` OR `publicUsers.js:35` | Query store + products |
| 13 | Database query | SQLite query | Same as 5a/5b | Database | Execute SELECT |
| 14 | Response build | Build JSON response | Same as 5a/5b | `stores.js:497` OR `publicUsers.js:104` | Format response |
| 15 | Error handling | `catch` block (StoreReviewPage.tsx:384) | Same as 5a | N/A | If 401/403, fallback to public |
| 16 | Fallback request | `apiGET /public/store/:id/draft` (StoreReviewPage.tsx:396) | `GET /api/public/store/:id/draft` | `publicUsers.js:31` | Fallback on auth error |
| 17 | Response normalization | `normalizeDraftResponse` (StoreReviewPage.tsx:300) | N/A | N/A | Normalize response shape |
| 18 | StoreDraft conversion | Convert to `StoreDraft` (StoreReviewPage.tsx:864) | N/A | N/A | Convert to component format |
| 19 | State update | `setDraft` (StoreReviewPage.tsx:940/988) | N/A | N/A | Update React state |
| 20 | Render | Component render | N/A | N/A | Render UI based on state |

### Additional Orchestra Endpoints (if jobId present)

| Order | Trigger | Frontend Function | Endpoint | Backend Handler | Notes |
|------:|---------|-------------------|----------|-----------------|-------|
| 21 | Job polling | `useOrchestraJob` hook | `GET /api/mi/orchestra/job/:jobId` | `miRoutes.js` | Poll job status |
| 22 | Next actions | `fetchNextActions` | `GET /api/mi/orchestra/job/:jobId/next-actions` | `miRoutes.js` | Get next actions |
| 23 | Sync store | `POST /api/mi/orchestra/job/:jobId/sync-store` | `sync-store` call | `miRoutes.js:776` | Write products to DB |
| 24 | Run job | `POST /api/mi/orchestra/job/:jobId/run` | Job execution | `miRoutes.js` | Execute job stages |

---

## 3. Where Draft Becomes Null

### **Location 1: Initial State (VERIFIED)**
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:58`
- **Code:** `const [draft, setDraft] = useState<StoreDraft | null>(null);`
- **Condition:** Component initialization - always starts as `null`
- **Impact:** LOW - Expected initial state

### **Location 2: Request Obsoleted / Discarded (VERIFIED - PRIMARY ROOT CAUSE)**
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:902, 914, 969`
- **Code:** 
  ```typescript
  if (routeStoreIdRef.current !== currentStoreId || reqId !== lastRequestIdRef.current) {
    return; // Don't update state
  }
  ```
- **Condition:** If a second request completes before the first, the first request's results are discarded
- **Impact:** HIGH - Valid responses can be discarded, leaving `draft = null`

### **Location 3: Guard Logic Preventing Update (VERIFIED - PRIMARY ROOT CAUSE)**
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:920, 952`
- **Code:**
  ```typescript
  // Guard 1: Line 920
  if (draft && draft.catalog.products.length > 0 && storeDraft.catalog.products.length === 0) {
    return; // Exit early, preserve existing state
  }
  
  // Guard 2: Line 948
  const shouldUpdate = 
    storeDraft.catalog.products.length > 0 || 
    (draft && draft.catalog.products.length === 0);
  if (!shouldUpdate) {
    return; // Exit early
  }
  ```
- **Condition:** 
  - If `hasLoadedRef.current = true` (from previous load) AND new payload has empty products, guard prevents `setDraft()`
  - If `draft = null` but guard checks `draft.catalog.products.length`, it may throw or not execute correctly
- **Impact:** HIGH - Prevents `draft` from being set if products are empty on subsequent loads

### **Location 4: Error Path Not Setting Draft (VERIFIED)**
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:1066-1095`
- **Code:**
  ```typescript
  catch (err: any) {
    // ... error handling ...
    if (draft && draft.catalog.products.length > 0) {
      // Preserve existing draft, don't set error
      return;
    } else {
      setError(err?.message || 'Failed to load store data');
      // NOTE: setDraft() is NOT called here
    }
  }
  ```
- **Condition:** If error occurs and no existing draft, `error` is set but `draft` remains `null`
- **Impact:** MEDIUM - Expected behavior, but combined with other issues can cause UI to show error

### **Location 5: Normalization Failure (POSSIBLE)**
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:823`
- **Code:**
  ```typescript
  if (!storeData.store || !storeData.store.id) {
    throw new Error('Draft endpoint contract mismatch: store missing required field "id"');
  }
  ```
- **Condition:** If `normalizeDraftResponse()` fails to extract `store.id`, error is thrown and `draft` is never set
- **Impact:** MEDIUM - Can cause `draft` to remain `null` if response shape is unexpected

### **Location 6: 403 Error Without Fallback (POSSIBLE)**
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:384-419`
- **Code:**
  ```typescript
  catch (authErr: any) {
    const status = authErr?.status || authErr?.response?.status || authErr?.responseData?.status;
    const isAuthError = status === 401 || status === 403;
    if (isAuthError) {
      // Fallback to public endpoint
    } else {
      throw authErr; // Re-throw non-auth errors
    }
  }
  ```
- **Condition:** If `error.status` is not set correctly (e.g., network error), fallback won't trigger and error is thrown
- **Impact:** MEDIUM - Can cause `draft` to remain `null` if 403 is not detected as auth error

---

## 4. Why productsWritten=0

### **Root Cause: No Products in Stage Outputs**

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js:923-940`

**Evidence:**
1. **Product Extraction Logic** (line 924-928):
   ```javascript
   const products = catalogOutput?.catalog?.items || 
                   catalogOutput?.catalog?.products ||
                   catalogOutput?.items || 
                   catalogOutput?.products || 
                   (Array.isArray(catalogOutput) ? catalogOutput : []);
   ```

2. **Stage Output Sources** (checked in order):
   - **Source 1:** `MiArtifact` table (line 855-877)
     - Queries: `prisma.miArtifact.findMany({ where: { orchestratorTaskId: jobId, artifactType: 'stage_output' } })`
     - Parses `artifact.data` for `stage === 'generate_catalog'` or `stage === 'sync_store'`
   - **Source 2:** `task.outputs` (line 880-888)
     - Reads from `task.outputs` JSON field
     - Looks for `outputs.generate_catalog` or `outputs.catalog`
   - **Source 3:** `ActivityEvent` table (line 892-921)
     - Fallback: `prisma.activityEvent.findMany({ where: { storeId, type: ['orchestra_stage_completed', ...] } })`
     - Parses `event.payload` for catalog data

3. **Condition for productsWritten=0** (line 940):
   ```javascript
   if (products.length > 0) {
     // Upsert products...
   } else {
     // Log warning if no products found
     if (process.env.NODE_ENV === 'development') {
       console.warn(`[MI Orchestra] No products found in stage outputs for job ${jobId}`, {
         hasCatalogOutput: !!catalogOutput,
         catalogOutputKeys: catalogOutput ? Object.keys(catalogOutput) : [],
         taskOutputsKeys: task.outputs ? Object.keys(...) : [],
       });
     }
   }
   ```

### **Why It Happens:**

1. **Stage Output Not Persisted:**
   - `generate_catalog` stage may not write to `MiArtifact` table
   - `task.outputs` may not be populated
   - `ActivityEvent` may not contain catalog data

2. **Wrong Stage Name:**
   - Code looks for `stage === 'generate_catalog'` or `stage === 'sync_store'`
   - If stage uses different name (e.g., `catalog_generation`), products won't be found

3. **Wrong Data Structure:**
   - Code expects `catalog.items` or `catalog.products` or `items` or `products`
   - If stage output uses different keys (e.g., `catalog.itemsList`), products won't be extracted

4. **Empty Catalog:**
   - Stage may complete successfully but return empty catalog
   - Products array is `[]`, so `products.length === 0`

### **Impact on Draft Endpoint:**

**File:** `apps/core/cardbey-core/src/routes/stores.js:415-448`

The draft endpoint reads directly from the `Product` table:
```javascript
const store = await prisma.business.findUnique({
  where: { id },
  include: {
    products: {
      where: { deletedAt: null },
      select: { ... },
    }
  }
});
```

**Conclusion:** `productsWritten=0` means products were never written to the database, so the draft endpoint will return empty `catalog.products` array. This is **expected behavior** if sync-store didn't find products in stage outputs.

---

## 5. Mismatch Matrix

| Field / Meaning | Frontend Expects | `/api/stores/:id/draft` Returns | `/api/public/store/:id/draft` Returns | Risk |
|---|---|---|---|---|
| `ok` | `boolean` (true = success) | `true` (stores.js:498) | `true` (publicUsers.js:105) | ✅ MATCH |
| `draft` | `{ meta: {...}, catalog: { products: [...], categories: [...] } }` | `{ meta: {...}, catalog: {...} }` (stores.js:499) | `{ meta: {...}, catalog: {...} }` (publicUsers.js:106) | ✅ MATCH |
| `draftFound` | `boolean` (optional, for backward compat) | `boolean` (stores.js:575) | `boolean` (publicUsers.js:182) | ✅ MATCH (optional) |
| `products` | `Array<Product>` (top-level, legacy) | `Array<Product>` (stores.js:573) | `Array<Product>` (publicUsers.js:180) | ✅ MATCH (backward compat) |
| `catalog.products` | `Array<Product>` (preferred) | `Array<Product>` (stores.js:511) | `Array<Product>` (publicUsers.js:118) | ✅ MATCH |
| `meta.storeId` | `string` (required) | `store.id` (stores.js:501) | `store.id` (publicUsers.js:108) | ✅ MATCH |
| `store.id` | `string` (required) | `store.id` (stores.js:563) | `store.id` (publicUsers.js:170) | ✅ MATCH |
| `categories` | `Array<Category>` (top-level, legacy) | `Array<{ name }>` (stores.js:574) | `Array<{ name }>` (publicUsers.js:181) | ✅ MATCH (backward compat) |
| `catalog.categories` | `Array<Category>` (preferred) | `Array<{ id, name }>` (stores.js:556) | `Array<{ id, name }>` (publicUsers.js:163) | ✅ MATCH |
| `primaryImageUrl` | `string \| null` (computed) | Computed: `imageUrl ?? images[0] ?? cutoutPath ?? null` (stores.js:534) | Computed: `imageUrl ?? images[0] ?? cutoutPath ?? null` (publicUsers.js:141) | ✅ MATCH |
| `categoryId` | `null` (Product model has no categoryId) | `null` (stores.js:544) | `null` (publicUsers.js:151) | ✅ MATCH (explicitly set to null) |
| `media` | N/A (Product model has no media relation) | Not included (stores.js:443 comment) | Not included (publicUsers.js:63 comment) | ✅ MATCH (not queried) |
| `normalizedName` | N/A (frontend doesn't use) | Included in select (stores.js:426) | Included in select (publicUsers.js:46) | ✅ MATCH (backend only) |

### **Response Shape Comparison:**

**Both endpoints return identical structure:**
```json
{
  "ok": true,
  "draft": {
    "meta": {
      "storeId": "...",
      "storeName": "...",
      "storeType": "...",
      "tenantId": "...",
      "createdAt": "...",
      "profileAvatarUrl": "...",
      "profileHeroUrl": "...",
      "profileHeroVideoUrl": "..."
    },
    "catalog": {
      "products": [
        {
          "id": "...",
          "name": "...",
          "description": "...",
          "price": 0,
          "currency": "USD",
          "category": "...",
          "categoryId": null,
          "imageUrl": "...",
          "primaryImageUrl": "...",
          "images": [...],
          "isPublished": true,
          "sku": "...",
          "viewCount": 0,
          "likeCount": 0,
          "createdAt": "...",
          "updatedAt": "..."
        }
      ],
      "categories": [
        {
          "id": "cat-0",
          "name": "..."
        }
      ]
    }
  },
  "store": { ... },
  "products": [ ... ],
  "categories": [ ... ],
  "draftFound": true/false,
  "productsCount": 0,
  "categoriesCount": 0
}
```

**Conclusion:** ✅ **NO MISMATCH** - Both endpoints return identical shapes. Frontend normalization handles both formats correctly.

---

## 6. Next Verification Commands

### **PowerShell Commands (Windows)**

```powershell
# Test public endpoint
$storeId = "cmk4yxv..."  # Replace with actual storeId
$response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3001/api/public/store/$storeId/draft"
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Test authenticated endpoint (with dev-admin-token)
$headers = @{ Authorization = "Bearer dev-admin-token" }
$response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3001/api/stores/$storeId/draft" -Headers $headers
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Check response status
$response.StatusCode  # Should be 200
$response.StatusDescription  # Should be "OK"
```

### **Database Schema Checks (SQLite)**

```bash
cd apps/core/cardbey-core

# List all tables
sqlite3 prisma/dev.db ".tables"

# Check Product table columns
sqlite3 prisma/dev.db "PRAGMA table_info(Product);"

# Verify normalizedName column exists
sqlite3 prisma/dev.db "SELECT normalizedName FROM Product LIMIT 1;"

# Check if products exist for a store
sqlite3 prisma/dev.db "SELECT id, name, normalizedName, imageUrl FROM Product WHERE businessId = 'cmk4yxv...' AND deletedAt IS NULL LIMIT 5;"

# Check MiArtifact for job outputs
sqlite3 prisma/dev.db "SELECT artifactType, data FROM MiArtifact WHERE orchestratorTaskId = 'cmk4yxv...' LIMIT 5;"

# Check ActivityEvent for fallback
sqlite3 prisma/dev.db "SELECT type, payload FROM ActivityEvent WHERE storeId = 'cmk4yxv...' AND type LIKE '%orchestra%' ORDER BY occurredAt DESC LIMIT 5;"
```

### **Grep Searches (Find Schema Drift)**

```bash
# Search for categoryId references (should be null or commented)
cd apps/core/cardbey-core
grep -r "categoryId" src/routes/ --include="*.js" | grep -v "categoryId: null" | grep -v "//"

# Search for media relation (should not exist)
grep -r "media:" src/routes/ --include="*.js" | grep -v "//"

# Search for normalizedName (should exist in selects)
grep -r "normalizedName" src/routes/ --include="*.js"
```

### **Frontend Debug Logging**

```javascript
// In browser console (with cardbey.debug=true)
localStorage.setItem('cardbey.debug', 'true');
// Reload page, check console for:
// - "[StoreReviewPage] Loading data for storeId: ..."
// - "[StoreReviewPage] Authenticated draft endpoint response: ..."
// - "[StoreReviewPage] Request obsoleted: ..."
// - "[StoreReviewPage] Setting draft state: ..."
// - "[StoreReviewPage] 🔴 'Failed to load store' - DEBUG INFO: ..."

// Check network tab:
// Filter: "draft"
// Verify:
// 1. Order of requests
// 2. Response status codes (200 or 403 → 200)
// 3. Response bodies (should include `draft` object)
```

### **Backend Logging**

```bash
# Check backend logs for:
# - "[Stores] GET /:id/draft" (stores.js)
# - "[PublicUsers] Get store draft" (publicUsers.js)
# - "[MI Orchestra] Synced store ... productsWritten: 0" (miRoutes.js:1038)
# - "[MI Orchestra] No products found in stage outputs" (miRoutes.js:1024)
```

---

## Summary

### **Primary Root Causes:**

1. **Request Obsoletion** - Multiple `reqId` checks cause valid responses to be discarded
2. **Guard Logic** - Prevents `setDraft()` when products are empty and `hasLoadedRef.current = true`
3. **productsWritten=0** - Stage outputs not found in `MiArtifact`, `task.outputs`, or `ActivityEvent`

### **No Schema Drift Found:**
- ✅ `categoryId` is explicitly set to `null` (not queried)
- ✅ `media` relation is not queried (commented out)
- ✅ `normalizedName` is included in selects (exists in schema)

### **No Response Shape Mismatch:**
- ✅ Both endpoints return identical shapes
- ✅ Frontend normalization handles both formats correctly

### **Recommended Next Steps:**
1. Fix guard logic to handle `draft = null` case
2. Ensure `setDraft()` is called even if products are empty (on first load)
3. Add logging to track request obsoletion
4. Investigate why stage outputs are not persisted to `MiArtifact` table










