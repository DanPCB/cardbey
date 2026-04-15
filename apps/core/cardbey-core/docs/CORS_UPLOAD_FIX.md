# CORS Upload Fix

## Issue
File uploads to `/api/uploads/create` were failing with CORS errors:
- "Cross-Origin Request Blocked"
- "CORS request did not succeed"
- Status code: (null)

## Root Cause
The CORS configuration was missing some headers required for file uploads, particularly for multipart/form-data requests.

## Fix Applied

### 1. Updated CORS Allowed Headers
**File:** `src/config/cors.js`

Added file upload headers to `corsOptions.allowedHeaders`:
- `Content-Length`
- `Accept`
- `Origin`

### 2. Updated Global OPTIONS Handler
**File:** `src/server.js`

Updated the global OPTIONS preflight handler to include the same headers:
- Added `Content-Length, Accept, Origin` to `Access-Control-Allow-Headers`

### 3. Updated CORS Fallback Headers
**File:** `src/server.js`

Updated the fallback CORS header setting to include upload headers.

## Verification

After restarting the backend server, file uploads should work from:
- `http://localhost:5174` (frontend)
- `http://192.168.1.12:5174` (LAN access)

## Testing

1. Restart backend server
2. Try uploading a file from the Creative Engine Media Library
3. Check browser console - should no longer see CORS errors
4. Upload should complete successfully

## Notes

- The CORS configuration already allows `localhost:5174` in development
- In development mode, all origins are allowed, but headers must still be explicitly listed
- File uploads require additional headers beyond standard API requests
