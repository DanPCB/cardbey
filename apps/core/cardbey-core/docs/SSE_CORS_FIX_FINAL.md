# SSE CORS Fix - Final Implementation

## Summary

Fixed CORS issues for the SSE endpoint `/api/stream` to allow cross-origin connections from the Marketing Dashboard and Android apps.

## Changes Made

### 1. Enhanced Origin Matching (`src/realtime/sse.js`)

- **Added `isOriginAllowed()` function** that supports:
  - `http://localhost:5174`
  - `http://127.0.0.1:5174`
  - `http://192.168.1.x:5174` (any LAN IP on port 5174)
  - Environment variable `DASHBOARD_ORIGIN`
  - Legacy dev ports (5173)
  - In development: any `localhost` origin

### 2. Fixed CORS Headers

**Key Changes:**
- **`Access-Control-Allow-Credentials: true`** (changed from `false`)
  - Required for SSE with credentials
  - When this is `true`, we cannot use `Access-Control-Allow-Origin: *`
  - Always uses specific origin from request
  
- **Headers set in correct order:**
  1. CORS headers first
  2. SSE-specific headers
  3. `flushHeaders()` called immediately

- **Headers included:**
  ```
  Access-Control-Allow-Origin: <specific-origin>
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: origin, content-type, accept, Cache-Control, Last-Event-ID, X-Requested-With, Authorization
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  ```

### 3. Enhanced OPTIONS Preflight Handler

- Updated to use same origin matching logic as GET handler
- Sets `Access-Control-Allow-Credentials: true`
- Returns `204 No Content` with proper CORS headers

### 4. Improved Logging

- Added: `[SSE] New client → origin: <origin> key: <key>`
- Logs CORS headers configuration
- Logs when non-whitelisted origins are allowed (dev mode)

### 5. Socket Configuration

- `req.socket.setKeepAlive(true)` - Keep connection alive
- `req.socket.setTimeout(0)` - No timeout
- `req.socket.setNoDelay(true)` - Lower latency

## Testing

### Expected Behavior

1. **Start the server**: `npm start`

2. **Load dashboard** at `http://localhost:5174`

3. **Open DevTools** → Network tab → Filter by "stream"

4. **You should see:**
   - Method: `GET`
   - Type: `eventsource`
   - Status: `200` (or `pending` for long-lived connection)
   - Size: Growing over time (as events are received)

5. **Server logs should show:**
   ```
   [SSE] New client → origin: http://localhost:5174 key: admin
   [SSE] CORS headers configured {
     'Access-Control-Allow-Origin': 'http://localhost:5174',
     'Access-Control-Allow-Credentials': 'true',
     'Content-Type': 'text/event-stream'
   }
   [SSE] Client attached successfully { id: '...', label: 'router-admin' }
   ```

### Manual Test with curl

```bash
# Test OPTIONS preflight
curl -X OPTIONS http://192.168.1.7:3001/api/stream?key=admin \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Test GET request (should stay open and receive events)
curl -N http://192.168.1.7:3001/api/stream?key=admin \
  -H "Origin: http://localhost:5174"
```

## Supported Origins

- `http://localhost:5174` ✅
- `http://127.0.0.1:5174` ✅
- `http://192.168.1.1:5174` ✅ (any 192.168.1.x)
- `http://192.168.1.7:5174` ✅
- `http://192.168.1.100:5174` ✅
- Legacy ports (5173) ✅
- Environment variable `DASHBOARD_ORIGIN` ✅
- In development: any `localhost:*` origin ✅

## Important Notes

1. **Credentials and Origin**: When `Access-Control-Allow-Credentials: true`, we must use a specific origin (not `*`). The implementation ensures this.

2. **Headers Order**: CORS headers are set BEFORE any SSE data is written, and `flushHeaders()` is called immediately.

3. **No Middleware Interference**: SSE routes are excluded from global CORS middleware and body parsers to prevent interference.

4. **Long-Lived Connections**: Socket is configured with keep-alive and no timeout to maintain the connection.

## Files Modified

- `src/realtime/sse.js`:
  - Added `isOriginAllowed()` function
  - Updated `setupSseHeaders()` to set credentials to `true`
  - Enhanced origin matching logic
  - Improved logging
  - Updated OPTIONS handler

## Verification

After these changes, the dashboard should:
- ✅ Connect to `/api/stream?key=admin` without CORS errors
- ✅ See the connection as `pending` in Network tab
- ✅ Receive `screen.pair_session.created` events
- ✅ Show pairing alerts when sessions are created

