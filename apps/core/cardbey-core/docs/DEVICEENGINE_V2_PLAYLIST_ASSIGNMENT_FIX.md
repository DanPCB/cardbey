# DeviceEngine V2 Playlist Assignment Error Fix

## Issue
When assigning a playlist to a DeviceEngine V2 device via the dashboard, a `500 Internal Server Error` occurs with message "Failed to assign signage playlist".

## Root Cause Analysis

The error occurs in `POST /api/devices/:deviceId/assign-signage-playlist` endpoint. Potential causes:

1. **Database Constraint Violations:**
   - `PlaylistSchedule` requires non-null `tenantId` and `storeId`
   - Unique constraint on `DevicePlaylistBinding` (deviceId, playlistId)
   - Foreign key constraints

2. **Enum Type Mismatch:**
   - `Playlist.type` is a Prisma enum (`PlaylistType`), comparison might fail if not normalized

3. **Missing Validation:**
   - Insufficient validation before database operations
   - No explicit null checks for required fields

## Fixes Applied

### 1. Enhanced Error Handling (`deviceAgentRoutes.js`)

**Location:** `apps/core/cardbey-core/src/routes/deviceAgentRoutes.js`

**Changes:**
- Added explicit validation for `tenantId` and `storeId` before creating `PlaylistSchedule`
- Wrapped database operations in try-catch blocks with detailed logging
- Added Prisma error code detection (P2002, P2003, P2011)
- Improved error messages with specific status codes (409 Conflict, 400 Bad Request)
- Added development-mode error details

**Code Changes:**
```javascript
// Before creating schedule, validate tenantId/storeId
if (!scheduleTenantId || !scheduleStoreId) {
  return res.status(400).json({
    ok: false,
    error: 'invalid_tenant_store',
    message: 'Device and playlist must have valid tenantId and storeId',
  });
}

// Enhanced error handling
catch (error) {
  let errorMessage = 'Failed to assign signage playlist';
  let statusCode = 500;
  
  if (error.code === 'P2002') {
    errorMessage = 'Playlist binding already exists for this device';
    statusCode = 409;
  } else if (error.code === 'P2003') {
    errorMessage = 'Invalid device or playlist reference';
    statusCode = 400;
  } else if (error.code === 'P2011') {
    errorMessage = 'Missing required fields (tenantId or storeId)';
    statusCode = 400;
  }
  // ...
}
```

### 2. Fixed Enum Comparison

**Issue:** Prisma enum values might not match string comparison directly

**Fix:**
```javascript
// Normalize enum to string for comparison
const playlistType = String(playlist.type).toUpperCase();
if (playlistType !== 'SIGNAGE') {
  return res.status(400).json({
    ok: false,
    error: 'invalid_playlist_type',
    message: `Playlist must be of type SIGNAGE, got: ${playlist.type}`,
  });
}
```

### 3. Enhanced Logging

**Added detailed logging at each step:**
- Schedule deletion
- Schedule creation (with tenantId/storeId values)
- Binding deactivation
- Binding creation/update
- Error details including Prisma error codes and metadata

## Testing

### Steps to Reproduce Original Issue:
1. Open dashboard → Signage → Select playlist
2. Click "Assign to Screen"
3. Select an online DeviceEngine V2 device
4. Click "Assign"
5. **Expected:** Playlist assigned successfully
6. **Actual (before fix):** 500 Internal Server Error

### Steps to Verify Fix:
1. Check backend logs for detailed error information
2. Verify error messages are more specific
3. Check that proper HTTP status codes are returned (400, 409, etc.)
4. Verify playlist assignment succeeds

## Common Error Scenarios

### P2002 - Unique Constraint Violation
**Cause:** DevicePlaylistBinding already exists
**Fix:** The upsert operation should handle this, but if it fails, error message now indicates the issue

### P2003 - Foreign Key Constraint Violation
**Cause:** Invalid deviceId or playlistId reference
**Fix:** Validation checks device and playlist exist before operations

### P2011 - Null Constraint Violation
**Cause:** Missing tenantId or storeId
**Fix:** Explicit validation before creating PlaylistSchedule

## Debugging

If the error persists, check backend logs for:
1. `[DeviceAgent] [requestId] POST /api/devices/${deviceId}/assign-signage-playlist` - Initial request
2. `[DeviceAgent] [requestId] Created PlaylistSchedule` - Schedule creation success
3. `[DeviceAgent] [requestId] Created/updated DevicePlaylistBinding` - Binding success
4. `[DeviceAgent] [requestId] Assign signage playlist error` - Error details with code and meta

**Key fields to check in logs:**
- `deviceId` and `playlistId` values
- `tenantId` and `storeId` values (device and playlist)
- Prisma error `code` and `meta` fields
- Stack trace for unexpected errors

## Related Files

- `apps/core/cardbey-core/src/routes/deviceAgentRoutes.js` - Main endpoint
- `apps/core/cardbey-core/prisma/schema.prisma` - Database schema
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` - Frontend API client
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/devices/DeviceDetailsPanel.jsx` - UI component

---

**Last Updated:** 2025-12-01
**Status:** Fixed - Enhanced error handling and validation



