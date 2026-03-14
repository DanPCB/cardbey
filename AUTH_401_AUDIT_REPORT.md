# Authentication 401 Error - Comprehensive Code Audit Report

## Executive Summary

The codebase has **multiple authentication paths** that are causing 401 errors. The primary issues are:

1. **Mixed URL resolution strategies** - Some code uses Vite proxy (relative URLs), others use direct `localhost:3001` (absolute URLs)
2. **Multiple API clients** - `@cardbey/api-client` and `api.ts` have different URL resolution logic
3. **SSE client uses absolute URLs** - Bypasses Vite proxy, causing CORS issues
4. **Token storage/retrieval inconsistencies** - Multiple token storage keys and retrieval methods
5. **JWT verification failures** - Tokens may be signed with different secrets than backend expects

## Critical Issues Found

### Issue #1: Multiple API Client Implementations

**Location:**
- `packages/api-client/src/index.ts` - Shared API client
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` - Dashboard-specific API client
- `apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts` - User service

**Problem:**
- `api-client` uses `getCoreBaseUrl()` which returns `http://localhost:3001` when `cardbey.dev.coreUrl` is set
- `api.ts` uses `resolveUrl()` which returns relative URLs in browser mode
- `user.ts` uses `getCoreBaseUrl()` from `coreUrl.ts` which may return absolute URLs

**Evidence:**
```typescript
// packages/api-client/src/index.ts:24-74
function getCoreBaseUrl(): string {
  // Returns http://localhost:3001 if cardbey.dev.coreUrl is set
  // OR returns '' (empty) for Vite proxy
  // BUT: If localStorage has cardbey.dev.coreUrl, it returns absolute URL
}

// apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts:14-61
function resolveUrl(path: string): string {
  // In browser, ALWAYS returns relative URL
  // BUT: This conflicts with api-client behavior
}
```

**Impact:**
- Requests from `api-client` go to `http://localhost:3001/api/auth/me` (CORS, no cookies)
- Requests from `api.ts` go to `/api/auth/me` (Vite proxy, cookies work)
- Mixed behavior causes inconsistent auth

---

### Issue #2: SSE Client Uses Absolute URLs

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts`

**Problem:**
- SSE client checks for `cardbey.dev.coreUrl` in localStorage
- If set, uses absolute URL `http://localhost:3001/api/stream`
- This bypasses Vite proxy and causes CORS issues

**Evidence:**
```typescript
// sseClient.ts:63-135
function getUrl(): string {
  // If STREAM_URL is not set, checks getCoreApiBaseUrl()
  // If localStorage has cardbey.dev.coreUrl, returns absolute URL
  // This causes CORS warnings in console
}
```

**Impact:**
- SSE connections fail or cause CORS warnings
- Console shows: "Using absolute URL (http://localhost:3001) but vite proxy is available"

---

### Issue #3: User Service Uses Absolute URLs

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts:47`

**Problem:**
- `getCurrentUser()` constructs absolute URL: `${coreUrl}/api/auth/me`
- Uses `getCoreBaseUrl()` which may return `http://localhost:3001`
- Bypasses Vite proxy

**Evidence:**
```typescript
// user.ts:38-47
const coreUrl = getCoreBaseUrl() || localStorage.getItem('cardbey.dev.coreUrl') || 'not configured';
const endpoint = `${coreUrl}/api/auth/me`; // ❌ Absolute URL
```

**Impact:**
- `/api/auth/me` requests go directly to `localhost:3001` (CORS, no cookies)
- Returns 401 even with valid token

---

### Issue #4: JWT Secret Mismatch

**Location:** `apps/core/cardbey-core/src/middleware/auth.js`

**Problem:**
- Backend uses `JWT_SECRET` from env or default `'default-secret-change-this'`
- Frontend may have tokens signed with different secret
- No validation that secrets match

**Evidence:**
```javascript
// auth.js:9
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';
```

**Impact:**
- Tokens signed with one secret fail verification with another
- Returns 401 with `invalid_signature` reason

---

### Issue #5: Token Storage Inconsistencies

**Location:** Multiple files

**Problem:**
- Tokens stored in multiple keys: `bearer`, `adminToken`, `storeToken`, `agentToken`
- Environment-scoped keys: `cardbey_DEV_bearer`, `cardbey_DEV_adminToken`
- Legacy keys: `BEARER`, `ADMIN_TOKEN`
- Token retrieval checks multiple sources, may get wrong token

