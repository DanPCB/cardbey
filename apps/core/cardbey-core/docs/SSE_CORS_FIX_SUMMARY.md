# SSE CORS Fix Summary

## Overview

Fixed CORS configuration for SSE endpoints (`/api/stream` and `/api/stream?key=admin`) to allow connections from the marketing dashboard at `http://localhost:5174`.

## Changes Made

### 1. Updated CORS Configuration

**File**: `src/config/cors.js`

Updated `sseCorsOptions` to include all headers that EventSource may send:

```javascript
export const sseCorsOptions = {
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: false, // SSE doesn't need credentials
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Cache-Control',
    'Last-Event-ID',
    'Accept',
    'Authorization',
  ],
};
```

### 2. SSE Route Registration

**File**: `src/realtime/sse.js`

SSE routes are properly configured with CORS middleware:

```javascript
// OPTIONS handler for CORS preflight
router.options('/stream', cors(sseCorsOptions), (req, res) => {
  return res.sendStatus(204);
});

// GET handler for SSE stream
// Handles both /api/stream and /api/stream?key=admin
router.get('/stream', cors(sseCorsOptions), (req, res, next) => {
  // Log connection with full details
  console.log('[SSE] stream connected', {
    url: req.originalUrl,
    origin: req.headers.origin,
    ip: req.ip,
    key: req.query?.key || 'none',
  });
  
  // Setup SSE-specific headers (CORS already handled by middleware)
  setupSseHeaders(res);
  
  // Attach client and start stream
  attachClient(req, res, { label: `router-${label}` });
});
```

### 3. SSE Headers Setup

**File**: `src/realtime/sse.js`

The `setupSseHeaders()` function only sets non-CORS headers:

```javascript
export function setupSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}
```

**Important**: No `Access-Control-*` headers are set manually. The `cors()` middleware handles all CORS headers automatically.

### 4. Global CORS Middleware

**File**: `src/server.js`

Global CORS middleware is applied before SSE routes:

```javascript
import { corsOptions } from './config/cors.js';

// Global CORS middleware for all routes
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
```

SSE routes are mounted early:

```javascript
// MOUNT EARLY (before other routers and before any SPA fallback)
app.use('/api', realtimeRoutes);  // Contains /api/stream
```

## Allowed Origins

Origins are checked against whitelist in `src/config/cors.js`:
- `http://localhost:5174` ✅
- `http://127.0.0.1:5174` ✅
- `http://192.168.1.7:5174` ✅
- Plus any origins from environment variables

## Verification Steps

### 1. Start Core and Dashboard

1. Start core: `npm start` (runs on `http://192.168.1.7:3001`)
2. Start dashboard: `npm run dev` (runs on `http://localhost:5174`)

### 2. Check Browser DevTools

Open Screen Management page in dashboard, then check DevTools → Network:

1. **OPTIONS Request** (preflight):
   - Should see `OPTIONS /api/stream?key=admin`
   - Status: `204 No Content`
   - Response headers must include:
     - `Access-Control-Allow-Origin: http://localhost:5174`
     - `Access-Control-Allow-Methods: GET,OPTIONS`
     - `Access-Control-Allow-Headers: Content-Type, Cache-Control, Last-Event-ID, Accept, Authorization`

2. **GET Request** (SSE connection):
   - Should see `GET /api/stream?key=admin` (type: `eventsource`)
   - Status: `200 OK`
   - Response headers must include:
     - `Access-Control-Allow-Origin: http://localhost:5174`
     - `Content-Type: text/event-stream; charset=utf-8`
     - `Cache-Control: no-cache, no-transform`
     - `Connection: keep-alive`

3. **No CORS Errors**:
   - Console should NOT show "CORS request did not succeed"
   - Console should NOT show "connection interrupted"
   - SSE client should show connection successful

### 3. Check Core Console

You should see logs like:

```
[SSE] stream connected {
  url: '/api/stream?key=admin',
  origin: 'http://localhost:5174',
  ip: '::ffff:192.168.1.100',
  key: 'admin',
  label: 'admin'
}
```

### 4. Test SSE Events

Trigger any SSE broadcast (system ping, screen heartbeat, etc.) and confirm:
- Events arrive in dashboard's SSE client
- No errors in browser console
- Connection stays open

## Files Changed

1. **`src/config/cors.js`** - Updated `sseCorsOptions` with all required headers
2. **`src/realtime/sse.js`** - Improved logging, ensured no manual CORS headers
3. **`src/routes/sse.routes.js`** - Improved logging, ensured no manual CORS headers
4. **`src/server.js`** - Uses normalized `corsOptions` (already correct)

## Key Points

- ✅ CORS headers are handled by `cors()` middleware, not manually
- ✅ SSE routes use `sseCorsOptions` with `credentials: false`
- ✅ All EventSource headers are allowed: `Content-Type`, `Cache-Control`, `Last-Event-ID`, `Accept`, `Authorization`
- ✅ Logging shows connection details for debugging
- ✅ No conflicting manual CORS headers in SSE handlers
- ✅ Routes are mounted early to ensure CORS middleware runs

## Troubleshooting

If CORS errors persist:

1. **Check origin whitelist**: Verify `http://localhost:5174` is in `BASE_WHITELIST` in `src/config/cors.js`
2. **Check middleware order**: Ensure `app.use(cors(corsOptions))` is before route mounting
3. **Check for manual headers**: Search for `Access-Control-Allow-Origin` in SSE handler files
4. **Check browser console**: Look for specific CORS error messages
5. **Check core logs**: Look for `[SSE] stream connected` logs to confirm requests reach the server

## Date

Fixed: 2025-01-XX


