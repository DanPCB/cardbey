# Avatar & Hero Upload Fix - Final Solution

## Root Cause Identified

The upload endpoints were failing due to **`requireOwner` middleware blocking requests**. This middleware checks if `req.user.role === 'owner'`, but most users don't have this role set, causing 403 Forbidden errors.

## Fixes Applied

### 1. Removed `requireOwner` Middleware
**Problem:** `requireOwner` checks for `user.role === 'owner'`, which blocks legitimate uploads.

**Solution:** Removed `requireOwner` from both upload endpoints. Ownership is already verified inside the route handlers with `store.userId !== req.userId`.

**Changed:**
- `router.post('/:id/upload/hero', requireAuth, requireOwner, ...)` 
- → `router.post('/:id/upload/hero', requireAuth, ...)`

- `router.post('/:id/upload/avatar', requireAuth, requireOwner, ...)`
- → `router.post('/:id/upload/avatar', requireAuth, ...)`

### 2. Added Multer Error Handling
**Problem:** Multer errors (file size, type) were not being caught properly.

**Solution:** Added `handleMulterError` middleware to catch and return proper error responses.

### 3. Enhanced Error Logging
**Added:**
- `[HERO_UPLOAD_START]` - Logs when upload starts
- `[HERO_UPLOAD]` - Logs upload progress
- `[HERO_UPLOAD_OK]` - Logs successful upload
- `[HERO_UPLOAD_ERROR]` - Logs errors with context
- Same for `[AVATAR_UPLOAD_*]`

### 4. Frontend Debug Logging
**Added:** Debug logs in `UploadImageButton` to track upload flow (gated by `localStorage.getItem('cardbey.debug') === 'true'`).

## Endpoints

### Hero Upload
- **Route:** `POST /api/stores/:id/upload/hero`
- **Auth:** `requireAuth` only (no `requireOwner`)
- **Request:** `multipart/form-data` with field `file`
- **Response:** `{ ok: true, url: "...", store: {...} }`
- **Saves to:** `stylePreferences.profileHeroUrl` and `stylePreferences.heroImageUrl`

### Avatar Upload
- **Route:** `POST /api/stores/:id/upload/avatar`
- **Auth:** `requireAuth` only (no `requireOwner`)
- **Request:** `multipart/form-data` with field `file`
- **Response:** `{ ok: true, url: "...", store: {...} }`
- **Saves to:** `stylePreferences.profileAvatarUrl`, `stylePreferences.avatarImageUrl`, and `logo`

## Testing

### Enable Debug Logging
```javascript
localStorage.setItem('cardbey.debug', 'true');
```

### Test Hero Upload
1. Navigate to Store Review page
2. Click "Upload Image" in Hero section
3. Select image file
4. Check console for `[HERO_UPLOAD_START]`, `[HERO_UPLOAD]`, `[HERO_UPLOAD_OK]`
5. Verify image appears in UI

### Test Avatar Upload
1. Click pencil icon on avatar placeholder
2. Select image file
3. Check console for `[AVATAR_UPLOAD_START]`, `[AVATAR_UPLOAD]`, `[AVATAR_UPLOAD_OK]`
4. Verify avatar updates in UI

### Common Errors to Check

1. **403 Forbidden** - Check server logs for ownership mismatch
2. **400 No file** - Check if FormData is being sent correctly
3. **500 Upload failed** - Check S3/local storage configuration
4. **Multer errors** - Check file size (max 10MB) and type (images only)

## Files Modified

1. `apps/core/cardbey-core/src/routes/stores.js`
   - Removed `requireOwner` from upload endpoints
   - Added multer error handling
   - Added comprehensive logging

2. `apps/dashboard/cardbey-marketing-dashboard/src/components/upload/UploadImageButton.tsx`
   - Added debug logging

## Verification Checklist

- [x] Removed `requireOwner` middleware
- [x] Added multer error handling
- [x] Added comprehensive logging
- [x] Ownership still verified in route handlers
- [x] FormData handling correct
- [x] No linter errors

The uploads should now work correctly. The main blocker was the `requireOwner` middleware.





