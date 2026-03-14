# Upload Endpoints Fix Summary

## Issues Fixed

### 1. Missing Module Import Error
**Problem:** `Cannot find module '../lib/api.js'` when uploading hero/avatar images

**Root Cause:** Line 1234 was trying to import `apiPOST` from `../lib/api.js`, which doesn't exist in the backend. `apiPOST` is a frontend helper function, not a backend utility.

**Fix:** Removed the broken import. The upload endpoints use `uploadBufferToS3` directly, which is the correct backend utility.

### 2. Missing Upload Endpoints
**Problem:** Upload endpoints were missing from `stores.js` after git restore

**Fix:** Added both upload endpoints:
- `POST /api/stores/:id/upload/hero` - Uploads hero/background image
- `POST /api/stores/:id/upload/avatar` - Uploads avatar/logo image

## Code Changes

### File: `apps/core/cardbey-core/src/routes/stores.js`

1. **Added multer configuration** (for file uploads)
2. **Added hero upload endpoint** (`POST /:id/upload/hero`)
3. **Added avatar upload endpoint** (`POST /:id/upload/avatar`)

Both endpoints:
- Use `uploadBufferToS3` for file storage
- Use `resolvePublicUrl` and `ensureAbsoluteUrl` for URL normalization
- Save URLs to `stylePreferences` object
- Update store record via Prisma
- Return absolute URLs for frontend use

## Store Draft Fields Updated

### Hero Upload (`POST /api/stores/:id/upload/hero`)
**Request Body:** `multipart/form-data` with field `file`

**Fields Updated:**
- `stylePreferences.profileHeroUrl` (primary)
- `stylePreferences.heroImageUrl` (compatibility)

**Response:**
```json
{
  "ok": true,
  "url": "https://example.com/uploads/hero-image.jpg",
  "store": { ... }
}
```

### Avatar Upload (`POST /api/stores/:id/upload/avatar`)
**Request Body:** `multipart/form-data` with field `file`

**Fields Updated:**
- `stylePreferences.profileAvatarUrl` (primary)
- `stylePreferences.avatarImageUrl` (compatibility)
- `logo` (backward compatibility - direct field on Business model)

**Response:**
```json
{
  "ok": true,
  "url": "https://example.com/uploads/avatar-image.jpg",
  "store": { ... }
}
```

## Frontend Integration

### Avatar Upload
- **Component:** `StoreReviewHero.tsx`
- **Button:** `UploadImageButton` with `uploadEndpoint="avatar"` and empty `label` (icon-only)
- **Endpoint Called:** `POST /api/stores/:id/upload/avatar`
- **Field Name in Request:** `file` (multipart/form-data)
- **Callback:** `onAvatarUploaded()` refreshes draft data

### Hero Upload
- **Component:** `HeroUploadSection.tsx`
- **Button:** `UploadImageButton` with `uploadEndpoint="hero"` and `label="Upload Image"`
- **Endpoint Called:** `POST /api/stores/:id/upload/hero`
- **Field Name in Request:** `file` (multipart/form-data)
- **Callback:** `onUpdate()` refreshes draft data

## Verification Checklist

- [x] Server starts without module import error
- [x] Hero upload endpoint exists and works
- [x] Avatar upload endpoint exists and works
- [x] Both endpoints use correct imports (no `api.js`)
- [x] URLs are normalized to absolute format
- [x] Store draft fields are updated correctly
- [x] Frontend components use same `UploadImageButton`
- [x] No linter errors

## Manual Test Plan

1. **Start server** - Should start without errors
2. **Upload hero image:**
   - Navigate to Store Review page
   - Click "Upload Image" in Hero section
   - Select image file
   - Verify: Image appears, URL saved to `stylePreferences.profileHeroUrl`
3. **Upload avatar:**
   - Click pencil icon on avatar placeholder
   - Select image file
   - Verify: Avatar updates, URL saved to `stylePreferences.profileAvatarUrl` and `logo`
4. **Refresh page** - Both images should persist

## Notes

- Both endpoints require authentication (`requireAuth`) and ownership (`requireOwner`)
- File size limit: 10MB
- Only image files allowed (JPEG, PNG, GIF, WebP)
- URLs are always normalized to absolute format for Zod validation
- Backend logs: `[HERO_UPLOAD_OK]` and `[AVATAR_UPLOAD_OK]` for debugging





