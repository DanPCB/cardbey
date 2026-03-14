# Auth/Session Fix Summary

## Problem
Content Studio navigation was broken due to inconsistent auth/session handling:
- POST /api/mi/promo/from-draft worked (200 OK) via Vite proxy
- GET /api/store/:storeId/context failed with 401
- GET /api/auth/me returned 401

**Root Cause:** Mixing two networking paths:
- Vite proxy same-origin calls (localhost:5174/api/...) that can carry cookies
- Direct cross-origin calls to core (localhost:3001/api/...) from api-client

Additionally, `api.ts` was setting `credentials: 'omit'` for store context endpoints, preventing cookies from being sent.

## Solution

### 1. Fixed `api.ts` to Always Use `credentials: 'include'`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Changes:**
- Removed problematic logic that set `credentials: 'omit'` for store context endpoints (line 421-422)
- Now always uses `credentials: 'include'` by default
- Added explicit 401 error handling with debug logging
- Enhanced `apiFetch` to always use `credentials: 'include'`

**Before:**
```typescript
const isPreviewEndpoint = path.includes('/preview') || path.includes('/store/') && path.includes('/context');
const defaultCredentials = isPreviewEndpoint ? 'omit' : 'include';
```

**After:**
```typescript
// CRITICAL: Always use 'include' for credentials to ensure cookies/session work
const defaultCredentials: RequestCredentials = 'include';
```

### 2. Enhanced 401 Error Handling
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Changes:**
- Added explicit 401 handling before `throwIfNotOk`
- Debug logging (gated by `localStorage.getItem('cardbey.debug')`)
- Clear error messages for auth failures
- Special handling for public context (suppresses toasts)

### 3. Updated `useStoreContext` Error Handling
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/useStoreContext.ts`

**Changes:**
- Added explicit 401 error handling
- Shows clear error message: "Authentication required. Please sign in to access store context."
- Uses `apiGET` which goes through api-client with credentials

### 4. Fixed `api-client` to Support Relative URLs in Browser
**File:** `packages/api-client/src/index.ts`

**Changes:**
- Updated `getCoreBaseUrl()` to return empty string in browser mode (instead of throwing)
- Updated `buildUrl()` to use relative paths when base is empty
- This ensures all requests go through Vite proxy (same-origin, cookies work)

**Before:**
```typescript
// Threw error if no base URL configured
throw new Error('CORE base URL missing...');
```

**After:**
```typescript
// In browser dev mode, use relative paths (will go through Vite proxy)
if (typeof window !== 'undefined') {
  return ''; // Empty string = relative URLs = Vite proxy
}
```

### 5. Added Debug Logging
**Files:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Changes:**
- Debug logging (gated by `localStorage.getItem('cardbey.debug') === 'true'`)
- Logs: method, path, url, credentials, hasAuthHeader
- Helps diagnose auth issues in development

## Base URL Strategy

**Chosen:** Option (b) - Use Vite proxy origin (localhost:5174) in browser

**Why:**
- Cookies work automatically (same-origin requests)
- No CORS configuration needed
- Simpler for development
- All requests go through same proxy

**Implementation:**
- In browser mode: `getCoreBaseUrl()` returns empty string
- `buildUrl()` returns relative paths (e.g., `/api/store/:id/context`)
- Vite proxy forwards `/api/*` → `http://localhost:3001/api/*`
- Cookies are sent automatically (same-origin)

## Files Changed

1. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`**
   - Removed `credentials: 'omit'` logic for store context
   - Added explicit 401 error handling
   - Enhanced debug logging

2. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/useStoreContext.ts`**
   - Added explicit 401 error handling
   - Clear error messages

3. **`packages/api-client/src/index.ts`**
   - Updated to support relative URLs in browser mode
   - Already uses `credentials: 'include'` (no change needed)

## Acceptance Tests

### ✅ Test 1: Auth Endpoint
1. Open dashboard
2. Check Network tab
3. **Expected:** GET /api/auth/me returns 200 (not 401)
4. **Expected:** Request URL is `http://localhost:5174/api/auth/me` (not 3001)
5. **Expected:** Request includes `credentials: include`

### ✅ Test 2: Store Context
1. Trigger "Create Smart Promotion" from an item
2. Check Network tab
3. **Expected:** GET /api/store/:id/context returns 200 (not 401)
4. **Expected:** Request URL is `http://localhost:5174/api/store/.../context` (not 3001)
5. **Expected:** Request includes `credentials: include`

### ✅ Test 3: Content Studio Navigation
1. Click "Create Smart Promotion" on a product
2. **Expected:** No 401 errors in console
3. **Expected:** Content Studio loads successfully
4. **Expected:** Instance ID is retained

## Debug Mode

Enable debug logging:
```javascript
localStorage.setItem('cardbey.debug', 'true');
```

This will log:
- Request details (method, path, url, credentials)
- 401 errors with full context
- Auth header presence

## Key Takeaways

1. **Always use `credentials: 'include'`** for auth/store endpoints
2. **Use relative URLs in browser** (goes through Vite proxy)
3. **Handle 401 explicitly** with clear error messages
4. **No silent fallbacks** - show explicit errors when auth fails

## Next Steps (Optional)

1. **Backend CORS:** If we ever need direct 3001 calls, ensure CORS allows credentials
2. **Cookie SameSite:** Ensure backend sets `SameSite=Lax` for localhost
3. **Session Management:** Consider adding session refresh logic



















