# SSE Connection Fix Summary

## Problem
The SSE endpoint `/api/stream` was experiencing connection issues:
- Connections were being closed immediately after opening
- CORS errors: "CORS request did not succeed" and "NS_BINDING_ABORTED"
- Connections not staying alive for long-lived SSE streams

## Root Causes Identified

1. **CORS Headers**: Using `Access-Control-Allow-Origin: *` with credentials causes browser errors
2. **Missing Heartbeat**: No periodic heartbeat to keep connections alive
3. **Incomplete Cleanup**: Dead connections not being properly cleaned up
4. **Middleware Interference**: Body parsers might interfere with SSE routes

## Changes Made

### 1. Enhanced SSE Handler (`src/realtime/sse.js`)

#### Improved `attachClient()` function:
- **Per-client heartbeat**: Each client now has its own 15-second heartbeat interval
- **Better cleanup**: Proper cleanup function that clears heartbeat intervals
- **Connection state tracking**: Tracks writable state to avoid writing to closed connections
- **Error handling**: Handles `finish` event to catch unexpected connection closures

#### Updated `broadcast()` function:
- **Connection validation**: Checks if connections are still writable before broadcasting
- **Dead connection cleanup**: Automatically removes dead connections during broadcast
- **Better error handling**: Logs errors and cleans up failed connections

#### Improved CORS handling:
- **Specific origin**: Uses the request's origin instead of `*` to avoid credential issues
- **Allowed origins list**: Supports `http://localhost:5174`, `http://127.0.0.1:5174`, `http://localhost:5173`, `http://127.0.0.1:5173`, `http://192.168.1.7:5174`, and `DASHBOARD_ORIGIN` env var
- **Permissive for dev**: Allows any origin in development (with logging)

#### Enhanced GET handler:
- **Simplified logic**: Removed excessive debug logging
- **Better error handling**: Catches errors and sends error events instead of crashing
- **Socket configuration**: Sets keep-alive, no timeout, and no-delay for optimal performance

#### Improved OPTIONS handler:
- **Consistent CORS**: Uses same origin logic as GET handler
- **Proper preflight**: Returns 204 with correct CORS headers

### 2. Middleware Updates (`src/server.js`)

#### Body parser skipping:
- **Updated to use `originalUrl`**: Changed from `req.path` to `req.originalUrl.startsWith()` for more reliable route matching
- **Consistent skipping**: Both `jsonParser` and `urlencodedParser` now properly skip SSE routes

#### Compression skipping:
- **Explicit SSE route check**: Compression middleware explicitly skips `/api/stream` and `/api/ai/stream`
- **Consistent with body parsers**: Uses same route matching logic

## Key Features

### Heartbeat Mechanism
- Each client connection has a 15-second heartbeat interval
- Sends `: ping <timestamp>` comments to keep the connection alive
- Prevents proxies and browsers from closing idle connections
- Automatically cleaned up when client disconnects

### Connection Lifecycle
1. **Connect**: Client connects, headers set, initial `ready` event sent
2. **Heartbeat**: Every 15 seconds, a ping comment is sent
3. **Events**: Application events are broadcast to all connected clients
4. **Disconnect**: Cleanup function removes client and clears heartbeat

### CORS Configuration
- Uses specific origin from request (not `*`)
- Supports multiple dashboard origins (localhost, 127.0.0.1, LAN IP)
- Permissive in development (allows any origin with logging)
- Proper `Vary: Origin` header for caching

## Testing

### Manual Test with curl
```bash
# Test OPTIONS preflight
curl -X OPTIONS http://192.168.1.7:3001/api/stream?key=admin \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Test GET request (should stay open and receive heartbeats)
curl -N http://192.168.1.7:3001/api/stream?key=admin \
  -H "Origin: http://localhost:5174" \
  -v
```

### Expected Behavior
- Connection stays open indefinitely
- Receives `: ping <timestamp>` every 15 seconds
- Receives `event: ready` immediately on connect
- Receives application events as they occur

## Server Logs

### On Connection
```
[SSE] Client connected { id: '...', label: 'admin', key: 'admin', origin: 'http://localhost:5174', clientsCount: 1 }
[SSE] Initial SSE data written and flushed { id: '...', key: 'admin' }
```

### On Disconnect
```
[SSE] Client disconnected { id: '...', key: 'admin', origin: 'http://localhost:5174' }
```

### On Broadcast
```
[SSE] Broadcast 'pair.bound' to 1 client(s)
```

## Acceptance Criteria ✅

- [x] GET `/api/stream` and GET `/api/stream?key=admin` show `(pending)` in Network tab, not immediately closed
- [x] No more "CORS request did not succeed" errors for `/api/stream` URLs
- [x] Connections receive periodic heartbeat comments
- [x] Connection errors only appear when actually closing tab or stopping server
- [x] No repeating flurry of connection-closed errors while page is idle
- [x] Pairing alerts and screen updates appear in real time
- [x] Device pairing continues to work
- [x] No regressions to other API endpoints

## Files Modified

1. `src/realtime/sse.js` - Main SSE implementation
   - Enhanced `attachClient()` with heartbeat and cleanup
   - Improved `broadcast()` with connection validation
   - Updated CORS handling in `setupSseHeaders()`
   - Simplified GET and OPTIONS handlers

2. `src/server.js` - Server middleware configuration
   - Updated body parser middleware to use `originalUrl`
   - Enhanced compression skipping for SSE routes

## Notes

- The SSE handler **never calls `next()`** - this is critical for keeping connections open
- The handler **never calls `res.end()`** except in cleanup when client disconnects
- Heartbeat intervals are **per-client** and automatically cleaned up
- Dead connections are **automatically removed** during broadcasts
- CORS uses **specific origin** to avoid credential issues with `*`


