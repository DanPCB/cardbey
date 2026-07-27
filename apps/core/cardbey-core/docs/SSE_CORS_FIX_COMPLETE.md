# SSE CORS Fix - Complete Implementation

## Problem Summary

The SSE endpoint `/api/stream` was experiencing persistent CORS and connection issues:
- **CORS errors**: "CORS request did not succeed" and "Cross-Origin Request Blocked"
- **Connection interruptions**: Connections were being closed after 6-7 seconds
- **Preflight failures**: OPTIONS requests were not being handled correctly

The root cause was that the global CORS middleware was interfering with the manual CORS header setting in the SSE handler, causing headers to be overwritten or conflicting.

## Solution

### 1. Excluded SSE Routes from Global CORS Middleware

**File**: `src/server.js`

**Change**: Modified the global CORS middleware to skip SSE routes, allowing them to handle CORS manually:

```javascript
// Global CORS middleware for all routes EXCEPT SSE routes
// SSE routes handle CORS manually to ensure proper headers for long-lived connections
app.use((req, res, next) => {
  // Skip CORS middleware for SSE routes - they handle CORS manually
  if (req.originalUrl.startsWith('/api/stream') || req.originalUrl.startsWith('/api/ai/stream')) {
    return next(); // Skip CORS middleware, let SSE handler set headers manually
  }
  // Apply CORS middleware for all other routes
  return cors(corsOptions)(req, res, next);
});
```

**Why**: SSE routes need to set CORS headers manually before any response is written, and the global CORS middleware was interfering with this process.

### 2. Enhanced SSE CORS Header Setup

**File**: `src/realtime/sse.js`

**Changes**:
- Improved `setupSseHeaders()` function with better origin matching logic
- Added comprehensive comments explaining CORS policy
- Ensured headers are flushed immediately after setting

**Key Features**:
- **Origin matching**: Uses specific origin from request if it matches the allowed list
- **Allowed origins**: 
  - `http://localhost:5174`
  - `http://127.0.0.1:5174`
  - `http://192.168.1.7:5174`
  - Legacy dev ports (5173)
  - `process.env.DASHBOARD_ORIGIN` (if set)
- **Permissive dev mode**: In development, allows any origin but logs non-whitelisted origins
- **Proper headers**: Sets all required CORS headers including `Vary: Origin`

### 3. Improved OPTIONS Preflight Handler

**File**: `src/realtime/sse.js`

**Changes**:
- Enhanced OPTIONS handler with same origin matching logic as GET handler
- Added `Access-Control-Max-Age` header to cache preflight for 24 hours
- Added logging for non-whitelisted origins in dev mode

**Key Features**:
- Returns `204 No Content` (standard for OPTIONS preflight)
- Sets all required CORS headers
- Uses same origin matching logic as GET handler for consistency

### 4. Enhanced GET Handler with Debug Logging

**File**: `src/realtime/sse.js`

**Changes**:
- Added comprehensive debug logging for connection lifecycle
- Logs incoming requests, CORS headers, socket configuration, and client attachment
- Improved error handling with detailed error messages

**Key Features**:
- Logs all connection attempts with origin, key, IP, and URL
- Verifies CORS headers are set correctly
- Logs socket configuration for debugging
- Provides detailed error messages if connection fails

## Files Modified

1. **`src/server.js`**
   - Modified global CORS middleware to skip SSE routes
   - Updated global OPTIONS handler to skip SSE routes

2. **`src/realtime/sse.js`**
   - Enhanced `setupSseHeaders()` function
   - Improved OPTIONS preflight handler
   - Enhanced GET handler with debug logging

## Testing

### Manual Test with curl

#### Test OPTIONS Preflight:
```bash
curl -X OPTIONS http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

**Expected**:
- Status: `204 No Content`
- Headers:
  - `Access-Control-Allow-Origin: http://localhost:5174`
  - `Access-Control-Allow-Methods: GET, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Cache-Control, Last-Event-ID, ...`
  - `Access-Control-Max-Age: 86400`

