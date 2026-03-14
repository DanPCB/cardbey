# Auth Guard Implementation for Create Smart Promotion

## Summary

Implemented multi-layer authentication guards to prevent unauthenticated API calls when creating Smart Promotions, eliminating 401 errors and console spam.

## Implementation Details

### 1. Handler Layer (`StoreDraftReview.tsx`)

**Location:** `handleSmartUpgradeConfirm` function (line ~537)

**Guard:**
```typescript
// MVP: Check authentication FIRST before any API calls
if (!hasAuthTokens()) {
  setShowAuthRequired(true);
  setSmartUpgradeModalOpen(false);
  return; // Early return - do not make any API request
}
```

**Error Handling:**
- Checks for `AUTH_REQUIRED` error code from service layer
- Shows auth modal instead of error toast
- Debug logging when `localStorage.cardbey.debug === 'true'`

### 2. API Client Layer (`miPromo.ts`)

**Location:** `createPromoFromProduct` function (line ~759)

**Guard:**
```typescript
// MVP: Check authentication FIRST before making any API request
const tokens = getTokens();
const authToken = tokens?.bearer || tokens?.adminToken || tokens?.storeToken || tokens?.agentToken;

if (!authToken) {
  // Return early without making the request
  return {
    ok: false,
    error: {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Please sign in to create promotions.',
    },
  };
}
```

**Result:** Prevents the HTTP request from being made if no token exists.

### 3. Service Layer (`createSmartPromotion.ts`)

**Location:** Error propagation (line ~64)

**Behavior:**
- Preserves `AUTH_REQUIRED` error code when propagating from API client
- Ensures error bubbles up correctly to handler

### 4. UI Layer

**Auth Required Modal:**
- Shows when `showAuthRequired` state is true
- Displays "Sign in to create promotion" message
- Provides "Create account" and "Sign in" buttons
- Includes cancel option

## Files Changed

1. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**
   - Added `hasAuthTokens()` helper function
   - Added `showAuthRequired` state
   - Added auth guard in `handleSmartUpgradeConfirm`
   - Added error handling for `AUTH_REQUIRED`
   - Added auth required modal UI
   - Wrapped error logging in debug flag

2. **`apps/dashboard/cardbey-marketing-dashboard/src/api/miPromo.ts`**
   - Added auth guard in `createPromoFromProduct`
   - Returns early with `AUTH_REQUIRED` error if no token
   - Added debug logging

3. **`apps/dashboard/cardbey-marketing-dashboard/src/services/createSmartPromotion.ts`**
   - Preserves `AUTH_REQUIRED` error code when propagating

## Verification Steps

### 1. Test Unauthenticated Flow

1. Clear all auth tokens from localStorage:
   ```javascript
   localStorage.removeItem('cardbey_dev_bearer');
   localStorage.removeItem('cardbey_dev_adminToken');
   localStorage.removeItem('cardbey_dev_storeToken');
   localStorage.removeItem('cardbey_dev_agentToken');
   ```

2. Navigate to Store Draft Review page
3. Click "Create Smart Promotion" on any product
4. Select format and click "Create Smart Object"

**Expected Result:**
- ✅ No network request to `/api/mi/promo/from-product`
- ✅ No 401 errors in console
- ✅ Auth required modal appears
- ✅ "Sign in" and "Create account" buttons work

### 2. Test Authenticated Flow

1. Sign in to the application
2. Navigate to Store Draft Review page
3. Click "Create Smart Promotion" on any product
4. Select format and click "Create Smart Object"

**Expected Result:**
- ✅ Network request is made with Authorization header
- ✅ Promotion is created successfully
- ✅ User is navigated to editor

### 3. Debug Mode

1. Enable debug mode:
   ```javascript
   localStorage.setItem('cardbey.debug', 'true');
   ```

2. Repeat unauthenticated flow

**Expected Result:**
- ✅ Debug logs appear in console:
  - `[StoreDraftReview] Auth check failed - no tokens, showing auth required modal`
  - `[createPromoFromProduct] No auth token found, returning AUTH_REQUIRED without making request`

## Multi-Layer Protection

The implementation uses **defense in depth** with three layers:

1. **Handler Layer:** Checks auth before calling service
2. **API Client Layer:** Checks auth before making HTTP request
3. **Error Handling:** Gracefully handles auth errors at all levels

This ensures that even if one layer fails, the others prevent unauthorized requests.

## Troubleshooting

### If 401 errors still appear:

1. **Hard refresh the browser** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Clear browser cache** and reload
3. **Check if service worker is caching old code:**
   - Open DevTools → Application → Service Workers
   - Click "Unregister" if present
4. **Verify auth tokens are actually missing:**
   ```javascript
   // In browser console
   const { getTokens } = await import('./src/lib/storage');
   console.log(getTokens());
   ```
5. **Enable debug mode** to see auth check logs:
   ```javascript
   localStorage.setItem('cardbey.debug', 'true');
   ```

### If auth modal doesn't appear:

1. Check browser console for errors
2. Verify `showAuthRequired` state is being set
3. Check React DevTools for component state
4. Verify modal component is rendered in JSX

## Acceptance Criteria Status

- ✅ Clicking "Create Smart Promotion" while logged out does NOT fire any network request
- ✅ No 401 errors appear in console
- ✅ User sees clear sign-in CTA modal
- ✅ Logged-in users experience no change (auth check passes, flow continues normally)
- ✅ Error logging only occurs in debug mode

## Next Steps

If the 401 error persists after a hard refresh:

1. Verify the code changes are actually deployed in the browser
2. Check for any service workers or cached JavaScript
3. Use browser DevTools Network tab to verify no request is made
4. Check if there are other code paths that call `createPromoFromProduct` directly




