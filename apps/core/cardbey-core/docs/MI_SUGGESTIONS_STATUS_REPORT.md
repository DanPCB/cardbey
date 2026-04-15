# MI Suggestions - Status Report

**Date:** 2025-01-XX  
**Status:** 🟡 Mostly Complete - Needs Finalization

## Executive Summary

MI Suggestions functionality is **~90% complete** with solid backend implementation and tests. The main remaining work is:
1. **Auth/Tenant/Store handling consistency** - Route uses different pattern than other routes
2. **Frontend verification** - Cannot verify frontend code (in separate dashboard repo)
3. **Code cleanup** - Minor improvements needed

---

## ✅ What's Complete

### Backend Implementation

#### 1. MI Orchestrator Service (`src/services/miOrchestratorService.ts`)
- ✅ **All 5 heuristics implemented:**
  1. Attractor duration check (< 5s → recommendation)
  2. Missing role warning
  3. Missing MIEntity info
  4. Single-item playlist info
  5. Long playlist (> 20 items) info
- ✅ **Proper error handling** with graceful fallbacks
- ✅ **Tenant/store filtering** in playlist queries for security
- ✅ **Type-safe TypeScript** implementation
- ✅ **Well-documented** with clear interfaces

#### 2. API Route (`src/routes/miRoutes.js`)
- ✅ **Endpoint:** `GET /api/mi/orchestrator/signage-playlists/:playlistId/suggestions`
- ✅ **Authentication:** Uses `requireAuth` middleware
- ✅ **Query params:** Supports `tenantId` and `storeId`
- ✅ **Error handling:** Proper 400/500 responses
- ✅ **Mounted in server:** `/api/mi` route group

#### 3. Tests (`src/services/miOrchestratorService.test.ts`)
- ✅ **4 test cases:**
  1. Attractor duration heuristic
  2. Single-item playlist heuristic
  3. No issues detected fallback
  4. Playlist not found handling
- ✅ **Proper cleanup** in beforeEach/afterEach
- ✅ **Uses Vitest** testing framework

---

## ⚠️ Issues Found

### 1. Auth/Tenant/Store Handling Inconsistency

**Issue:** `miRoutes.js` uses a custom tenant/store extraction pattern instead of the standardized `requireTenantStoreContext` helper used in `signageRoutes.js`.

**Current Code (miRoutes.js):**
```javascript
let tenantId = req.query.tenantId;
let storeId = req.query.storeId;

// Fall back to auth context
if (!tenantId && req.userId) {
  tenantId = req.userId;
}
if (!storeId && req.user?.business?.id) {
  storeId = req.user.business.id;
}

// Dev mode fallback
const isDev = process.env.NODE_ENV !== 'production';
if (isDev) {
  tenantId = tenantId || process.env.DEV_TENANT_ID || req.userId || 'temp';
  storeId = storeId || process.env.DEV_STORE_ID || req.user?.business?.id || null;
}
```

**Problem:**
- Inconsistent with other routes (signageRoutes.js uses `requireTenantStoreContext()`)
- Duplicates logic that exists elsewhere
- Less maintainable - changes need to be made in multiple places

**Recommended Fix:**
- Import and use `requireTenantStoreContext` from `signageRoutes.js` (or extract to shared utility)
- Ensures consistent behavior across all routes
- Single source of truth for tenant/store extraction

**Priority:** 🔴 High (affects consistency and maintainability)

---

### 2. Frontend Code Verification

**Status:** ⚠️ Cannot verify (frontend in separate dashboard repo)

**According to Documentation:**
- ✅ Frontend implemented in `PlaylistEditorPage.jsx`
- ✅ API client function exists in `lib/api.ts`
- ✅ UI features: button, loading state, suggestions panel, color coding
- ✅ Click-to-focus functionality

**Cannot Verify:**
- ❓ TypeScript usage in `.jsx` files (docs mention fixes were made)
- ❓ Dead code removal
- ❓ UX polish (rough edges)