#### Test GET Request (should stay open):
```bash
curl -N http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174"
```

**Expected**:
- Status: `200 OK`
- Headers:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `Access-Control-Allow-Origin: http://localhost:5174`
- Connection stays open and receives:
  - Initial `:connected` comment
  - `ready` event
  - Heartbeat comments every 15 seconds (`: ping <timestamp>`)
  - System ping events every 30 seconds

#### Test with PowerShell Script:
```powershell
.\scripts\test-sse.ps1
```

This script tests both OPTIONS preflight and GET request.

### Browser Test

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open the dashboard** at `http://localhost:5174`

3. **Open DevTools** → Network tab

4. **Filter by "WS" or "EventStream"** or look for `/api/stream`

5. **Verify**:
   - ✅ `GET /api/stream` shows `(pending)` status, not immediately closed
   - ✅ `OPTIONS /api/stream` returns `204` (if visible)
   - ✅ No CORS errors in console
   - ✅ Connection stays open and receives events/heartbeats
   - ✅ Response headers include:
     - `Content-Type: text/event-stream; charset=utf-8`
     - `Access-Control-Allow-Origin: http://localhost:5174`
     - `Cache-Control: no-cache, no-transform`
     - `Connection: keep-alive`

6. **Check server logs** for:
   - `[SSE] GET /stream request` - Connection attempt logged
   - `[SSE] CORS headers set` - Headers verified
   - `[SSE] Socket configured for long-lived connection` - Socket configured
   - `[SSE] Client attached successfully` - Client connected
   - `[SSE] Client disconnected` - Only when tab is closed

## Key Improvements

1. **No CORS Middleware Interference**: SSE routes are now completely excluded from global CORS middleware, preventing header conflicts

2. **Proper Origin Matching**: Uses specific origin from request instead of `*`, which is required for CORS with credentials (even though we don't use credentials, this is best practice)

3. **Immediate Header Flushing**: Headers are flushed immediately after setting, ensuring they're sent before any data

4. **Comprehensive Logging**: Added extensive debug logging to help diagnose connection issues

5. **Consistent CORS Logic**: OPTIONS and GET handlers use the same origin matching logic

6. **Socket Configuration**: Explicitly configures socket for long-lived connections with keep-alive and no timeout

## Acceptance Criteria

After these changes:

- ✅ `GET /api/stream` and `GET /api/stream?key=admin` show `(pending)` in Network tab, not immediately closed
- ✅ No more "CORS request did not succeed" errors for `/api/stream` URLs
- ✅ `OPTIONS /api/stream` returns `204` with proper CORS headers
- ✅ Connection stays open and receives heartbeats every 15 seconds
- ✅ Dashboard receives real-time events (pairing alerts, screen updates, etc.)
- ✅ No regressions to other API endpoints
- ✅ Server logs show connection lifecycle events

## Troubleshooting

### If CORS errors persist:

1. **Check server logs** for `[SSE]` messages to see if requests are reaching the handler
2. **Verify origin** in browser DevTools → Network → Headers → Request Headers → `Origin`
3. **Check response headers** in Network tab to see if CORS headers are present
4. **Verify middleware order** - SSE routes should be mounted before global CORS middleware

### If connections close prematurely:

1. **Check server logs** for error messages
2. **Verify socket configuration** - logs should show `Socket configured for long-lived connection`
3. **Check for middleware interference** - ensure compression and body parsers skip SSE routes
4. **Verify heartbeat** - should see `: ping <timestamp>` every 15 seconds in curl output

### If OPTIONS preflight fails:

1. **Check server logs** for `[SSE] OPTIONS preflight` messages
2. **Verify OPTIONS handler** is registered before GET handler in `src/realtime/sse.js`
3. **Check global OPTIONS handler** in `src/server.js` - should skip SSE routes

## Related Documentation

- `docs/SSE_FIX_SUMMARY.md` - Previous SSE fixes
- `docs/SSE_CORS_FIX_SUMMARY.md` - Previous CORS fixes
- `docs/BACKEND_CORS_REQUIREMENT.md` - CORS requirements

