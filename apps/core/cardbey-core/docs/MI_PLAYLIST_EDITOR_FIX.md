# MI Playlist Editor Fix Summary

## Issues Fixed

1. **MI Brain panel showing "No MI Brain attached"** - Fixed by ensuring MIEntity is properly attached and read from both locations
2. **404 errors in console** - Fixed by ensuring all endpoints properly include MIEntity without requiring separate API calls

## Changes Made

### Backend Changes

#### 1. `/api/signage/playlist/:playlistId` Endpoint
**File:** `apps/core/cardbey-core/src/routes/signageRoutes.js` (lines ~1593-1648)

**Changes:**
- Added MIEntity fetching for each playlist item using `getEntityByLink({ screenItemId: item.id })`
- Attached MIEntity at both levels:
  - `item.asset.miEntity` (preferred)
  - `item.miEntity` (backward compatibility)
- Added `normalizedUrl` to asset payload for consistent URL handling
- Made MIEntity fetching non-fatal (errors are logged but don't break the response)

#### 2. `/api/signage-playlists/:playlistId` Endpoint
**File:** `apps/core/cardbey-core/src/routes/signageRoutes.js` (lines ~752-848)

**Changes:**
- Already had MIEntity fetching, but now also includes `miEntity` at item level (not just asset level)
- Ensures both `item.asset.miEntity` and `item.miEntity` are populated

#### 3. `/api/device/:deviceId/playlist/full` Endpoint
**File:** `apps/core/cardbey-core/src/routes/deviceEngine.js` (lines ~2010-2450)

**Status:** Already correctly implemented
- Fetches MIEntity for each playlist item
- Attaches at both `item.asset.miEntity` and `item.miEntity`

### Frontend Changes

#### 1. PlaylistPreviewPane Component
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/signage/components/PlaylistPreviewPane.jsx`

**Changes:**
- Updated MIEntity extraction to check both locations:
  ```tsx
  const miEntity =
    selectedItem?.asset?.miEntity ||
    selectedItem?.miEntity ||
    null;
  ```
- This ensures it works whether backend attaches MI as `item.asset.miEntity`, `item.miEntity`, or both

#### 2. PlaylistTimelinePane Component
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/signage/components/PlaylistTimelinePane.jsx`

**Changes:**
- Updated MIBadge to check both locations:
  ```tsx
  <MIBadge hasBrain={!!(item?.asset?.miEntity || item?.miEntity)} />
  ```

#### 3. getSignagePlaylist API Function
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Changes:**
- Updated item mapping to preserve `miEntity` at both levels:
  - `item.miEntity` (from backend)
  - `item.asset.miEntity` (from backend asset object)
- Added `normalizedUrl` to asset mapping
- Fixed field name mappings (`orderIndex` instead of `order`, `durationS` instead of `duration`)

## Response Structure

### Playlist Item Structure (After Fix)

```typescript
{
  id: string;
  assetId: string;
  orderIndex: number;
  durationS: number | null;
  miEntity: MIEntity | null;  // Item-level MIEntity (backward compatibility)
  asset: {
    id: string;
    url: string;
    normalizedUrl: string;
    type: 'image' | 'video' | 'html';
    name: string | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    durationS: number | null;
    createdAt: string;
    miEntity: MIEntity | null;  // Asset-level MIEntity (preferred)
  } | null;
}
```

## Endpoints Confirmed/Updated

### Confirmed Working:
- ✅ `GET /api/signage-playlists/:playlistId` - Includes MIEntity at both levels
- ✅ `GET /api/signage/playlist/:playlistId` - **UPDATED** to include MIEntity at both levels
- ✅ `GET /api/device/:deviceId/playlist/full` - Already includes MIEntity at both levels
- ✅ `GET /api/signage-assets` - Already includes MIEntity in asset list

### Frontend Components Updated:
- ✅ `PlaylistPreviewPane` - Now checks both `item.asset.miEntity` and `item.miEntity`
- ✅ `PlaylistTimelinePane` - MIBadge now checks both locations
- ✅ `getSignagePlaylist` API function - Preserves MIEntity at both levels

## Backward Compatibility

All changes maintain backward compatibility:
- Existing fields remain unchanged
- MIEntity is added as optional fields (`miEntity` and `asset.miEntity`)
- Frontend checks both locations to handle either format
- MIEntity fetching failures don't break playlist loading

## Testing Checklist

- [x] Playlist editor loads playlists correctly
- [x] MI Brain panel displays MIEntity when it exists
- [x] MI Brain panel shows "No MI Brain attached" when MIEntity is null
- [x] No 404 errors in console during normal usage
- [x] Asset library shows MI badges correctly
- [x] Playlist items show MI badges correctly

## Files Modified

### Backend:
- `apps/core/cardbey-core/src/routes/signageRoutes.js`
  - Updated `/api/signage/playlist/:playlistId` to include MIEntity
  - Updated `/api/signage-playlists/:playlistId` to include `miEntity` at item level

### Frontend:
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/signage/components/PlaylistPreviewPane.jsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/signage/components/PlaylistTimelinePane.jsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`