**Action Required:**
- Review frontend code in dashboard repo
- Check for TypeScript annotations in `.jsx` files
- Verify no dead code
- Test UX flow end-to-end

**Priority:** 🟡 Medium (needs manual verification)

---

### 3. Missing Test Coverage

**Current Tests Cover:**
- ✅ Attractor duration rule
- ✅ Single-item playlist rule
- ✅ No issues detected fallback
- ✅ Playlist not found handling

**Missing Tests:**
- ❌ Missing role warning heuristic
- ❌ Missing MIEntity info heuristic
- ❌ Long playlist (> 20 items) heuristic
- ❌ Error handling in service (try/catch scenarios)
- ❌ Route-level error handling

**Priority:** 🟡 Medium (core functionality tested, edge cases missing)

---

### 4. Code Quality Issues

**Minor Issues:**
1. **Comment in service:** Line 48-49 has empty comment about SignageAsset join
   ```typescript
   include: {
     // For Signage playlists, items link to SignageAsset via assetId
     // We need to manually join or fetch assets separately
   },
   ```
   - This is incomplete - should either implement or remove comment

2. **Error message consistency:** Some errors return arrays, some return single objects
   - Service returns array of suggestions (good)
   - Route returns `{ ok, suggestions }` (good)
   - But error cases could be more consistent

**Priority:** 🟢 Low (cosmetic, doesn't affect functionality)

---

## 📋 Recommended Actions

### High Priority

1. **Fix Auth/Tenant/Store Handling**
   - Extract `requireTenantStoreContext` to shared utility OR
   - Import from `signageRoutes.js` and use in `miRoutes.js`
   - Ensures consistency across all routes

### Medium Priority

2. **Add Missing Tests**
   - Test missing role warning heuristic
   - Test missing MIEntity info heuristic
   - Test long playlist heuristic
   - Test error scenarios

3. **Frontend Verification**
   - Review `PlaylistEditorPage.jsx` in dashboard repo
   - Check for TypeScript in `.jsx` files
   - Verify no dead code
   - Test UX flow

### Low Priority

4. **Code Cleanup**
   - Remove or implement incomplete comment about SignageAsset join
   - Standardize error message format
   - Add JSDoc comments where missing

---

## 📊 Completion Status

| Component | Status | Notes |
|-----------|--------|-------|
| Backend Service | ✅ Complete | All heuristics implemented, well-tested |
| API Route | 🟡 Needs Fix | Auth handling inconsistent |
| Tests | 🟡 Partial | Core tests exist, edge cases missing |
| Frontend | ❓ Unknown | Cannot verify (separate repo) |
| Documentation | ✅ Complete | Comprehensive docs exist |

**Overall:** 🟡 **~90% Complete**

---

## 🔍 Code Review Checklist

### Backend
- [x] Service implements all required heuristics
- [x] Service has proper error handling
- [x] Route has authentication
- [ ] Route uses consistent tenant/store extraction
- [x] Route has proper error responses
- [x] Tests exist for core functionality
- [ ] Tests cover all heuristics
- [x] Code is type-safe (TypeScript)

### Frontend (Needs Verification)
- [ ] No TypeScript in `.jsx` files
- [ ] No dead code
- [ ] UX is polished (no rough edges)
- [ ] Error handling works
- [ ] Loading states work
- [ ] Click-to-focus works

### Security
- [x] Tenant/store filtering in queries
- [x] Authentication required
- [ ] Tenant/store extraction is secure (needs consistency fix)

---

## 🎯 Next Steps

1. **Immediate:** Fix auth/tenant/store handling in `miRoutes.js`
2. **Short-term:** Add missing test cases
3. **Short-term:** Verify frontend implementation
4. **Long-term:** Code cleanup and polish

---

## 📝 Notes

- Backend implementation is solid and production-ready
- Main concern is consistency with other routes
- Frontend verification requires access to dashboard repo
- Tests are good but could be more comprehensive
- Overall architecture is sound

