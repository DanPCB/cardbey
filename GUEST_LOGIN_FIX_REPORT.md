# Guest Login Fix Report - 2026-01-15

**Date:** 2026-01-15  
**Status:** ✅ **COMPLETE**

---

## Problem

After rollback to 2026-01-07 state, guest login on localhost was broken:
- Visiting `/features` as a fresh browser session did not auto-create a guest session
- UI showed unauthenticated state (forced to Login/Sign Up)
- API calls after guest creation failed due to missing token

---

## Root Cause

1. **Missing Backend Endpoint:** Frontend called `/api/auth/guest` but backend did not have this endpoint
2. **Token Storage Mismatch:** `setAuthToken()` stored token in `authToken` key, but API client read from `bearer` key
3. **No Auto-Creation:** `/features` page did not auto-create guest session on mount

---

## Solution

### 1. Backend: Added `/api/auth/guest` Endpoint

**File:** `apps/core/cardbey-core/src/routes/auth.js`

**Changes:**
- Added `POST /api/auth/guest` endpoint that:
  - Creates a guest user with unique email (`guest-{timestamp}-{random}@cardbey.guest`)
  - Generates unique handle
  - Sets role to `["guest"]`
  - Generates JWT token using `generateToken(userId)`
  - Returns payload: `{ ok, token, user: { id, isGuest: true, ... }, userId, tenantId, isGuest: true }`

**Response Payload:**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cmk...",
    "email": "guest-1234567890-abc123@cardbey.guest",
    "displayName": "Guest User",
    "handle": "guest-1234567890",
    "roles": ["guest"],
    "isGuest": true,
    "stores": [],
    "hasStore": false
  },
  "userId": "cmk...",
  "tenantId": "cmk...",
  "isGuest": true
}
```

### 2. Frontend: Fixed Token Storage

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/storage.ts`

**Changes:**
- Updated `setAuthToken()` to store token in both `authToken` (legacy) and `bearer` (used by API client)
- Ensures API client can read token after guest creation

**Before:**
```typescript
export function setAuthToken(token: string): void {
  window.localStorage.setItem(storageKeys.authToken, token);
}
```

**After:**
```typescript
export function setAuthToken(token: string): void {
  window.localStorage.setItem(storageKeys.authToken, token);
  window.localStorage.setItem(storageKeys.bearer, token); // Also set bearer for API client
}
```

### 3. Frontend: Auto-Create Guest Session on `/features`

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`

**Changes:**
- Added `useEffect` hook that auto-creates guest session on mount if:
  - No user is authenticated (`!user?.id`)
  - No token exists in storage
- Stores token after creation
- Triggers user state refresh via storage events

**Code:**
```typescript
useEffect(() => {
  const ensureGuestSession = async () => {
    if (user?.id) return; // Skip if authenticated
    
    const tokens = getTokens();
    if (tokens.bearer || tokens.adminToken || tokens.storeToken || tokens.agentToken) {
      return; // Token exists
    }
    
    // Create guest session
    const guestResponse = await apiPOST('/api/auth/guest');
    if (guestResponse.ok && guestResponse.token) {
      setAuthToken(guestResponse.token);
      // Trigger refresh
      setTimeout(() => {
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('authchange'));
      }, 100);
    }
  };
  
  ensureGuestSession();
}, [user?.id]);
```

### 4. Frontend: Store Token After Guest Creation in `handleRetryAsGuest`

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`

**Changes:**
- Added token storage after guest creation in `handleRetryAsGuest` handler
- Ensures token is available for subsequent API calls

### 5. Backend: Include `isGuest` Flag in `/auth/me` Response

**File:** `apps/core/cardbey-core/src/routes/auth.js`

**Changes:**
- Updated `/auth/me` endpoint to include `isGuest: true` for users with `guest` role
- Allows frontend to identify guest users

---

## Files Changed

1. **`apps/core/cardbey-core/src/routes/auth.js`**
   - Added `POST /api/auth/guest` endpoint
   - Updated `/auth/me` to include `isGuest` flag

2. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/storage.ts`**
   - Updated `setAuthToken()` to store in both `authToken` and `bearer`

3. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`**
   - Added auto-creation of guest session on mount
   - Added token storage in `handleRetryAsGuest`

---

## Verification Checklist

### Test URLs:
- ✅ `/features` - Should auto-create guest session on fresh visit
- ✅ `/app/store/:id/review?mode=draft` - Should work with guest session
- ✅ Protected API calls - Should include Authorization header after guest creation

### Expected Behavior:

1. **Fresh Browser Session on `/features`:**
   - Page loads
   - Guest session auto-created in background
   - Token stored in localStorage (`bearer` key)
   - `useCurrentUser` hook detects token and fetches user
   - UI shows user as authenticated-guest (not forced to Login/Sign Up)

2. **API Calls After Guest Creation:**
   - All API calls include `Authorization: Bearer <token>` header
   - `/auth/me` returns user with `isGuest: true`
   - Subsequent protected endpoints work correctly

3. **No Regressions:**
   - Normal auth (login/signup) still works
   - Existing authenticated users unaffected
   - Guest users can create stores and use features

---

## Before/After Payload Examples

### Before (Missing Endpoint):
```
POST /api/auth/guest
→ 404 Not Found
```

### After (Working):
```
POST /api/auth/guest
→ 200 OK
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cmk123...",
    "email": "guest-1705123456-abc123@cardbey.guest",
    "displayName": "Guest User",
    "isGuest": true,
    "roles": ["guest"]
  },
  "userId": "cmk123...",
  "tenantId": "cmk123...",
  "isGuest": true
}
```

---

## Notes

- Guest users are created with role `["guest"]` and marked with `isGuest: true`
- Guest email format: `guest-{timestamp}-{random}@cardbey.guest`
- Token is stored in both `authToken` (legacy) and `bearer` (API client) for compatibility
- Auto-creation only happens on `/features` page if no session exists
- Guest sessions work with all protected endpoints that accept guest role

---

**Fix Completed:** 2026-01-15  
**Status:** ✅ Ready for testing