**Evidence:**
```typescript
// storage.ts - Multiple storage keys
storageKeys = {
  bearer: 'cardbey_DEV_bearer',
  adminToken: 'cardbey_DEV_adminToken',
  // ...
}

// api.ts:87-113
function buildAuthHeader() {
  const token = t.bearer || t.adminToken || t.storeToken || t.agentToken || '';
  // May return wrong token or empty string
}
```

**Impact:**
- Wrong token sent in Authorization header
- Token may be from different environment
- Token may be expired or invalid

---

### Issue #6: Credentials Not Always Included

**Location:** Multiple files

**Problem:**
- Some fetch calls may not include `credentials: 'include'`
- Direct `fetch()` calls bypass `apiFetch` wrapper
- SSE EventSource doesn't support credentials

**Evidence:**
```typescript
// Some places may use:
fetch(url, { ... }) // Missing credentials

// Should be:
fetch(url, { credentials: 'include', ... })
```

**Impact:**
- Cookies not sent with requests
- Session-based auth fails
- Returns 401 even with valid session

---

### Issue #7: Multiple getCurrentUser Implementations

**Location:**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts:751` - `getCurrentUser()`
- `apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts:20` - `getCurrentUser()`
- `packages/api-client/src/index.ts:468` - `getCurrentUser()`

**Problem:**
- Three different implementations
- Each uses different URL resolution
- Each may send different tokens

**Impact:**
- Inconsistent behavior
- Some calls work, others fail
- Hard to debug which implementation is being used

---

## Detailed Findings

### Finding 1: api-client URL Resolution

**File:** `packages/api-client/src/index.ts`

**Current Behavior:**
```typescript
function getCoreBaseUrl(): string {
  // 1. Check localStorage.cardbey.dev.coreUrl
  // 2. Check window.__APP_API_BASE__
  // 3. Check VITE_CORE_BASE_URL
  // 4. In browser dev mode, return '' (Vite proxy)
  // BUT: If localStorage has cardbey.dev.coreUrl, returns absolute URL
}
```

**Issue:**
- If `cardbey.dev.coreUrl` is set to `http://localhost:3001`, returns absolute URL
- This bypasses Vite proxy
- Causes CORS issues and cookie problems

**Fix Suggestion:**
- In dev mode (port 5174), ALWAYS return '' (empty string) regardless of localStorage
- Only use localStorage value in production or non-Vite environments

---

### Finding 2: api.ts resolveUrl Logic

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Current Behavior:**
```typescript
function resolveUrl(path: string): string {
  // In browser, ALWAYS returns relative URL
  // This is correct for Vite proxy
}
```

**Status:** ✅ **CORRECT** - This is the right approach

**Issue:**
- But `api-client` may still use absolute URLs
- Mixed usage causes inconsistency

---

### Finding 3: User Service Absolute URL Construction

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts:47`

**Current Behavior:**
```typescript
const coreUrl = getCoreBaseUrl() || localStorage.getItem('cardbey.dev.coreUrl') || 'not configured';
const endpoint = `${coreUrl}/api/auth/me`; // ❌ Absolute URL
```

**Issue:**
- Constructs absolute URL even in dev mode
- Should use relative URL or `apiGET()` from `api.ts`

**Fix Suggestion:**
- Use `apiGET('/auth/me')` from `api.ts` instead of constructing URL manually
- Or use `@cardbey/api-client` with proper URL resolution

---

### Finding 4: SSE Client Absolute URL Warning

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts:257`

**Current Behavior:**
- Checks `getCoreApiBaseUrl()` which may return `http://localhost:3001`
- Uses absolute URL for EventSource
- Logs warning about CORS

**Issue:**
- Should use relative URL in dev mode (Vite proxy)
- EventSource can use relative URLs if page origin matches

**Fix Suggestion:**
- In dev mode (port 5174), always use relative `/api/stream`
- Only use absolute URLs in production or non-Vite environments

---

### Finding 5: JWT Verification Debugging

**File:** `apps/core/cardbey-core/src/middleware/auth.js`

**Current Behavior:**
- Added debug logging (good)
- But JWT_SECRET may not match token signer

**Issue:**
- Need to verify JWT_SECRET matches between frontend and backend
- Need to check if tokens are being signed with correct secret

**Fix Suggestion:**
- Add startup validation: log JWT_SECRET source and length
- Add token inspection: decode token header to see alg/kid
- Add error mapping: return specific error codes (invalid_signature, expired, etc.)

---

