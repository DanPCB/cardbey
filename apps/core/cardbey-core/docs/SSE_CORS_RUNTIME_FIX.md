# SSE CORS Runtime Fix

## Summary

Fixed SSE CORS issues in runtime by using permissive CORS policy (`Access-Control-Allow-Origin: *`), adding comprehensive debug logging, and ensuring headers are set correctly before any response writes.

## Changes Made

### 1. Updated `setupSseHeaders()` Function

**File**: `src/realtime/sse.js`

- Changed to use permissive CORS policy: `Access-Control-Allow-Origin: *`
- Uses `res.statusCode = 200` instead of `writeHead()` to avoid overwriting headers
- Sets all headers using `setHeader()` (safer for SSE)
- Added `Vary: Origin` header
- Flushes headers immediately

```javascript
export function setupSseHeaders(res, req) {
  // For SSE, use permissive CORS policy - allow any origin
  const corsOrigin = '*';
  
  // Set status code first (don't use writeHead as it can overwrite headers)
  res.statusCode = 200;
  
  // CORS headers first - MUST be set before any writes
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Last-Event-ID, X-Requested-With, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Last-Event-ID');
  
  // SSE-specific headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Flush headers immediately
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}
```

### 2. Updated OPTIONS Handler

**File**: `src/realtime/sse.js`

- Uses permissive CORS: `Access-Control-Allow-Origin: *`
- Sets all required CORS headers
- Returns 204 with proper headers

### 3. Updated GET Handler

**File**: `src/realtime/sse.js`

- Added comprehensive debug logging:
  - `[SSE DEBUG] incoming request` - Logs before setting headers
  - `[SSE DEBUG] response headers` - Logs after setting headers
- Added error handling to prevent early `res.end()`
- Wraps `attachClient()` in try-catch
- Sets up error handlers for response

### 4. Updated `attachClient()` Function

**File**: `src/realtime/sse.js`

- Added try-catch around initial write
- Better error handling to prevent connection from closing prematurely

## Debug Logging

The following logs will appear in the core console:

1. **Incoming request** (before headers):
   ```
   [SSE DEBUG] incoming request {
     url: '/api/stream?key=admin',
     origin: 'http://localhost:5174',
     method: 'GET',
     headers: { origin: 'http://localhost:5174', 'user-agent': '...' }
   }
   ```

2. **Response headers** (after setting):
   ```
   [SSE DEBUG] response headers {
     'access-control-allow-origin': '*',
     'content-type': 'text/event-stream; charset=utf-8',
     'cache-control': 'no-cache, no-transform',
     'connection': 'keep-alive',
     allHeaders: { ... }
   }
   ```

3. **CORS header verification**:
   ```
   [SSE] CORS header set: *
   ```

4. **Connection established**:
   ```
   [SSE] Connection established {
     url: '/api/stream?key=admin',
     origin: 'http://localhost:5174'
   }
   ```

5. **Connection closed**:
   ```
   [SSE] Connection closed {
     url: '/api/stream?key=admin',
     origin: 'http://localhost:5174'
   }
   ```

## CORS Configuration

### Permissive Policy for SSE

For SSE endpoints, we use a permissive CORS policy:
- `Access-Control-Allow-Origin: *` (allows any origin)
- `Access-Control-Allow-Credentials: false` (no credentials needed)
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Cache-Control, Last-Event-ID, X-Requested-With, Accept, Authorization`
- `Access-Control-Expose-Headers: Content-Type, Last-Event-ID`
- `Vary: Origin`

This ensures browsers don't block SSE connections regardless of origin.

## Verification Steps

### 1. Check Core Logs

When a connection is made from `http://localhost:5174`, you should see:

```
[SSE DEBUG] incoming request { url: '/api/stream?key=admin', origin: 'http://localhost:5174', ... }
[SSE DEBUG] response headers { 'access-control-allow-origin': '*', ... }
[SSE] CORS header set: *
[SSE] Connection established { url: '/api/stream?key=admin', origin: 'http://localhost:5174' }
```

### 2. Check Browser Network Tab

1. Open Firefox → Screen Management page at `http://localhost:5174/app/back/screens`
2. Open DevTools → Network tab
3. Filter by "stream"
4. Look for `GET /api/stream?key=admin`:
   - Status should be `200` (not "Blocked")
   - Should remain in "pending" state (not immediately close)
   - Response headers should include:
     - `Access-Control-Allow-Origin: *`
     - `Content-Type: text/event-stream; charset=utf-8`
     - `Cache-Control: no-cache, no-transform`
     - `Connection: keep-alive`

### 3. Check Browser Console

- Should NOT show "CORS request did not succeed" errors
- Should NOT show "connection interrupted" errors
- `[SSE Client] Connection error` with `issue: "CORS_BLOCKED"` should disappear

## Key Fixes

1. **Permissive CORS**: Uses `Access-Control-Allow-Origin: *` for SSE (dev-friendly)
2. **No writeHead**: Uses `res.statusCode` and `setHeader()` to avoid overwriting headers
3. **Header Order**: CORS headers set FIRST, before SSE headers
4. **Header Flushing**: Headers flushed immediately to ensure they're sent
5. **Debug Logging**: Comprehensive logging to verify headers are set correctly
6. **Error Handling**: Prevents early `res.end()` that could close connections
7. **Keep-Alive**: Initial `:connected` comment written to keep connection alive

## Testing

All tests pass. The SSE endpoints should now:
- Accept connections from any origin (permissive CORS)
- Return proper CORS headers in both OPTIONS and GET responses
- Not be blocked by browser CORS policy
- Stay open/pending in the Network tab
- Show debug logs confirming CORS headers are set

## Files Changed

1. `src/realtime/sse.js` - Updated to use permissive CORS, added debug logging, improved error handling

## Date

Fixed: 2025-01-XX


