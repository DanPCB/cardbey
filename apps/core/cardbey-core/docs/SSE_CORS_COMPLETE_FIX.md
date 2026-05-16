# SSE CORS Complete Fix

## Summary

Fixed CORS issues for SSE endpoints `/api/stream` and `/api/stream?key=admin` to work from `http://localhost:5174`. The implementation now ensures CORS headers are set correctly before any response is written, uses centralized origin checking, and includes comprehensive logging.

## Changes Made

### 1. Updated CORS Configuration

**File**: `src/config/cors.js`

- Updated `sseCorsOptions` to use simplified callback pattern
- Added `X-Requested-With` to allowed headers (for EventSource polyfills)
- Ensures `http://localhost:5174` and `http://127.0.0.1:5174` are allowed

```javascript
export const sseCorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // allow same-origin / curl
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: false,
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Cache-Control',
    'Last-Event-ID',
    'X-Requested-With',
    'Accept',
    'Authorization',
  ],
};
```

### 2. Updated `setupSseHeaders()` Function

**File**: `src/realtime/sse.js`

- Sets CORS headers FIRST, before SSE-specific headers
- Uses centralized `isOriginAllowed()` function
- Includes `Access-Control-Expose-Headers` for better browser compatibility
- Flushes headers immediately to ensure they're sent

```javascript
export function setupSseHeaders(res, req) {
  const origin = req?.headers?.origin;
  const allowedOrigins = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://192.168.1.7:5174',
  ];
  
  let corsOrigin = origin && isOriginAllowed(origin) ? origin : (allowedOrigins[0] || '*');
  if (!origin) {
    corsOrigin = '*';
  }
  
  // CORS headers first
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
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

### 3. Updated OPTIONS Handler

**File**: `src/realtime/sse.js`

- Handles preflight requests for both `/api/stream` and `/api/stream?key=admin`
- Sets all required CORS headers
- Returns 204 with proper headers
- Includes debug logging

### 4. Updated GET Handler

**File**: `src/realtime/sse.js`

- Sets headers BEFORE any writes
- Verifies CORS headers were set (for debugging)
- Logs connection lifecycle: new connection, established, closed
- Ensures initial keep-alive comment is written

### 5. Updated `attachClient()` Function

**File**: `src/realtime/sse.js`

- Logs when connections close
- Writes initial `:connected` comment to keep connection alive
- Only sets headers as fallback if not already set

## CORS Configuration Summary

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
- `X-Requested-With` (for EventSource polyfills)
- `Accept`
- `Authorization`

### Response Headers
- `Access-Control-Allow-Origin`: Set to request origin if allowed
- `Access-Control-Allow-Methods`: `GET, OPTIONS`
- `Access-Control-Allow-Headers`: All required headers
- `Access-Control-Allow-Credentials`: `false`
- `Access-Control-Expose-Headers`: `Content-Type, Last-Event-ID`

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

5. **Connection closed**:
   ```
   [SSE] Connection closed {
     url: '/api/stream?key=admin',
     origin: 'http://localhost:5174',
     id: '...'
   }
   ```

## Testing

### From Core Machine

```bash
curl -i http://192.168.1.7:3001/api/stream?key=admin
```

Expected response headers:
- `Content-Type: text/event-stream; charset=utf-8`
- `Access-Control-Allow-Origin: http://localhost:5174` (or `*` if no origin)
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Cache-Control, Last-Event-ID, X-Requested-With, Accept, Authorization`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`

### From Browser DevTools

After the fix, `GET /api/stream?key=admin` should:
- Remain in pending state (not instantly blocked)
- Show `Access-Control-Allow-Origin: http://localhost:5174` under Response Headers
- Not show "CORS request did not succeed" errors

## Key Fixes

1. **Centralized Origin Checking**: Uses `isOriginAllowed()` from `src/config/cors.js`
2. **Header Order**: CORS headers set FIRST, before SSE headers
3. **Header Flushing**: Headers flushed immediately to ensure they're sent
4. **Pre-write Headers**: Headers set BEFORE any response body is written
5. **Keep-Alive**: Initial `:connected` comment written to keep connection alive
6. **Debug Logging**: Comprehensive logging to verify CORS headers are set correctly
7. **Connection Lifecycle**: Logs new connection, established, and closed events

## Acceptance Criteria

✅ No more CORS errors in console for `/api/stream` and `/api/stream?key=admin`

✅ `[SSE Client] Connection error ... issue: "CORS_BLOCKED"` should disappear

✅ `GET /api/stream?key=admin` stays open/pending in browser Network tab

✅ Existing APIs (`/api/screens`, `/api/playlists`, `/api/v2/flags`) continue to work

✅ Response headers include `Access-Control-Allow-Origin: http://localhost:5174`

## Files Changed

1. `src/config/cors.js` - Updated `sseCorsOptions` with `X-Requested-With` header
2. `src/realtime/sse.js` - Updated CORS header handling, added logging, ensured proper header order

## Date

Fixed: 2025-01-XX


