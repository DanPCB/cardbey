# SSE Fix Complete - Direct Connection to Core

## Summary

Fixed the SSE endpoint in cardbey-core and updated the SSE client in cardbey-marketing-dashboard to connect directly to Core (not via Vite proxy).

## Changes Made

### 1. Backend (cardbey-core) - `src/realtime/sse.js`

#### Fixed OPTIONS Handler
- Changed `Access-Control-Allow-Credentials` from `'true'` to `'false'` (required for SSE with wildcard origin)
- Simplified CORS to use `origin || '*'`
- Returns `204` for OPTIONS (correct)

#### Fixed GET Handler
- **Ensures status `200`** (not `204`) - critical fix
- Sets CORS headers at the very top before any writes:
  - `Access-Control-Allow-Origin: origin || '*'`
  - `Access-Control-Allow-Credentials: 'false'` (was `'true'`)
  - `Vary: Origin`
- Sets all required SSE headers:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
- **Writes initial data immediately**: `res.write(':ok\n\n')` so browser considers SSE "open"
- Flushes headers before writing data
- Configures socket: `setKeepAlive(true)`, `setTimeout(0)`
- Sets up heartbeat every 15 seconds: `:heartbeat ${Date.now()}\n\n`
- Added debug logging: `[SSE] CONNECT` and `[SSE] HEADERS SENT`

#### Key Fixes
1. **Status 200 instead of 204** - This was the main issue causing PowerShell to report 204
2. **Credentials: false** - Required when using wildcard or for SSE compatibility
3. **Immediate initial write** - Ensures browser recognizes connection as open
4. **Proper heartbeat** - Keeps connection alive

### 2. Frontend (cardbey-marketing-dashboard) - `src/lib/sseClient.ts`

#### Updated Connection Logic
- **Changed from relative path to absolute URL**: Now uses `requireApiBase()` to get Core base URL
- **Connects directly to Core**: `${base}/api/stream?key=admin` instead of `/stream?key=...` (via Vite proxy)
- Uses native `EventSource` when available, polyfill as fallback
- Sets `withCredentials: false` for polyfill (matches backend CORS)
- Updated logging: `[SSE] opening`, `[SSE] open`, `[SSE] message`

#### Added Documentation
- Added comprehensive comments explaining:
  - Why SSE must connect directly to Core (not via proxy)
  - CORS configuration details
  - Why initial `:ok` comment and heartbeats are needed
  - Verification checklist

## Verification Steps

### Step 1: Start Services
```bash
# Terminal 1: Start cardbey-core
cd cardbey-core
npm run dev

# Terminal 2: Start marketing dashboard
cd cardbey-marketing-dashboard
npm run dev
```

### Step 2: Open Dashboard
Open `http://192.168.1.7:5174/screens` in a browser (Firefox or Chrome).

### Step 3: Check Browser DevTools

#### Network Tab
- Filter: `api/stream`
- Should see exactly **one** request to `http://192.168.1.7:3001/api/stream?key=admin`
- **Type**: `eventsource` (not `xhr`)
- **Status**: `200 OK` (not `204`)
- **Content-Type**: `text/event-stream; charset=utf-8`
- Connection should stay **open** (pending, not closed)
- **No** `NS_BINDING_ABORTED` errors

#### Console Tab
Should see:
```
[SSE] opening { url: "http://192.168.1.7:3001/api/stream?key=admin", impl: "native", base: "http://192.168.1.7:3001" }
[SSE] open
[SSE] message { ... }
```

### Step 4: Check Server Logs (cardbey-core)
Should see:
```
[SSE] CONNECT { url: '/stream?key=admin', originalUrl: '/api/stream?key=admin', origin: 'http://localhost:5174', key: 'admin' }
[SSE] HEADERS SENT { ... }
[SSE] Client attached successfully { id: '...', origin: '...', key: 'admin', userId: 'admin', keyType: 'dev' }
```

### Step 5: PowerShell Test
```powershell
$response = Invoke-WebRequest `
  -Uri "http://192.168.1.7:3001/api/stream?key=admin" `
  -Headers @{ Origin = "http://192.168.1.7:5174"; Accept = "text/event-stream" } `
  -Method Get `
  -TimeoutSec 5

$response.StatusCode  # Should be 200, not 204
$response.Headers['Content-Type']  # Should be "text/event-stream; charset=utf-8"
```

**Expected**: StatusCode `200`, Content-Type `text/event-stream; charset=utf-8`

### Step 6: Banner Check
- The red "SSE connection not established" banner on `/screens` should **disappear** once `onopen` fires
- Banner should only show when connection is actually closed/error

## Technical Details

### Why Direct Connection (Not Vite Proxy)?

1. **Long-lived connections**: SSE connections stay open indefinitely. Vite's dev proxy can timeout or buffer these connections.
2. **CORS handling**: Direct connection ensures proper CORS headers are set by the backend.
3. **Connection stability**: Proxies can interfere with keep-alive mechanisms and heartbeat detection.

### Why `Access-Control-Allow-Credentials: false`?

- When using `Access-Control-Allow-Origin: *`, credentials must be `false`
- SSE doesn't require credentials for this use case
- Simplifies CORS configuration

### Why Initial `:ok` Comment Frame?

- Browser needs to see data immediately to consider the connection "open"
- Without initial data, browser may close the connection thinking it's idle
- Comment frames (`:`) don't trigger message handlers but keep the connection alive

### Why Periodic Heartbeats?

- Prevents proxies and browsers from closing idle connections
- 15-second interval is a good balance (not too frequent, not too sparse)
- Comment frames are lightweight and don't trigger message handlers

## Files Changed

### Backend (cardbey-core)
- `src/realtime/sse.js` - Fixed GET handler to return 200, fixed CORS, added initial write and heartbeat
- `src/server.js` - Added comment about OPTIONS handler not interfering

### Frontend (cardbey-marketing-dashboard)
- `src/lib/sseClient.ts` - Changed to connect directly to Core, added documentation

## Troubleshooting

### Still Getting 204?
- Check server logs for `[SSE] CONNECT` - if you don't see it, the request isn't reaching the handler
- Verify route mounting order in `server.js` - SSE routes should be mounted early
- Check for duplicate route handlers

### Still Getting CORS Errors?
- Verify `Access-Control-Allow-Credentials: false` in response headers
- Check that `Access-Control-Allow-Origin` matches the request origin
- Ensure OPTIONS preflight returns 204 with correct headers

### Connection Still Aborting?
- Check that initial `:ok` comment is being written
- Verify heartbeat is running (check server logs for heartbeat writes)
- Ensure no middleware is calling `res.end()` prematurely
- Check that `req.socket.setKeepAlive(true)` and `setTimeout(0)` are set

### Banner Not Disappearing?
- Check console for `[SSE] open` log
- Verify `hasConnected` flag is being set to `true` in `sseClient.ts`
- Check that the banner component is using `isConnected()` from `sseClient.ts`