### Finding 6: Token Retrieval Logic

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts:87-113`

**Current Behavior:**
```typescript
function buildAuthHeader() {
  const token = t.bearer || t.adminToken || t.storeToken || t.agentToken || '';
  const finalToken = token || (isDev ? 'dev-admin-token' : '');
}
```

**Issue:**
- Falls back to `dev-admin-token` in dev mode
- This may not match backend's expected token format
- Multiple token sources may cause confusion

**Fix Suggestion:**
- Log which token source is being used
- Validate token format before sending
- Don't fallback to `dev-admin-token` if real token exists but is invalid

---

## Root Cause Analysis

### Primary Root Cause: Mixed URL Resolution

The codebase has **two competing URL resolution strategies**:

1. **Strategy A (api-client):** Use absolute URLs from `cardbey.dev.coreUrl` if set
2. **Strategy B (api.ts):** Always use relative URLs in browser (Vite proxy)

**Result:**
- Some requests go to `http://localhost:3001/api/auth/me` (CORS, no cookies) → 401
- Other requests go to `/api/auth/me` (Vite proxy, cookies) → May work if token valid

### Secondary Root Cause: JWT Secret Mismatch

If tokens are being signed with one secret but verified with another:
- Token appears valid (has Bearer prefix)
- But verification fails with `invalid_signature`
- Returns 401 even though token is present

### Tertiary Root Cause: Cookie vs Token Auth

The backend supports both:
- Cookie-based auth (`req.cookies.token`)
- Token-based auth (`Authorization: Bearer <token>`)

But:
- Login sets cookies, but frontend may not be sending them
- Frontend sends tokens, but tokens may be invalid
- Mixed usage causes confusion

---

## Fix Recommendations (Priority Order)

### Priority 1: Unify URL Resolution Strategy

**Goal:** All browser requests must use Vite proxy (relative URLs) in dev mode

**Changes Needed:**

1. **Fix `api-client` getCoreBaseUrl():**
   ```typescript
   // In dev mode (port 5174), ALWAYS return '' (empty string)
   // Ignore localStorage.cardbey.dev.coreUrl for URL resolution
   // Only use it for display/debugging purposes
   ```

2. **Fix `user.ts` getCurrentUser():**
   ```typescript
   // Use apiGET('/auth/me') from api.ts instead of constructing URL
   // OR use @cardbey/api-client with proper URL resolution
   ```

3. **Fix SSE client:**
   ```typescript
   // In dev mode (port 5174), ALWAYS use relative '/api/stream'
   // Ignore getCoreApiBaseUrl() for URL construction
   ```

### Priority 2: Fix JWT Secret Validation

**Goal:** Ensure tokens are signed and verified with the same secret

**Changes Needed:**

1. **Backend startup validation:**
   - Log JWT_SECRET source (env vs default)
   - Log JWT_SECRET length
   - Warn if using default secret

2. **Token inspection:**
   - Decode token header to see alg/kid
   - Log token payload (userId, exp) without logging full token
   - Map JWT errors to specific reason codes

3. **Frontend token validation:**
   - Check token format before sending
   - Log which token source is being used
   - Don't send invalid tokens

### Priority 3: Unify Token Storage

**Goal:** Single source of truth for token storage/retrieval

**Changes Needed:**

1. **Standardize storage keys:**
   - Use environment-scoped keys consistently
   - Remove legacy key support
   - Document which key to use when

2. **Unify token retrieval:**
   - Single function to get current token
   - Priority: bearer > adminToken > storeToken > agentToken
   - Log which token is being used

### Priority 4: Ensure Credentials Always Included

**Goal:** All API requests must include `credentials: 'include'`

**Changes Needed:**

1. **Audit all fetch calls:**
   - Find direct `fetch()` calls
   - Ensure they include `credentials: 'include'`
   - Replace with `apiFetch()` wrapper where possible

2. **SSE credentials:**
   - EventSource doesn't support credentials
   - Use relative URLs (Vite proxy) to avoid CORS
   - Or use fetch with credentials for SSE

### Priority 5: Consolidate getCurrentUser Implementations

**Goal:** Single implementation for getting current user

**Changes Needed:**

1. **Choose one implementation:**
   - Prefer `api.ts` version (uses Vite proxy)
   - Or fix `api-client` version to use Vite proxy
   - Remove duplicate implementations

2. **Update all call sites:**
   - Replace `user.ts` getCurrentUser with `api.ts` version
   - Or vice versa
   - Ensure consistent behavior

---

## Files Requiring Changes

### High Priority (Causing 401s)

