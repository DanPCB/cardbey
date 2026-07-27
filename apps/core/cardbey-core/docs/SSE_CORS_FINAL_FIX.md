# SSE CORS Final Fix

## Summary

Fixed CORS issues for SSE endpoints `/api/stream` and `/api/stream?key=admin` by ensuring CORS headers are set correctly before any response is written, using centralized origin checking, and adding comprehensive debug logging.

## Changes Made

### 1. Updated `setupSseHeaders()` Function

**File**: `src/realtime/sse.js`

- Now uses centralized `isOriginAllowed()` function instead of hardcoded origins
- Sets CORS headers FIRST, before SSE-specific headers
- Flushes headers immediately to ensure they're sent
- Ensures headers are set before any response body is written

```javascript
export function setupSseHeaders(res, req) {
  // IMPORTANT: Set CORS headers FIRST, before any other headers
  const origin = req?.headers?.origin;
  
  // Set CORS headers using centralized origin checking
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Last-Event-ID, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
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

- Uses centralized `isOriginAllowed()` function
- Sets all required CORS headers
- Added debug logging for preflight requests

```javascript
router.options('/stream', cors(sseCorsOptions), (req, res) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Last-Event-ID, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
  console.log('[SSE] OPTIONS preflight', {
    url: req.originalUrl,
    origin: req.headers.origin,
  });
  
  return res.sendStatus(204);
});
```

### 3. Updated GET Handler

**File**: `src/realtime/sse.js`

- Sets headers BEFORE any writes
- Verifies CORS headers were set (for debugging)
- Added comprehensive debug logging

```javascript
router.get('/stream', cors(sseCorsOptions), (req, res, next) => {
  // Debug log BEFORE setting headers
  console.log('[SSE] New connection', {
    url: req.originalUrl,
    origin: req.headers.origin,
    ip: ip,
    key: key || 'none',
  });
  
  // CRITICAL: Setup headers BEFORE any writes
  setupSseHeaders(res, req);
  
  // Verify CORS headers were set
  const corsOrigin = res.getHeader('Access-Control-Allow-Origin');
  if (corsOrigin) {
    console.log('[SSE] CORS header set:', corsOrigin);
  } else {
    console.warn('[SSE] WARNING: Access-Control-Allow-Origin header not set!');
  }
  
  // Attach client and start stream
  attachClient(req, res, { label: `router-${label}` });
  
  console.log('[SSE] Connection established', {
    url: req.originalUrl,
    origin: req.headers.origin,
  });
});
```

### 4. Updated `attachClient()` Function

**File**: `src/realtime/sse.js`

- Headers should already be set by route handler
- Only sets headers as fallback if not already set
- Added warning log if headers weren't set in route handler

## CORS Configuration

### Allowed Origins
- `http://localhost:5174` ✅
- `http://127.0.0.1:5174` ✅
- `http://192.168.1.7:5174` ✅
- Plus any from environment variables

### Allowed Methods
- `GET`, `OPTIONS` ✅

### Allowed Headers
- `Content-Type`
- `Cache-Control`
- `Last-Event-ID`
- `Accept`
- `Authorization`

## Route Mounting Order

Routes are mounted in this order in `src/server.js`:

1. Global CORS middleware: `app.use(cors(corsOptions))`
2. Global OPTIONS handler: `app.options('*', cors(corsOptions))`
3. SSE routes: `app.use('/api', realtimeRoutes)` - Contains `/api/stream`

This ensures:
- Global CORS middleware runs first
- SSE routes get CORS headers from both global middleware and route-specific middleware
- Headers are set before any response is written

## Debug Logging

The following logs are now available:

1. **OPTIONS preflight**:
   ```
   [SSE] OPTIONS preflight { url: '/api/stream?key=admin', origin: 'http://localhost:5174' }
   ```

2. **New connection**:
   ```
   [SSE] New connection {
     url: '/api/stream?key=admin',
     origin: 'http://localhost:5174',
     ip: '::ffff:192.168.1.100',
     key: 'admin'
   }
   ```

3. **CORS header verification**:
   ```
   [SSE] CORS header set: http://localhost:5174
   ```

4. **Connection established**:
   ```
   [SSE] Connection established {
     url: '/api/stream?key=admin',
     origin: 'http://localhost:5174'
   }
   ```

## Key Fixes

1. **Centralized Origin Checking**: Uses `isOriginAllowed()` from `src/config/cors.js` instead of hardcoded origins
2. **Header Order**: CORS headers are set FIRST, before SSE-specific headers
3. **Header Flushing**: Headers are flushed immediately to ensure they're sent
4. **Pre-write Headers**: Headers are set BEFORE any response body is written
5. **Debug Logging**: Comprehensive logging to verify CORS headers are set correctly

## Testing

All tests pass. The SSE endpoints should now:
- Accept connections from `http://localhost:5174`
- Return proper CORS headers in both OPTIONS and GET responses
- Not be blocked by browser CORS policy
- Show debug logs confirming CORS headers are set

## Files Changed

1. `src/realtime/sse.js` - Updated CORS header handling and debug logging
2. `src/config/cors.js` - Already had correct configuration (no changes needed)

## Date

Fixed: 2025-01-XX


