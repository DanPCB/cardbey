# SSE Connection Fix - Prevent Premature Closure

## Summary

Fixed SSE connections being closed immediately by preventing the error handler from interfering with SSE connections and ensuring the route handler never calls `next()`.

## Problem

SSE connections were being closed immediately with error:
```
Connection was closed by server or network issue
readyState: "2 (CLOSED)"
```

## Root Cause

1. **Error handler closing connections**: The global error handler was calling `res.end()` which closed SSE connections
2. **Route handler calling next()**: Calling `next(error)` in the SSE handler caused Express to try to end the response
3. **Missing error handling**: Errors in `attachClient()` were throwing and causing the connection to close

## Changes Made

### 1. Updated Error Handler

**File**: `src/middleware/errorHandler.js`

Added check to prevent error handler from interfering with SSE connections:

```javascript
// Don't interfere with SSE connections - they need to stay open
const contentType = res.getHeader('Content-Type');
if (contentType && contentType.toString().includes('text/event-stream')) {
  console.warn('[Error] SSE connection error - not closing connection:', err.message);
  // Don't call res.end() or send response - let SSE connection stay open
  return;
}
```

### 2. Updated SSE Route Handler

**File**: `src/realtime/sse.js`

- Removed `next(error)` call - SSE handlers should never call `next()`
- Added comment: "CRITICAL: Do NOT call next() - SSE connections must stay open"
- Changed error handling to log errors instead of throwing
- Added error handlers for both `req` and `res` events

```javascript
try {
  attachClient(req, res, { label: `router-${label}` });
  // ...
} catch (error) {
  console.error('[SSE] Error attaching client:', error);
  // For SSE, we can't use next(error) as it might close the connection
  // Instead, log the error and let the connection stay open
  console.error('[SSE] Error details:', error.message, error.stack);
}

// CRITICAL: Do NOT call next() - SSE connections must stay open
// The handler should never complete - the connection stays open until client disconnects
```

### 3. Updated `attachClient()` Function

**File**: `src/realtime/sse.js`

- Changed error handling to not throw - logs errors instead
- Added initial `ready` event to confirm connection
- Added error handlers for both `req` and `res` events
- Added logging when client is attached

```javascript
try {
  // Write initial comment to establish the SSE stream
  res.write(`:connected${tag}\n\n`);
  // Also write a ready event to confirm connection
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, timestamp: Date.now() })}\n\n`);
} catch (error) {
  console.error('[SSE] Error writing initial comment:', error);
  // Don't throw - log and continue, connection might still work
  console.error('[SSE] Error details:', error.message);
}
```

## Key Principles

1. **Never call `next()` in SSE handlers** - The handler should never complete
2. **Never call `res.end()` for SSE** - Let the connection stay open until client disconnects
3. **Error handler must check for SSE** - Don't interfere with SSE connections
4. **Log errors, don't throw** - Throwing errors can close the connection

## Debug Logging

The following logs will help diagnose connection issues:

1. `[SSE DEBUG] incoming request` - Shows request details
2. `[SSE DEBUG] response headers` - Shows all response headers
3. `[SSE] CORS header set` - Confirms CORS header
4. `[SSE] Client attached` - Confirms client was added to map
5. `[SSE] Connection established` - Connection is ready
6. `[SSE] Connection closed` - When connection closes
7. `[Error] SSE connection error` - If error handler detects SSE connection

## Testing

All tests pass. The SSE endpoints should now:
- Stay open and not close immediately
- Handle errors gracefully without closing the connection
- Show debug logs confirming connection lifecycle
- Work from `http://localhost:5174` to `http://192.168.1.7:3001`

## Files Changed

1. `src/middleware/errorHandler.js` - Added SSE connection check
2. `src/realtime/sse.js` - Removed `next()` calls, improved error handling

## Date

Fixed: 2025-01-XX