1. **`packages/api-client/src/index.ts`**
   - Fix `getCoreBaseUrl()` to return '' in dev mode (Vite proxy)
   - Ignore `localStorage.cardbey.dev.coreUrl` for URL resolution

2. **`apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts`**
   - Replace absolute URL construction with `apiGET('/auth/me')`
   - Or use `@cardbey/api-client` with proper URL resolution

3. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts`**
   - Fix `getUrl()` to return relative URL in dev mode
   - Ignore `getCoreApiBaseUrl()` for URL construction in dev

### Medium Priority (Improving Reliability)

4. **`apps/core/cardbey-core/src/middleware/auth.js`**
   - Already has debug logging (good)
   - Add JWT_SECRET validation on startup
   - Add token inspection before verification

5. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`**
   - Already uses relative URLs (good)
   - Ensure `buildAuthHeader()` logs which token is used
   - Add token format validation

### Low Priority (Code Quality)

6. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/storage.ts`**
   - Document which storage keys to use
   - Remove legacy key support
   - Add migration path

7. **`apps/dashboard/cardbey-marketing-dashboard/src/hooks/useAuth.ts`**
   - Ensure it uses unified `getCurrentUser()`
   - Add error handling for 401s

---

## Testing Strategy

### Test 1: Verify URL Resolution
```javascript
// In browser console (localhost:5174)
localStorage.setItem('cardbey.debug', 'true');
// Check logs for:
// - [api-client] getApiBaseUrl() returned: '' (should be empty in dev)
// - [resolveUrl] Browser mode, using relative URL: /api/auth/me
```

### Test 2: Verify Token Sending
```javascript
// Check Network tab:
// - Request URL: http://localhost:5174/api/auth/me (not localhost:3001)
// - Request Headers: Authorization: Bearer <token>
// - Request Headers: credentials: include
```

### Test 3: Verify JWT Verification
```javascript
// Check backend logs for:
// [Auth] JWT verification successful (should see this)
// OR
// [Auth] JWT verification failed { reason: 'invalid_signature' }
```

### Test 4: Verify Cookies
```javascript
// Check Application > Cookies:
// - Domain: localhost
// - Path: /
// - Name: token
// - HttpOnly: true
```

---

## Expected Outcomes After Fix

1. ✅ All requests go through Vite proxy (`/api/*` → `localhost:3001`)
2. ✅ No CORS errors in console
3. ✅ Cookies are sent with all requests
4. ✅ `/api/auth/me` returns 200 (not 401)
5. ✅ `/api/store/:id/context` returns 200 (not 401)
6. ✅ JWT verification succeeds with valid tokens
7. ✅ Clear error messages for invalid tokens

---

## Risk Assessment

### Low Risk Changes
- Fixing `api-client` URL resolution (dev mode only)
- Fixing SSE client URL resolution (dev mode only)
- Adding debug logging

### Medium Risk Changes
- Changing `user.ts` to use `api.ts` (may break if `api.ts` has bugs)
- Consolidating `getCurrentUser()` implementations (may break call sites)

### High Risk Changes
- Changing token storage keys (may lose user sessions)
- Changing JWT_SECRET validation (may break existing tokens)

---

## Implementation Order

1. **Phase 1: URL Resolution (Low Risk)**
   - Fix `api-client` getCoreBaseUrl()
   - Fix SSE client getUrl()
   - Test: Verify all requests use Vite proxy

2. **Phase 2: User Service (Medium Risk)**
   - Update `user.ts` to use `apiGET()`
   - Test: Verify `/api/auth/me` works

3. **Phase 3: JWT Debugging (Low Risk)**
   - Add token inspection logging
   - Add JWT_SECRET validation
   - Test: Verify token verification works

4. **Phase 4: Token Storage (High Risk)**
   - Standardize storage keys
   - Add migration path
   - Test: Verify tokens persist correctly

---

## Questions to Answer Before Implementation

1. **Should we remove `cardbey.dev.coreUrl` from localStorage?**
   - Currently used for URL resolution
   - But should only be used for display/debugging

2. **Should we use cookies or tokens for auth?**
   - Backend supports both
   - Need to choose one primary method

3. **What is the correct JWT_SECRET?**
   - Check `.env` file
   - Check if tokens are signed with correct secret
   - Verify backend and frontend use same secret

4. **Should we consolidate `getCurrentUser()` implementations?**
   - Which one should be the canonical version?
   - How to migrate call sites?

---

## Next Steps

1. **Review this audit report**
2. **Answer questions above**
3. **Prioritize fixes based on impact**
4. **Implement fixes in phases**
5. **Test each phase before moving to next**



















